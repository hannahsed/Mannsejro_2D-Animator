// src/js/telemetry/crashReporter.js
/**
 * GLOBAL CRASH BOUNDARY & EMERGENCY RESCUE VAULT
 * Captures unhandled runtime errors, saves an emergency snapshot,
 * and prevents catastrophic data loss.
 */

import { state } from '../state/appState.js';

class CrashReporter {
  constructor() {
    this.breadcrumbs = []; // Circular buffer of last 20 actions
    this.maxBreadcrumbs = 20;
    this.hasCrashed = false;
  }

  init() {
    // 1. Unhandled Synchronous Exceptions
    window.onerror = (message, source, lineno, colno, error) => {
      this.handleCrash('Uncaught Exception', { message, source, lineno, colno, stack: error?.stack });
      return false; // Allow standard console logging
    };

    // 2. Unhandled Asynchronous Promise Rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.handleCrash('Unhandled Promise Rejection', {
        reason: event.reason?.message || event.reason,
        stack: event.reason?.stack
      });
    });

    // 3. Canvas Hardware Context Loss
    const canvas = document.getElementById('viewport-canvas');
    if (canvas) {
      canvas.addEventListener('contextlost', (e) => {
        e.preventDefault();
        this.recordBreadcrumb('GPU Canvas Context Lost');
        this.handleCrash('GPU Device Lost', { message: 'The operating system or browser reset the GPU context.' });
      });
    }
  }

  /**
   * Records a user action for crash diagnosis.
   */
  recordBreadcrumb(actionDescription) {
    const entry = `[${new Date().toISOString().slice(11, 19)}] ${actionDescription}`;
    this.breadcrumbs.push(entry);
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  async handleCrash(type, errorDetails) {
    if (this.hasCrashed) return;
    this.hasCrashed = true;

    console.error(`[CRASH-GUARD ALERT] ${type}:`, errorDetails);

    let backupSuccess = false;
    let serializedProject = null;

    // 1. Attempt Emergency Snapshot from RAM
    try {
      if (state.project) {
        serializedProject = JSON.stringify({
          format: 'mannsejro-emergency-rescue',
          timestamp: new Date().toISOString(),
          project: state.project
        });
        localStorage.setItem('mannsejro_emergency_backup', serializedProject);
        backupSuccess = true;
      }
    } catch (e) {
      console.warn('[CrashGuard] LocalStorage emergency dump failed:', e);
    }

    // 2. Render Hardware Recovery Overlay
    this.renderRecoveryModal(type, errorDetails, backupSuccess, serializedProject);
  }

  renderRecoveryModal(type, details, backupSuccess, serializedProject) {
    const overlay = document.createElement('div');
    overlay.id = 'crash-recovery-overlay';
    overlay.className = 'fixed inset-0 z-[99999] bg-zinc-950/95 backdrop-blur-2xl flex items-center justify-center p-6 select-none font-sans';

    const breadcrumbsText = this.breadcrumbs.join('\n');
    const errorStack = details.stack || details.message || 'No stack trace available';

    overlay.innerHTML = `
      <div class="max-w-xl w-full bg-zinc-900 border border-rose-500/50 rounded-3xl shadow-2xl p-6 md:p-8 space-y-5 text-zinc-100">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center text-xl font-bold">
            ⚠
          </div>
          <div>
            <h2 class="text-lg font-bold text-zinc-100">Application Interruption Recovered</h2>
            <p class="text-xs text-zinc-400">An unexpected system state occurred, but your workspace was intercepted.</p>
          </div>
        </div>

        <div class="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2 font-mono text-[11px]">
          <div class="flex justify-between items-center text-zinc-400">
            <span>Safety Backup:</span>
            <span class="${backupSuccess ? 'text-emerald-400 font-bold' : 'text-rose-400'}">
              ${backupSuccess ? '✓ Preserved in Memory' : '✗ Storage Full'}
            </span>
          </div>
          <div class="text-rose-400 truncate"><b>Error:</b> ${details.message || type}</div>
        </div>

        <!-- Technical Diagnostic Log -->
        <div class="space-y-1">
          <span class="text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-mono">Recent Activity Breadcrumbs</span>
          <pre class="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80 text-[10px] font-mono text-zinc-400 overflow-x-auto max-h-24 select-text">${breadcrumbsText}</pre>
        </div>

        <!-- Recovery Action Buttons -->
        <div class="flex items-center justify-between pt-2">
          <button id="btn-copy-crash-log" class="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 transition">
            Copy Diagnostic Log
          </button>
          <div class="flex gap-2">
            ${backupSuccess ? `
              <button id="btn-download-rescue-file" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition">
                Download Rescue File (.json)
              </button>
            ` : ''}
            <button id="btn-reload-studio" class="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold shadow-md transition">
              Restart Studio
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('btn-copy-crash-log')?.addEventListener('click', () => {
      const fullLog = `Type: ${type}\nDetails: ${JSON.stringify(details, null, 2)}\n\nBreadcrumbs:\n${breadcrumbsText}`;
      navigator.clipboard.writeText(fullLog).then(() => alert('Crash log copied to clipboard.'));
    });

    document.getElementById('btn-download-rescue-file')?.addEventListener('click', () => {
      if (!serializedProject) return;
      const blob = new Blob([serializedProject], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `emergency_rescue_${Date.now()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    });

    document.getElementById('btn-reload-studio')?.addEventListener('click', () => {
      window.location.reload();
    });
  }
}

export const crashReporter = new CrashReporter();
