// src/js/ui/splashLauncher.js
import { loadLatestCrashResistantProject, isProjectStructurallySound } from '../persistence.js';
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
    this.localDirHandle = null;

    this.initDOM();
    this.loadRecentSessionPreview();
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
          b.classList.add('border-zinc-800', 'bg-zinc-950/40', 'text-zinc-400');
        });
        btn.classList.add('active-aspect', 'border-orange-500', 'bg-orange-500/15', 'text-orange-300');
        btn.classList.remove('border-zinc-800', 'bg-zinc-950/40', 'text-zinc-400');

        this.selectedW = parseInt(btn.dataset.w, 10);
        this.selectedH = parseInt(btn.dataset.h, 10);
        if (resPreview) {
          resPreview.textContent = `${this.selectedW} × ${this.selectedH} (${btn.dataset.ratio})`;
        }
      });
    });

    // 2. Framerate (FPS) Buttons
    const fpsBtns = document.querySelectorAll('.fps-btn');
    fpsBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        fpsBtns.forEach((b) => {
          b.classList.remove('active-fps', 'bg-orange-500', 'text-white', 'font-bold', 'shadow-xs');
          b.classList.add('text-zinc-400');
        });
        btn.classList.add('active-fps', 'bg-orange-500', 'text-white', 'font-bold', 'shadow-xs');
        btn.classList.remove('text-zinc-400');
        this.selectedFPS = parseInt(btn.dataset.fps, 10);
      });
    });

    // 3. Background Color Selector
    const bgBtns = document.querySelectorAll('.bg-color-btn');
    bgBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        bgBtns.forEach((b) => {
          b.classList.remove('active-bg', 'bg-zinc-800', 'text-white', 'font-bold', 'shadow-xs');
          b.classList.add('text-zinc-400');
        });
        btn.classList.add('active-bg', 'bg-zinc-800', 'text-white', 'font-bold', 'shadow-xs');
        btn.classList.remove('text-zinc-400');
        this.selectedBg = btn.dataset.bg;
      });
    });

    // 4. Native Local File System Directory Picker (Optional backup sync)
    const btnDir = document.getElementById('btn-choose-autosave-dir');
    const pathText = document.getElementById('autosave-folder-path');
    btnDir?.addEventListener('click', async () => {
      if ('showDirectoryPicker' in window) {
        try {
          this.localDirHandle = await window.showDirectoryPicker();
          if (pathText && this.localDirHandle) {
            pathText.textContent = `Sync Folder: /${this.localDirHandle.name} (Live Disk Mirror)`;
            pathText.classList.remove('text-zinc-500');
            pathText.classList.add('text-emerald-400', 'font-bold');
            showToast(`Autosave linked to /${this.localDirHandle.name}`);
          }
        } catch (err) {
          // User cancelled picker
        }
      } else {
        showToast('Local Folder Sync requires Chrome/Edge or desktop environment. Using IndexedDB Vault.', 'info');
      }
    });

    // 5. "Resume Last Session" Button
    document.getElementById('btn-launcher-resume')?.addEventListener('click', () => {
      if (this.recentProject) {
        this.dismissAndLaunch(this.recentProject);
      }
    });

    // 6. "Squash & Stretch Demo" Button
    document.getElementById('btn-launcher-ball-demo')?.addEventListener('click', async () => {
      const demo = await createBouncingBallProject();
      this.dismissAndLaunch(demo);
    });

    // 7. Open JSON File Input
    const fileInput = document.getElementById('launcher-file-input');
    fileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const proj = parsed.project || parsed;
        if (isProjectStructurallySound(proj)) {
          this.dismissAndLaunch(proj);
        } else {
          showToast('Invalid project file format', 'error');
        }
      } catch (err) {
        showToast('Failed to parse project JSON', 'error');
      }
    });

    // 8. Main Launch Studio Button
    document.getElementById('btn-launcher-start')?.addEventListener('click', () => {
      const nameInput = document.getElementById('setup-project-name');
      const projName = nameInput?.value.trim() || 'Untitled Animation';
      const freshProject = createBlankProject(projName, this.selectedW, this.selectedH, this.selectedFPS);
      freshProject.backgroundColor = this.selectedBg;
      this.dismissAndLaunch(freshProject);
    });

    // 9. Enter Key to Launch
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !splash.classList.contains('hidden')) {
        // If not typing in an input, launch
        if (e.target.tagName !== 'INPUT' || e.target.id === 'setup-project-name') {
          e.preventDefault();
          document.getElementById('btn-launcher-start')?.click();
        }
      }
    });
  }

  /**
   * Reads IndexedDB storage to present the recent project card
   */
  async loadRecentSessionPreview() {
    try {
      const recent = await loadLatestCrashResistantProject();
      const nameEl = document.getElementById('launcher-recent-name');
      const framesEl = document.getElementById('launcher-recent-frames');
      const resEl = document.getElementById('launcher-recent-res');
      const timeEl = document.getElementById('launcher-recent-time');
      const resumeBtn = document.getElementById('btn-launcher-resume');

      if (recent && isProjectStructurallySound(recent)) {
        this.recentProject = recent;
        if (nameEl) nameEl.textContent = recent.name || 'Untitled';
        if (framesEl) framesEl.textContent = `${recent.frames.length} Frame${recent.frames.length > 1 ? 's' : ''}`;
        if (resEl) resEl.textContent = `${recent.width} × ${recent.height} px`;
        if (timeEl) timeEl.textContent = `${recent.fps || 24} FPS`;
      } else {
        if (nameEl) nameEl.textContent = 'No previous session';
        if (resumeBtn) {
          resumeBtn.disabled = true;
          resumeBtn.classList.add('opacity-40', 'cursor-not-allowed');
        }
      }
    } catch (e) {
      console.warn('[Launcher] Error previewing recent session:', e);
    }
  }

  dismissAndLaunch(project) {
    const splash = document.getElementById('splash-screen');
    const card = document.getElementById('launcher-card');

    if (card) {
      card.style.transition = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease';
      card.style.transform = 'scale(0.96) translateY(-10px)';
      card.style.opacity = '0';
    }

    if (splash) {
      splash.style.transition = 'opacity 0.4s ease';
      splash.style.opacity = '0';
      setTimeout(() => {
        splash.classList.add('hidden');
        splash.style.display = 'none';
      }, 400);
    }

    if (this.onLaunch) {
      this.onLaunch(project);
    }
  }
}
