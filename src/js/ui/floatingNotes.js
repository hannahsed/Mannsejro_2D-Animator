// src/js/ui/floatingNotes.js
import { state } from '../state/appState.js';
import { showToast } from './toast.js';

const STORAGE_KEY_REPORTS = 'mannsejro_reports_catalog_v2';
const STORAGE_KEY_ACTIVE_ID = 'mannsejro_active_report_id_v2';
const STORAGE_KEY_POS = 'mannsejro_notes_btn_pos';

export class FloatingNotesManager {
  constructor() {
    this.isOpen = false;
    this.btn = null;
    this.modal = null;

    this.reports = [];
    this.activeReportId = null;

    this.isDragging = false;
    this.dragMoved = false;
    this.dragStart = { x: 0, y: 0 };
    this.btnPos = { x: 0, y: 0 };

    this.init();
  }

  init() {
    this.loadReportsFromStorage();
    this.createFloatingButton();
    this.createModal();
    this.attachHeaderButton();
    this.attachGlobalShortcuts();

    // Global rescue hook available from browser console anytime
    window.openTesterNotes = () => this.openModal();
    window.exportTesterNotes = () => this.forceExportRecoveryFile();
  }

  /**
   * Deep Scanner: Checks every known storage key to guarantee zero lost data
   */
  loadReportsFromStorage() {
    this.reports = [];

    // 1. Check Primary Multi-Report Catalog v2
    try {
      const rawV2 = localStorage.getItem(STORAGE_KEY_REPORTS);
      if (rawV2) {
        const parsed = JSON.parse(rawV2);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.reports = parsed;
        }
      }
    } catch (_) {}

    // 2. Check Legacy Single Note
    if (this.reports.length === 0) {
      try {
        const legacyNote = localStorage.getItem('mannsejro_tester_notes');
        if (legacyNote && legacyNote.trim()) {
          this.reports.push({
            id: `rep_${Date.now()}`,
            num: 1,
            title: 'Recovered Testing Notes (Pre-Crash)',
            category: 'bug',
            severity: 'moderate',
            content: legacyNote,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      } catch (_) {}
    }

    // 3. Check v1 Catalog
    if (this.reports.length === 0) {
      try {
        const rawV1 = localStorage.getItem('mannsejro_reports_catalog_v1');
        if (rawV1) {
          const parsed = JSON.parse(rawV1);
          if (Array.isArray(parsed)) this.reports = parsed;
        }
      } catch (_) {}
    }

    // 4. Default Seed if entirely empty
    if (this.reports.length === 0) {
      this.reports = [
        {
          id: `rep_${Date.now()}`,
          num: 1,
          title: 'General Feedback & Observations',
          category: 'bug',
          severity: 'moderate',
          content: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
    }

    // Ensure all reports have numbers
    this.reports.forEach((r, idx) => {
      r.num = idx + 1;
    });

    const lastActiveId = localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
    const found = this.reports.find((r) => r.id === lastActiveId);
    this.activeReportId = found ? found.id : this.reports[0].id;

    this.saveReportsToStorage();
  }

  saveReportsToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(this.reports));
      // Backup to legacy single-note key as extra safety layer
      const compiledText = this.reports.map((r) => `## ${r.title}\n${r.content}`).join('\n\n');
      localStorage.setItem('mannsejro_tester_notes', compiledText);
      if (this.activeReportId) {
        localStorage.setItem(STORAGE_KEY_ACTIVE_ID, this.activeReportId);
      }
    } catch (_) {}

    this.updateBadges();
    this.pulseSavedIndicator();
  }

  createFloatingButton() {
    this.btn = document.createElement('div');
    this.btn.id = 'floating-notes-btn';
    this.btn.title = 'Tester Notes (Click to open, Drag to move)';
    this.btn.className =
      'fixed z-[150] w-12 h-12 rounded-full bg-gradient-to-tr from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-slate-950 flex items-center justify-center shadow-2xl shadow-orange-500/35 border-2 border-white/90 cursor-grab active:cursor-grabbing select-none transition-transform hover:scale-105 active:scale-95';

    this.btn.innerHTML = `
      <svg class="w-6 h-6 fill-current pointer-events-none" viewBox="0 0 24 24">
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2zm0-4H7V7h10v2z"/>
      </svg>
      <span id="floating-btn-count" class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-slate-950 text-orange-400 border border-orange-400/80 rounded-full text-[10px] font-mono font-bold flex items-center justify-center shadow-md">1</span>
    `;

    // HARDENED POSITIONING: Prevents button from ever disappearing off-screen after crashes
    const defaultX = Math.max(16, (window.innerWidth || 1024) - 76);
    const defaultY = Math.max(16, (window.innerHeight || 768) - 140);
    let savedPos = null;

    try {
      savedPos = JSON.parse(localStorage.getItem(STORAGE_KEY_POS));
    } catch (_) {}

    if (savedPos && typeof savedPos.x === 'number' && !isNaN(savedPos.x) && savedPos.x > 0 && savedPos.x < window.innerWidth) {
      this.btnPos = savedPos;
    } else {
      this.btnPos = { x: defaultX, y: defaultY };
    }

    this.clampPosition();
    this.updateButtonPosition();

    this.btn.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this.onPointerUp(e));

    window.addEventListener('resize', () => {
      this.clampPosition();
      this.updateButtonPosition();
    });

    document.body.appendChild(this.btn);
    this.updateBadges();
  }

