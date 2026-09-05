import { state } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { exportProjectFile } from '../project/projectManager.js';
import { stopPlayback, togglePlayback, setFrameIndex } from '../timeline/playback.js';
import { setFrameDuration, duplicateFrameAt } from '../timeline/frameOperations.js';
import { centerCameraInView } from '../viewport/camera.js';
import { requestRender } from '../render/renderEngine.js';
import { adjustOpacity, adjustBrushSize } from '../viewport/brushCursor.js';
import { setToolByName } from '../ui/colorPalettes.js';
import { undo, redo } from '../project/history.js';
import { clearStrokePreview } from '../render/strokeRenderer.js';
import { activateTempEyedropper, deactivateTempEyedropper } from './canvasEvents.js';
import { commitFloatingSelection, cancelFloatingSelection, discardFloatingSelection } from '../viewport/floatingSelection.js';
import { setupRollingShortcuts } from '../timeline/rollingEngine.js';

export function setupKeyboardEvents() {
  const rolling = setupRollingShortcuts();
  const isModalOpen = () =>
    Boolean(
      (elements.exportModal && !elements.exportModal.classList.contains('hidden')) ||
      (elements.shortcutsModal && !elements.shortcutsModal.classList.contains('hidden')) ||
      (elements.templatesModal && !elements.templatesModal.classList.contains('hidden'))
    );

  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

    // Global modal escape dismissal
    if (e.key === 'Escape') {
      if (elements.exportModal) elements.exportModal.classList.add('hidden');
      if (elements.shortcutsModal) elements.shortcutsModal.classList.add('hidden');
      if (elements.templatesModal) elements.templatesModal.classList.add('hidden');
      if (elements.floatingRefViewer) elements.floatingRefViewer.classList.add('hidden');
      if (state.isDrawing) {
        state.isDrawing = false;
        clearStrokePreview();
        state.strokePoints = [];
      }
      return;
    }

    // Block studio hotkeys while any modal is open
    if (isModalOpen()) return;

    // High-speed frame rolling (F / G keys)
    if (rolling.handleKeyDown(e)) {
      e.preventDefault();
      return;
    }

    const key = e.key.toLowerCase();

    // Track shift for straight-line / aspect constraint
    if (e.key === 'Shift') {
      state.shiftPressed = true;
    }

    // 1) Explicit Ctrl/Meta combos the studio owns
    if (e.ctrlKey || e.metaKey) {
      if (key === 's') {
        e.preventDefault();
        exportProjectFile();
      } else if (key === 'd') {
        e.preventDefault();
        duplicateFrameAt(state.currentFrameIndex);
      } else if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      } else if (key === '0') {
        e.preventDefault();
        state.zoom = 1;
        centerCameraInView();
        requestRender();
      }
      return;
    }

    // 2) Temporary Eyedropper on Alt (hold)
    if (e.key === 'Alt') {
      e.preventDefault();
      if (!e.repeat) activateTempEyedropper();
      return;
    }

    // 3) Floating selection hotkeys: Enter (commit), Esc (cancel), Delete (discard)
    if (state.floatingSelection) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitFloatingSelection();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelFloatingSelection();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        discardFloatingSelection();
        return;
      }
    }

    // 4) Escape Key Global Dismissal
    if (e.key === 'Escape') {
      if (elements.exportModal) elements.exportModal.classList.add('hidden');
      if (elements.shortcutsModal) elements.shortcutsModal.classList.add('hidden');
      if (elements.templatesModal) elements.templatesModal.classList.add('hidden');
      if (elements.floatingRefViewer) elements.floatingRefViewer.classList.add('hidden');
      if (state.isDrawing) {
        state.isDrawing = false;
        clearStrokePreview();
        state.strokePoints = [];
      }
      return;
    }

    // 5) Space Pan / Play
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) {
        state.isSpacePressed = true;
        if (!state.isPanning && elements.canvasContainer) elements.canvasContainer.style.cursor = 'grab';
      }
      return;
    }

    // 6) Navigation Shortcuts
    if (e.key === 'Home') {
      e.preventDefault();
      stopPlayback();
      setFrameIndex(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      stopPlayback();
      setFrameIndex(state.project.frames.length - 1);
      return;
    }
    if (e.shiftKey && e.code === 'ArrowUp') {
      e.preventDefault();
      const f = state.project.frames[state.currentFrameIndex];
      if (f) setFrameDuration(state.currentFrameIndex, (f.duration || 1) + 1);
      return;
    }
    if (e.shiftKey && e.code === 'ArrowDown') {
      e.preventDefault();
      const f = state.project.frames[state.currentFrameIndex];
      if (f) setFrameDuration(state.currentFrameIndex, (f.duration || 1) - 1);
      return;
    }

    // Navigation / Frame Scrubbing
    if (e.code === 'ArrowLeft' || e.key === ',') {
      e.preventDefault();
      stopPlayback();
      setFrameIndex(state.currentFrameIndex - 1);
      return;
    }
    if (e.code === 'ArrowRight' || e.key === '.') {
      e.preventDefault();
      stopPlayback();
      setFrameIndex(state.currentFrameIndex + 1);
      return;
    }
    if (e.key === 'Enter' || e.key === '+') {
      e.preventDefault();
      if (elements.btnAddFrame) elements.btnAddFrame.click();
      return;
    }
    if (e.key === 'Delete') {
      if (elements.btnDeleteFrame) elements.btnDeleteFrame.click();
      return;
    }

    // View Resets
    if (e.key === '0') {
      e.preventDefault();
      state.zoom = 1;
      centerCameraInView();
      requestRender();
      return;
    }
    if (key === 'o') {
      if (elements.btnToggleOnion) elements.btnToggleOnion.click();
      return;
    }
    if (key === 'l') {
      if (elements.btnToggleLoop) elements.btnToggleLoop.click();
      return;
    }
    if (key === 'x') {
      if (elements.btnSwapColors) elements.btnSwapColors.click();
      return;
    }

    // Brush Size & Opacity Adjustments
    if (e.key === '[') {
      e.preventDefault();
      if (e.shiftKey) {
        adjustOpacity(-0.05);
      } else {
        adjustBrushSize(-2);
      }
      return;
    }
    if (e.key === ']') {
      e.preventDefault();
      if (e.shiftKey) {
        adjustOpacity(0.05);
      } else {
        adjustBrushSize(2);
      }
      return;
    }

    // Tool selection shortcuts
    if (key === 'b' || key === 'd') return setToolByName('draw');
    if (key === 'e') return setToolByName('eraser');
    if (key === 's' || key === 'v') return setToolByName('select');
    if (key === 'l') return setToolByName('lassofill');
    if (key === 'k') return setToolByName('bucket');
    if (key === 'u' || key === 'r') return setToolByName('shape');
    if (key === 'i') return setToolByName('eyedropper');
    if (key === 'h') return setToolByName('hand');
  });

  window.addEventListener('blur', () => deactivateTempEyedropper());

  window.addEventListener('keyup', (e) => {
    rolling.handleKeyUp(e);

    if (e.key === 'Shift') {
      state.shiftPressed = false;
    }

    if (e.key === 'Alt') {
      deactivateTempEyedropper();
      return;
    }

    if (e.code === 'Space') {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || isModalOpen()) {
        state.isSpacePressed = false;
        state.spacePanUsed = false;
        return;
      }
      const wasUsedForPan = state.isPanning || state.spacePanUsed;
      state.isSpacePressed = false;
      state.spacePanUsed = false;
      if (elements.canvasContainer) elements.canvasContainer.style.cursor = '';
      if (!wasUsedForPan) togglePlayback();
    }
  });
}
