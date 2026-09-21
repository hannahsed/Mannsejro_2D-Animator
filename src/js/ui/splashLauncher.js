// src/js/ui/splashLauncher.js
import {
  loadLatestProject,
  listProjectsFromLibrary,
  getProjectFromLibrary,
  deleteProjectFromLibrary,
  saveProjectToLibrary,
  isProjectStructurallySound,
} from '../persistence.js';
import { createBlankProject, createBouncingBallProject } from '../templates.js';
import { showToast } from './toast.js';

export class SplashLauncher {
  constructor(onLaunchProject) {
    this.onLaunch = onLaunchProject;
    this.selectedW = 1920;
    this.selectedH = 1080;
    this.selectedFPS = 24;
    this.selectedBg = '#ffffff';
    this.recentProject = null;
    this.projectToDeleteId = null;

    this.initDOM();
    this.initProjectManager();
  }

  initDOM() {
    const splash = document.getElementById('splash-screen');
    if (!splash) return;

    // 1. Aspect Ratio Buttons
    const aspectBtns = document.querySelectorAll('.aspect-btn');
    const resPreview = document.getElementById('setup-res-preview');

    aspectBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        aspectBtns.forEach((b) => {
          b.classList.remove('active-aspect', 'border-orange-500', 'bg-orange-500/15', 'text-orange-300');
          b.classList.add('border-slate-800', 'bg-slate-900/50', 'text-slate-400');
        });
        btn.classList.add('active-aspect', 'border-orange-500', 'bg-orange-500/15', 'text-orange-300');
        btn.classList.remove('border-slate-800', 'bg-slate-900/50', 'text-slate-400');

        this.selectedW = parseInt(btn.dataset.w, 10);
        this.selectedH = parseInt(btn.dataset.h, 10);
        if (resPreview) {
          resPreview.textContent = `${this.selectedW} × ${this.selectedH} (${btn.dataset.ratio})`;
        }
      });
    });

    // 2. Framerate Buttons
    const fpsBtns = document.querySelectorAll('.fps-btn');
    fpsBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        fpsBtns.forEach((b) => {
          b.classList.remove('active-fps', 'bg-orange-500', 'text-white', 'font-bold', 'shadow-xs');
          b.classList.add('text-slate-400');
        });
        btn.classList.add('active-fps', 'bg-orange-500', 'text-white', 'font-bold', 'shadow-xs');
        btn.classList.remove('text-slate-400');
        this.selectedFPS = parseInt(btn.dataset.fps, 10);
      });
    });

    // 3. Background Color Selector
    const bgBtns = document.querySelectorAll('.bg-color-btn');
    bgBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        bgBtns.forEach((b) => {
          b.classList.remove('active-bg', 'bg-slate-800', 'text-white', 'font-bold', 'shadow-xs');
          b.classList.add('text-slate-400');
        });
        btn.classList.add('active-bg', 'bg-slate-800', 'text-white', 'font-bold', 'shadow-xs');
        btn.classList.remove('text-slate-400');
        this.selectedBg = btn.dataset.bg;
      });
    });

    // 4. "Resume Last Session" Hero Button
    document.getElementById('btn-launcher-resume')?.addEventListener('click', () => {
      if (this.recentProject) {
        this.dismissAndLaunch(this.recentProject);
      }
    });

    // 5. "Squash & Stretch Demo" Button
    document.getElementById('btn-launcher-ball-demo')?.addEventListener('click', async () => {
      const demo = await createBouncingBallProject();
      await saveProjectToLibrary(demo, true);
      this.dismissAndLaunch(demo);
    });

    // 6. Open Backup JSON File
    const fileInput = document.getElementById('launcher-file-input');
    fileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const proj = parsed.project || parsed;
        if (isProjectStructurallySound(proj)) {
          await saveProjectToLibrary(proj, true);
          this.dismissAndLaunch(proj);
        } else {
          showToast('Invalid project file format', 'error');
        }
      } catch (err) {
        showToast('Failed to parse project JSON', 'error');
      } finally {
        e.target.value = '';
      }
    });

    // 7. Create New Project Button
    document.getElementById('btn-launcher-start')?.addEventListener('click', () => {
      const nameInput = document.getElementById('setup-project-name');
      const projName = nameInput?.value.trim() || `Animation_${new Date().toISOString().slice(5, 10)}`;
      const freshProject = createBlankProject(projName, this.selectedW, this.selectedH, this.selectedFPS);
      freshProject.backgroundColor = this.selectedBg;

      // Automatically persist to system vault in background
      saveProjectToLibrary(freshProject, true).catch((e) => {
        console.warn('[CrashGuard] Save error on create:', e);
      });

      this.dismissAndLaunch(freshProject);
    });

    // 8. Delete Project Modal Listeners
    const deleteModal = document.getElementById('delete-project-modal');
    document.getElementById('btn-cancel-delete')?.addEventListener('click', () => {
      if (deleteModal) deleteModal.classList.add('hidden');
      this.projectToDeleteId = null;
    });

    document.getElementById('btn-confirm-delete')?.addEventListener('click', async () => {
      if (!this.projectToDeleteId) return;
      const id = this.projectToDeleteId;
      if (deleteModal) deleteModal.classList.add('hidden');
      this.projectToDeleteId = null;

      const success = await deleteProjectFromLibrary(id);
      if (success) {
        showToast('Project file removed from storage vault', 'info');
        await this.refreshProjectLibrary();
      } else {
        showToast('Failed to delete project', 'error');
      }
    });

    // 9. Enter Key to Launch
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !splash.classList.contains('hidden')) {
        const deleteModal = document.getElementById('delete-project-modal');
        if (deleteModal && !deleteModal.classList.contains('hidden')) return;

        if (e.target.tagName !== 'INPUT' || e.target.id === 'setup-project-name') {
          e.preventDefault();
          document.getElementById('btn-launcher-start')?.click();
        }
      }
    });
  }

  /**
   * Initializes and loads all project sessions from system storage
   */
  async initProjectManager() {
    await this.refreshProjectLibrary();
  }

  /**
   * Refreshes the project list and the top quick-resume card
   */
  async refreshProjectLibrary() {
    const listEl = document.getElementById('launcher-projects-list');
    const countEl = document.getElementById('launcher-files-count');
    const heroCard = document.getElementById('launcher-resume-hero');
    const recentNameEl = document.getElementById('launcher-recent-name');
    const recentFramesEl = document.getElementById('launcher-recent-frames');
    const recentResEl = document.getElementById('launcher-recent-res');
    const recentFpsEl = document.getElementById('launcher-recent-fps');
    const recentTimeEl = document.getElementById('launcher-recent-time');
    const resumeBtn = document.getElementById('btn-launcher-resume');

    try {
      const projects = await listProjectsFromLibrary();

      // Update count badge
      if (countEl) {
        countEl.textContent = `${projects.length} File${projects.length === 1 ? '' : 's'}`;
      }

      // 1. Update Hero Card with latest active session
      const latestProject = await loadLatestProject();
      if (latestProject && isProjectStructurallySound(latestProject)) {
        this.recentProject = latestProject;
        if (recentNameEl) recentNameEl.textContent = latestProject.name || 'Untitled';
        if (recentFramesEl) recentFramesEl.textContent = `${latestProject.frames.length} Frame${latestProject.frames.length > 1 ? 's' : ''}`;
        if (recentResEl) recentResEl.textContent = `${latestProject.width} × ${latestProject.height} px`;
        if (recentFpsEl) recentFpsEl.textContent = `${latestProject.fps || 24} FPS`;
        if (recentTimeEl) recentTimeEl.textContent = `Auto-saved to vault`;
        if (resumeBtn) {
          resumeBtn.disabled = false;
          resumeBtn.classList.remove('opacity-40', 'cursor-not-allowed');
        }
        if (heroCard) heroCard.classList.remove('opacity-50');
      } else {
        this.recentProject = null;
        if (recentNameEl) recentNameEl.textContent = 'No previous session';
        if (recentFramesEl) recentFramesEl.textContent = '0 Frames';
        if (recentResEl) recentResEl.textContent = '1920 × 1080 px';
        if (recentFpsEl) recentFpsEl.textContent = '24 FPS';
        if (recentTimeEl) recentTimeEl.textContent = 'Ready';
        if (resumeBtn) {
          resumeBtn.disabled = true;
          resumeBtn.classList.add('opacity-40', 'cursor-not-allowed');
        }
        if (heroCard) heroCard.classList.add('opacity-50');
      }

      // 2. Render all created files in the list
      if (!listEl) return;

      if (projects.length === 0) {
        listEl.innerHTML = `
          <div class="py-10 px-4 text-center space-y-2 border border-dashed border-slate-800 rounded-xl bg-slate-900/30">
            <svg class="w-8 h-8 mx-auto text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div class="text-xs font-semibold text-slate-300">No Saved Projects Yet</div>
            <p class="text-[11px] text-slate-500 max-w-xs mx-auto">Create a new animation on the right to start drafting. Every stroke will be automatically crash-guarded.</p>
          </div>
        `;
        return;
      }

      listEl.innerHTML = '';

      projects.forEach((proj) => {
        const timeAgo = this.formatTimeAgo(proj.lastModified);
        const isCurrent = Boolean(this.recentProject && this.recentProject.id === proj.id);

        const card = document.createElement('div');
        card.className = `group p-3 rounded-xl border transition flex items-center justify-between gap-3 ${
          isCurrent
            ? 'bg-slate-900/90 border-orange-500/50 hover:border-orange-500'
            : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
        }`;

        card.innerHTML = `
          <div class="min-w-0 flex-1 space-y-1 cursor-pointer select-none" data-action="open" data-id="${proj.id}">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-white group-hover:text-orange-300 truncate">${this.escapeHTML(proj.name)}</span>
              ${
                isCurrent
                  ? '<span class="text-[9px] font-mono px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-400 font-bold border border-orange-500/30 shrink-0">Current</span>'
                  : ''
              }
            </div>
            <div class="flex items-center gap-2 text-[10px] font-mono text-slate-400">
              <span>${proj.width}×${proj.height}</span>
              <span>•</span>
              <span>${proj.fps} FPS</span>
              <span>•</span>
              <span>${proj.frameCount} frame${proj.frameCount === 1 ? '' : 's'}</span>
              <span>•</span>
              <span class="text-slate-500">${timeAgo}</span>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button class="btn-open-proj p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/80 transition" title="Open Project" data-action="open" data-id="${proj.id}">
              <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg>
            </button>
            <button class="btn-delete-proj p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/15 transition" title="Delete Project" data-action="delete" data-id="${proj.id}" data-name="${this.escapeHTML(proj.name)}">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        `;

        // Click on row to open
        card.querySelector('[data-action="open"]')?.addEventListener('click', async () => {
          await this.loadAndLaunchProjectById(proj.id);
        });

        // Click open button
        card.querySelector('.btn-open-proj')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.loadAndLaunchProjectById(proj.id);
        });

        // Click delete button
        card.querySelector('.btn-delete-proj')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.promptDeleteProject(proj.id, proj.name);
        });

        listEl.appendChild(card);
      });
    } catch (err) {
      console.warn('[SplashLauncher] Error refreshing library:', err);
    }
  }

  promptDeleteProject(id, name) {
    this.projectToDeleteId = id;
    const modal = document.getElementById('delete-project-modal');
    const desc = document.getElementById('delete-project-desc');
    if (desc) {
      desc.textContent = `Are you sure you want to permanently delete "${name || 'this project'}"? All frames, layers, and drawings in this file will be erased from your system storage.`;
    }
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  async loadAndLaunchProjectById(projectId) {
    try {
      const proj = await getProjectFromLibrary(projectId);
      if (proj && isProjectStructurallySound(proj)) {
        this.dismissAndLaunch(proj);
      } else {
        showToast('Could not load project file', 'error');
      }
    } catch (e) {
      showToast('Error opening project', 'error');
    }
  }

  formatTimeAgo(timestamp) {
    if (!timestamp) return 'Recently';
    const now = Date.now();
    const diff = Math.max(0, now - timestamp);
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return 'Just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  escapeHTML(str) {
    if (!str) return 'Untitled';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  show() {
    const splash = document.getElementById('splash-screen');
    const card = document.getElementById('launcher-card');

    if (splash) {
      splash.classList.remove('hidden');
      splash.style.display = 'flex';
      splash.style.opacity = '1';
      splash.style.pointerEvents = 'auto';
    }

    if (card) {
      card.style.pointerEvents = 'auto';
      card.style.transform = 'scale(1) translateY(0)';
      card.style.opacity = '1';
    }

    this.refreshProjectLibrary();
  }

  dismissAndLaunch(project) {
    const splash = document.getElementById('splash-screen');
    const card = document.getElementById('launcher-card');

    if (card) {
      card.style.pointerEvents = 'none';
      card.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease';
      card.style.transform = 'scale(0.96) translateY(-10px)';
      card.style.opacity = '0';
    }

    if (splash) {
      splash.style.pointerEvents = 'none';
      splash.style.transition = 'opacity 0.25s ease';
      splash.style.opacity = '0';
      setTimeout(() => {
        splash.classList.add('hidden');
        splash.style.display = 'none';
      }, 250);
    }

    if (this.onLaunch && project) {
      try {
        this.onLaunch(project);
      } catch (err) {
        console.error('[SplashLauncher] Error launching project:', err);
      }
    }
  }
}
