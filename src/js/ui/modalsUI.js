import { elements } from '../state/domElements.js';
import { exportVideo, exportSpritesheet, exportPngSequenceZip, exportAnimatedGif } from '../exportEngine.js';
import { state } from '../state/appState.js';
import { loadProjectIntoStudio, confirmReplaceProject, exportProjectFile } from '../project/projectManager.js';
import { createBouncingBallProject, createBlankProject } from '../templates.js';

export function setupModalsUI() {
  // Modal Open & Close Handlers
  if (elements.btnOpenExport) {
    elements.btnOpenExport.addEventListener('click', () => {
      elements.exportModal.classList.remove('hidden');
    });
  }
  if (elements.btnCloseExportModal) {
    elements.btnCloseExportModal.addEventListener('click', () => {
      elements.exportModal.classList.add('hidden');
    });
  }
  if (elements.btnCancelExport) {
    elements.btnCancelExport.addEventListener('click', () => {
      elements.exportModal.classList.add('hidden');
    });
  }

  // Export Trigger
  let selectedExportType = 'video';
  document.querySelectorAll('.export-type-btn').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.export-type-btn').forEach((btn) => {
        btn.classList.remove('active-export', 'border-blue-500', 'bg-blue-950/60', 'text-blue-300');
        btn.classList.add('border-slate-700/60', 'bg-slate-800/50', 'text-slate-400');
      });
      b.classList.add('active-export', 'border-blue-500', 'bg-blue-950/60', 'text-blue-300');
      b.classList.remove('border-slate-700/60', 'bg-slate-800/50', 'text-slate-400');
      selectedExportType = b.getAttribute('data-export-type');
    });
  });

  if (elements.btnRunExport) {
    elements.btnRunExport.addEventListener('click', async () => {
      elements.exportProgressWrap.classList.remove('hidden');
      elements.btnRunExport.disabled = true;
      const onProg = (p) => {
        elements.exportProgressBar.style.width = `${p}%`;
        elements.exportProgressNum.textContent = `${p}%`;
      };
      if (selectedExportType === 'gif') {
        elements.exportStatusLabel.textContent = 'Encoding Animated GIF (LZW)...';
        await exportAnimatedGif(state.project || window.__animationState.project, onProg);
      } else if (selectedExportType === 'video') {
        elements.exportStatusLabel.textContent = 'Rendering WebM Video...';
        await exportVideo(state.project || window.__animationState.project, onProg);
      } else if (selectedExportType === 'spritesheet') {
        elements.exportStatusLabel.textContent = 'Assembling Spritesheet...';
        await exportSpritesheet(state.project || window.__animationState.project, 4);
        onProg(100);
      } else if (selectedExportType === 'zip') {
        elements.exportStatusLabel.textContent = 'Archiving PNG Sequence...';
        await exportPngSequenceZip(state.project || window.__animationState.project, onProg);
      } else if (selectedExportType === 'json') {
        elements.exportStatusLabel.textContent = 'Generating Project Backup (.json)...';
        exportProjectFile(state.project || window.__animationState.project);
        onProg(100);
      }
      setTimeout(() => {
        elements.exportProgressWrap.classList.add('hidden');
        elements.exportModal.classList.add('hidden');
        elements.btnRunExport.disabled = false;
      }, 1000);
    });
  }

  if (elements.btnOpenShortcuts) {
    elements.btnOpenShortcuts.addEventListener('click', () => {
      elements.shortcutsModal.classList.remove('hidden');
    });
  }
  if (elements.btnCloseShortcutsModal) {
    elements.btnCloseShortcutsModal.addEventListener('click', () => {
      elements.shortcutsModal.classList.add('hidden');
    });
  }
  if (elements.btnOpenTemplates) {
    elements.btnOpenTemplates.addEventListener('click', () => {
      elements.templatesModal.classList.remove('hidden');
    });
  }
  if (elements.btnCloseTemplatesModal) {
    elements.btnCloseTemplatesModal.addEventListener('click', () => {
      elements.templatesModal.classList.add('hidden');
    });
  }

  if (elements.btnLoadBouncingBall) {
    elements.btnLoadBouncingBall.addEventListener('click', () => {
      if (!confirmReplaceProject('Load the bouncing ball demo')) return;
      loadProjectIntoStudio(createBouncingBallProject());
      elements.templatesModal.classList.add('hidden');
    });
  }
  if (elements.btnBlank800x600) {
    elements.btnBlank800x600.addEventListener('click', () => {
      if (!confirmReplaceProject('Create a blank 800×600 project')) return;
      loadProjectIntoStudio(createBlankProject('Standard 800x600', 800, 600, 12));
      elements.templatesModal.classList.add('hidden');
    });
  }
  if (elements.btnBlank1280x720) {
    elements.btnBlank1280x720.addEventListener('click', () => {
      if (!confirmReplaceProject('Create a blank 1280×720 project')) return;
      loadProjectIntoStudio(createBlankProject('HD Widescreen (16:9)', 1280, 720, 24));
      elements.templatesModal.classList.add('hidden');
    });
  }
  if (elements.btnCloseFloatingRef) {
    elements.btnCloseFloatingRef.addEventListener('click', () => {
      elements.floatingRefViewer.classList.add('hidden');
    });
  }
}