  attachHeaderButton() {
    const headerBtn = document.getElementById('btn-header-open-notes');
    headerBtn?.addEventListener('click', () => {
      this.openModal();
    });
    this.updateBadges();
  }

  updateBadges() {
    const count = this.reports.length;
    const floatingBadge = this.btn?.querySelector('#floating-btn-count');
    if (floatingBadge) floatingBadge.textContent = count;
    const headerBadge = document.getElementById('header-notes-badge');
    if (headerBadge) headerBadge.textContent = count;
  }

  updateButtonPosition() {
    if (!this.btn) return;
    this.btn.style.left = `${this.btnPos.x}px`;
    this.btn.style.top = `${this.btnPos.y}px`;
  }

  clampPosition() {
    const pad = 12;
    const btnW = 48;
    const btnH = 48;
    const maxW = Math.max(100, window.innerWidth || 1024);
    const maxH = Math.max(100, window.innerHeight || 768);
    this.btnPos.x = Math.max(pad, Math.min(maxW - btnW - pad, this.btnPos.x));
    this.btnPos.y = Math.max(pad, Math.min(maxH - btnH - pad, this.btnPos.y));
  }

  onPointerDown(e) {
    if (e.button !== 0) return;
    e.stopPropagation();
    this.isDragging = true;
    this.dragMoved = false;
    this.dragStart = { x: e.clientX, y: e.clientY };

    try {
      this.btn.setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  onPointerMove(e) {
    if (!this.isDragging) return;
    e.stopPropagation();

    const dx = e.clientX - this.dragStart.x;
    const dy = e.clientY - this.dragStart.y;

    if (Math.hypot(dx, dy) > 4) {
      this.dragMoved = true;
    }

    this.btnPos.x += dx;
    this.btnPos.y += dy;
    this.clampPosition();
    this.updateButtonPosition();

    this.dragStart = { x: e.clientX, y: e.clientY };
  }

  onPointerUp(e) {
    if (!this.isDragging) return;
    this.isDragging = false;

    try {
      if (this.btn.hasPointerCapture(e.pointerId)) {
        this.btn.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}

    if (this.dragMoved) {
      try {
        localStorage.setItem(STORAGE_KEY_POS, JSON.stringify(this.btnPos));
      } catch (_) {}
    } else {
      this.toggleModal();
    }
  }

  createModal() {
    this.modal = document.createElement('div');
    this.modal.id = 'tester-reports-modal';
    this.modal.className =
      'fixed inset-0 z-[160] flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-md select-none hidden transition-opacity duration-150';

    this.modal.innerHTML = `
      <div class="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[85vh] max-h-[720px] ring-1 ring-white/10 animate-in fade-in zoom-in-95 duration-150">
        
        <!-- Header Bar -->
        <div class="px-5 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-xl bg-orange-500/20 border border-orange-500/40 text-orange-400 flex items-center justify-center font-bold text-sm">
              📋
            </div>
            <div>
              <div class="text-sm font-bold text-white flex items-center gap-2">
                <span>Studio Testing Dossier</span>
                <span id="reports-save-badge" class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  <span>Auto-saved</span>
                </span>
              </div>
              <div class="text-[10px] text-slate-400 font-mono">Every character is preserved safely across reloads and crashes</div>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button id="btn-header-new-report" class="px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-slate-950 font-bold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer">
              <span>+ New Report</span>
            </button>
            <button id="btn-close-reports-modal" class="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <!-- Main Body: Two-Column Master/Detail Layout -->
        <div class="flex-1 flex overflow-hidden">
          
          <!-- LEFT COLUMN: Reports Catalog / Switcher -->
          <div class="w-64 sm:w-72 bg-slate-950/60 border-r border-slate-800 flex flex-col shrink-0">
            <div class="p-3 border-b border-slate-800/80 flex items-center justify-between text-xs">
              <span class="font-bold text-slate-300 uppercase tracking-wider text-[10px] font-mono">Saved Reports</span>
              <span id="reports-count-label" class="text-[10px] font-mono text-orange-400 font-bold">1 file</span>
            </div>
            <div id="reports-list-container" class="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
              <!-- Rendered dynamically -->
            </div>
          </div>

          <!-- RIGHT COLUMN: Active Report Editor -->
          <div class="flex-1 flex flex-col bg-slate-900 overflow-hidden">
            
            <!-- Report Meta Header -->
            <div class="p-4 border-b border-slate-800/80 space-y-3 bg-slate-950/30 shrink-0">
              
              <!-- Report Title -->
              <div class="space-y-1">
                <div class="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span class="font-bold uppercase tracking-wider text-orange-400 flex items-center gap-1">
                    <span id="active-report-number-badge">REPORT #1</span>
                    <span>• Title</span>
                  </span>
                  <span id="active-report-time-label">Just now</span>
                </div>
                <input 
                  id="active-report-title-input" 
                  type="text" 
                  placeholder="Enter Report Title (e.g. Rendering Issue, Lineart Lag)..." 
                  class="w-full bg-slate-900 border border-slate-800 focus:border-orange-500/80 rounded-xl px-3 py-2 text-sm font-bold text-white outline-none shadow-inner transition placeholder-slate-600"
                />
              </div>

              <!-- Category & Severity Tagging -->
              <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div class="flex items-center gap-1 text-xs">
                  <span class="text-[10px] text-slate-500 font-mono mr-1">Category:</span>
                  <div class="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[10px] font-bold">
                    <button data-cat="bug" class="report-cat-btn px-2 py-0.5 rounded transition cursor-pointer">🐛 Bug</button>
                    <button data-cat="perf" class="report-cat-btn px-2 py-0.5 rounded transition cursor-pointer">⚡ Perf</button>
                    <button data-cat="ux" class="report-cat-btn px-2 py-0.5 rounded transition cursor-pointer">🎨 UX</button>
                    <button data-cat="idea" class="report-cat-btn px-2 py-0.5 rounded transition cursor-pointer">💡 Idea</button>
                  </div>
                </div>

                <div class="flex items-center gap-1 text-xs">
                  <span class="text-[10px] text-slate-500 font-mono mr-1">Severity:</span>
                  <div class="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[10px] font-bold">
                    <button data-sev="critical" class="report-sev-btn px-2 py-0.5 rounded text-rose-400 transition cursor-pointer">Critical</button>
                    <button data-sev="moderate" class="report-sev-btn px-2 py-0.5 rounded text-amber-400 transition cursor-pointer">Medium</button>
                    <button data-sev="low" class="report-sev-btn px-2 py-0.5 rounded text-emerald-400 transition cursor-pointer">Low</button>
                  </div>
                </div>
              </div>

              <!-- Environment Context Snapshot -->
              <div class="text-[10px] font-mono text-slate-400 bg-slate-900/80 border border-slate-800/80 rounded-lg px-2.5 py-1 flex items-center justify-between truncate">
                <span class="truncate text-slate-500" id="report-env-preview">Env: Chrome • 1920×1080 @ 2x</span>
                <button id="btn-insert-timestamp" class="text-orange-400 hover:text-orange-300 font-semibold cursor-pointer shrink-0 ml-2">
                  + Timestamp
                </button>
              </div>
            </div>

            <!-- Report Details Textarea -->
            <div class="flex-1 p-4 bg-slate-950/40 flex flex-col overflow-hidden">
              <textarea 
                id="active-report-content" 
                placeholder="Type your feedback, test notes, what happened, and what to improve...&#10;&#10;Every character is auto-saved."
                class="w-full h-full flex-1 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 text-xs font-mono text-slate-100 placeholder-slate-600 focus:border-orange-500/80 outline-none resize-none leading-relaxed custom-scrollbar shadow-inner"
              ></textarea>
            </div>

            <!-- Bottom Actions -->
            <div class="px-5 py-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs">
              <div class="text-[10px] font-mono text-slate-400">
                <span id="active-report-counts">0 chars • 0 words</span>
              </div>

              <div class="flex items-center gap-2">
                <button id="btn-delete-active-report" class="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-200 border border-slate-800 transition cursor-pointer">
                  Delete
                </button>
                <button id="btn-copy-active-report" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium border border-slate-700 transition cursor-pointer">
                  Copy #<span id="copy-active-num">1</span>
                </button>
                <button id="btn-export-dossier" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium border border-slate-700 transition flex items-center gap-1.5 cursor-pointer">
                  <svg class="w-3.5 h-3.5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  <span>Export (.md)</span>
                </button>
                <button id="btn-copy-compiled-dossier" class="px-4 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-slate-950 font-bold shadow-md transition active:scale-95 flex items-center gap-1.5 cursor-pointer">
                  <svg class="w-3.5 h-3.5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"/></svg>
                  <span>Copy Compiled Dossier</span>
                </button>
              </div>
            </div>

          </div>
        </div>

      </div>
    `;

    this.bindModalEvents();
    document.body.appendChild(this.modal);
  }

  bindModalEvents() {
    this.modal.addEventListener('pointerdown', (e) => {
      if (e.target === this.modal) this.closeModal();
    });

    this.modal.querySelector('#btn-close-reports-modal')?.addEventListener('click', () => this.closeModal());
    this.modal.querySelector('#btn-header-new-report')?.addEventListener('click', () => this.createNewReport());

    const titleInput = this.modal.querySelector('#active-report-title-input');
    titleInput?.addEventListener('input', (e) => {
      const active = this.getActiveReport();
      if (active) {
        active.title = e.target.value.trim() || 'Untitled Report';
        active.updatedAt = Date.now();
        this.saveReportsToStorage();
        this.renderReportsList();
      }
    });

    const textarea = this.modal.querySelector('#active-report-content');
    textarea?.addEventListener('input', (e) => {
      const active = this.getActiveReport();
      if (active) {
        active.content = e.target.value;
        active.updatedAt = Date.now();
        this.saveReportsToStorage();
        this.updateWordCharCounts();
      }
    });

    this.modal.querySelectorAll('.report-cat-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        const active = this.getActiveReport();
        if (active) {
          active.category = cat;
          active.updatedAt = Date.now();
          this.saveReportsToStorage();
          this.updateCategoryPills(cat);
          this.renderReportsList();
        }
      });
    });

    this.modal.querySelectorAll('.report-sev-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sev = btn.dataset.sev;
        const active = this.getActiveReport();
        if (active) {
          active.severity = sev;
          active.updatedAt = Date.now();
          this.saveReportsToStorage();
          this.updateSeverityPills(sev);
          this.renderReportsList();
        }
      });
    });

    this.modal.querySelector('#btn-insert-timestamp')?.addEventListener('click', () => {
      const active = this.getActiveReport();
      if (!active || !textarea) return;
      const now = new Date();
      const stamp = `[${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] `;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = textarea.value;
      textarea.value = val.substring(0, start) + '\n' + stamp + val.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + stamp.length + 1;
      textarea.focus();
      active.content = textarea.value;
      active.updatedAt = Date.now();
      this.saveReportsToStorage();
      this.updateWordCharCounts();
    });

    this.modal.querySelector('#btn-delete-active-report')?.addEventListener('click', () => {
      if (this.reports.length <= 1) {
        showToast('Keep at least 1 report in your dossier');
        return;
      }
      const active = this.getActiveReport();
      if (window.confirm(`Delete Report #${active.num}: "${active.title}"?`)) {
        this.reports = this.reports.filter((r) => r.id !== active.id);
        this.reports.forEach((r, idx) => (r.num = idx + 1));
        this.activeReportId = this.reports[0].id;
        this.saveReportsToStorage();
        this.renderReportsList();
        this.loadActiveReportIntoEditor();
        showToast('Report removed');
      }
    });

    this.modal.querySelector('#btn-copy-active-report')?.addEventListener('click', async () => {
      const active = this.getActiveReport();
      if (!active) return;
      const text = this.formatSingleReportMarkdown(active);
      await this.copyTextToClipboard(text);
      showToast(`Copied Report #${active.num} to clipboard!`);
    });

    this.modal.querySelector('#btn-copy-compiled-dossier')?.addEventListener('click', async () => {
      const fullDossier = this.formatFullDossierMarkdown();
      await this.copyTextToClipboard(fullDossier);
      showToast(`Copied all ${this.reports.length} compiled reports to clipboard!`);
    });

    this.modal.querySelector('#btn-export-dossier')?.addEventListener('click', () => {
      this.forceExportRecoveryFile();
    });
  }

  forceExportRecoveryFile() {
    const fullDossier = this.formatFullDossierMarkdown();
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `MannSejro_Compiled_Reports_${dateStamp}.md`;
    const blob = new Blob([fullDossier], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    showToast('Downloaded feedback report dossier (.md)');
  }

  createNewReport() {
    const nextNum = this.reports.length + 1;
    const newRep = {
      id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      num: nextNum,
      title: `Report #${nextNum} — Observation`,
      category: 'bug',
      severity: 'moderate',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deviceContext: this.captureEnvironmentSnapshot(),
    };

    this.reports.push(newRep);
    this.activeReportId = newRep.id;
    this.saveReportsToStorage();
    this.renderReportsList();
    this.loadActiveReportIntoEditor();

    const titleInput = this.modal.querySelector('#active-report-title-input');
    titleInput?.focus();
    titleInput?.select();
  }

  renderReportsList() {
    const listEl = this.modal?.querySelector('#reports-list-container');
    const countEl = this.modal?.querySelector('#reports-count-label');
    if (!listEl) return;

    listEl.innerHTML = '';
    if (countEl) countEl.textContent = `${this.reports.length} file${this.reports.length === 1 ? '' : 's'}`;

    this.reports.forEach((rep) => {
      const isActive = rep.id === this.activeReportId;
      const catBadge = this.getCategoryBadge(rep.category);
      const sevDot = this.getSeverityDot(rep.severity);

      const item = document.createElement('div');
      item.className = `group p-2.5 rounded-xl border transition cursor-pointer select-none ${
        isActive
          ? 'bg-slate-800 border-orange-500/80 shadow-md ring-1 ring-orange-500/20'
          : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700'
      }`;

      item.innerHTML = `
        <div class="flex items-center justify-between gap-1 mb-1">
          <span class="text-[10px] font-mono font-bold ${isActive ? 'text-orange-400' : 'text-slate-500'}">
            #${rep.num}
          </span>
          <div class="flex items-center gap-1.5">
            ${sevDot}
            ${catBadge}
          </div>
        </div>
        <div class="text-xs font-bold text-white truncate group-hover:text-orange-300">
          ${this.escapeHTML(rep.title)}
        </div>
        <div class="text-[10px] text-slate-500 font-mono truncate mt-0.5">
          ${rep.content.trim() ? rep.content.trim().slice(0, 35) + '…' : '(Empty report)'}
        </div>
      `;

      item.addEventListener('click', () => {
        this.activeReportId = rep.id;
        this.saveReportsToStorage();
        this.renderReportsList();
        this.loadActiveReportIntoEditor();
      });

      listEl.appendChild(item);
    });
  }

  loadActiveReportIntoEditor() {
    const active = this.getActiveReport();
    if (!active || !this.modal) return;

    const numBadge = this.modal.querySelector('#active-report-number-badge');
    const copyNum = this.modal.querySelector('#copy-active-num');
    const titleInput = this.modal.querySelector('#active-report-title-input');
    const textarea = this.modal.querySelector('#active-report-content');
    const timeLabel = this.modal.querySelector('#active-report-time-label');
    const envPreview = this.modal.querySelector('#report-env-preview');

    if (numBadge) numBadge.textContent = `REPORT #${active.num}`;
    if (copyNum) copyNum.textContent = active.num;
    if (titleInput) titleInput.value = active.title;
    if (textarea) textarea.value = active.content;
    if (timeLabel) timeLabel.textContent = `Updated ${new Date(active.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (envPreview) envPreview.textContent = active.deviceContext || this.captureEnvironmentSnapshot();

    this.updateCategoryPills(active.category);
    this.updateSeverityPills(active.severity);
    this.updateWordCharCounts();
  }

  updateCategoryPills(activeCat) {
    this.modal?.querySelectorAll('.report-cat-btn').forEach((btn) => {
      const isMatch = btn.dataset.cat === activeCat;
      btn.className = `report-cat-btn px-2 py-0.5 rounded transition cursor-pointer ${
        isMatch ? 'bg-orange-500 text-slate-950 font-bold shadow-xs' : 'text-slate-400 hover:text-white'
      }`;
    });
  }

  updateSeverityPills(activeSev) {
    this.modal?.querySelectorAll('.report-sev-btn').forEach((btn) => {
      const isMatch = btn.dataset.sev === activeSev;
      const color =
        btn.dataset.sev === 'critical'
          ? 'bg-rose-500 text-white'
          : btn.dataset.sev === 'moderate'
            ? 'bg-amber-500 text-slate-950'
            : 'bg-emerald-500 text-slate-950';

      btn.className = `report-sev-btn px-2 py-0.5 rounded transition cursor-pointer ${
        isMatch ? `${color} font-bold shadow-xs` : 'text-slate-400 hover:text-white'
      }`;
    });
  }

  updateWordCharCounts() {
    const text = this.modal?.querySelector('#active-report-content')?.value || '';
    const countsEl = this.modal?.querySelector('#active-report-counts');
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    if (countsEl) countsEl.textContent = `${text.length} chars • ${words} words`;
  }

  pulseSavedIndicator() {
    const badge = this.modal?.querySelector('#reports-save-badge');
    if (!badge) return;
    badge.className =
      'text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-200 font-bold border border-emerald-400 flex items-center gap-1';
    setTimeout(() => {
      if (badge) {
        badge.className =
          'text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1';
      }
    }, 280);
  }

  captureEnvironmentSnapshot() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const mode = state.engineMode === 'vector' ? 'Vector Space' : 'Pixel Space';
    const tool = state.currentTool || 'pencil';
    const fps = state.project?.fps || 24;
    return `Screen: ${w}×${h} @ ${dpr}x DPR | Mode: ${mode} | Tool: ${tool} | ${fps} FPS`;
  }

  formatSingleReportMarkdown(rep) {
    return [
      `================================================================`,
      `REPORT #${rep.num}: ${rep.title.toUpperCase()}`,
      `Category: ${rep.category.toUpperCase()} | Severity: ${rep.severity.toUpperCase()}`,
      `Environment: ${rep.deviceContext || this.captureEnvironmentSnapshot()}`,
      `Timestamp: ${new Date(rep.updatedAt).toLocaleString()}`,
      `================================================================`,
      `DETAILS / OBSERVATIONS:`,
      rep.content.trim() || '(No text entered)',
      ``,
    ].join('\n');
  }

  formatFullDossierMarkdown() {
    const header = [
      `# MANNSEJRO STUDIO — COMPILED TESTER REPORT DOSSIER`,
      `Total Reports: ${this.reports.length}`,
      `Exported: ${new Date().toLocaleString()}`,
      `Environment: ${this.captureEnvironmentSnapshot()}`,
      `\n`,
    ].join('\n');

    const body = this.reports.map((r) => this.formatSingleReportMarkdown(r)).join('\n\n');
    return header + body;
  }

  async copyTextToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const t = document.createElement('textarea');
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      document.body.removeChild(t);
    }
  }

  getCategoryBadge(cat) {
    switch (cat) {
      case 'perf':
        return `<span class="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">⚡ Perf</span>`;
      case 'ux':
        return `<span class="text-[9px] font-mono px-1 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">🎨 UX</span>`;
      case 'idea':
        return `<span class="text-[9px] font-mono px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">💡 Idea</span>`;
      case 'bug':
      default:
        return `<span class="text-[9px] font-mono px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">🐛 Bug</span>`;
    }
  }

  getSeverityDot(sev) {
    const color = sev === 'critical' ? 'bg-rose-500' : sev === 'moderate' ? 'bg-amber-400' : 'bg-emerald-400';
    return `<span class="w-1.5 h-1.5 rounded-full ${color}"></span>`;
  }

  escapeHTML(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  getActiveReport() {
    return this.reports.find((r) => r.id === this.activeReportId) || this.reports[0];
  }

  toggleModal() {
    if (this.isOpen) this.closeModal();
    else this.openModal();
  }

  openModal() {
    this.isOpen = true;
    this.modal.classList.remove('hidden');
    this.renderReportsList();
    this.loadActiveReportIntoEditor();
  }

  closeModal() {
    this.isOpen = false;
    this.modal.classList.add('hidden');
  }

  attachGlobalShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.closeModal();
        return;
      }
      // Alt + N shortcut to open notes from anywhere
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        this.toggleModal();
      }
    });
  }
}

let notesInstance = null;
export function initFloatingNotes() {
  if (!notesInstance && typeof window !== 'undefined') {
    notesInstance = new FloatingNotesManager();
  }
  return notesInstance;
}
