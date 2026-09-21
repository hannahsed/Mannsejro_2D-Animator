// src/js/events/keyboardEvents.js
import { state } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { exportProjectFile } from '../project/projectManager.js';
import { saveProjectSilent, isDesktopApp } from '../desktop/fileBridge.js';
import { flushAutosave } from '../project/autosave.js';
import { showToast } from '../ui/toast.js';
import { stopPlayback, togglePlayback, setFrameIndex } from '../timeline/playback.js';
import { setFrameDuration, duplicateFrameAt } from '../timeline/frameOperations.js';
import { toggleTimelineCollapse } from '../timeline/filmstrip.js';
import { centerCameraInView } from '../viewport/camera.js';
import { requestRender } from '../render/renderEngine.js';
import { adjustBrushSize } from '../viewport/brushCursor.js';
import { setToolByName, setEngineMode } from '../ui/colorPalettes.js';
import { undo, redo } from '../project/history.js';
import { clearStrokePreview } from '../render/strokeRenderer.js';
import { setupRollingShortcuts } from '../timeline/rollingEngine.js';
import { refreshQuickPaletteUI } from '../ui/quickPalette.js';
import {
  perspectiveStudioState,
  commitPerspectiveShape,
  cancelPerspectiveStudio
} from '../viewport/perspectiveRectangleStudio.js';
import {
  polygonStudioState,
  closeAndCommitPolygon,
  popLastPolygonVertex,
  cancelPolygonStudio
} from '../viewport/polygonStudio.js';
import {
  nodeToolState,
  commitNodeTool,
  removeActiveNode,
  cancelNodeTool
} from '../viewport/nodeTool.js';
import {
  selectToolState,
  clearSelection,
  deleteSelectedStrokes,
  duplicateSelectedStrokes,
  selectAllStrokes,
  flipSelectedStrokes
} from '../viewport/selectTool.js';

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
      if (selectToolState.selectedStrokeIds && selectToolState.selectedStrokeIds.size > 0) {
        clearSelection();
        showToast('Cleared stroke selection');
        requestRender();
        return;
      }
      if (nodeToolState.active) {
        cancelNodeTool();
        showToast('Cancelled node path');
        return;
      }
      if (polygonStudioState.active) {
        cancelPolygonStudio();
        showToast('Cancelled polygon');
        return;
      }
      if (perspectiveStudioState.active) {
        cancelPerspectiveStudio();
        showToast('Cancelled perspective rectangle');
        return;
      }
      if (state.isDrawing) {
        state.isDrawing = false;
        clearStrokePreview();
        state.strokePoints = [];
      }
      return;
    }

    // Node Tool hotkeys: Enter (commit path), Backspace / Delete (remove node), Esc (cancel)
    if (state.currentTool === 'node-tool' && nodeToolState.active) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitNodeTool();
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        removeActiveNode();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelNodeTool();
        return;
      }
    }

    // 1. Polygon Studio hotkeys: Enter (close/commit), Backspace/Delete (remove vertex), Esc (cancel)
    if (polygonStudioState.active) {
      if (e.key === 'Enter') {
        e.preventDefault();
        closeAndCommitPolygon();
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        popLastPolygonVertex();
        return;
      }
    }

    // 2. Perspective Studio hotkeys: Enter (commit), Esc/Delete (cancel)
    if (perspectiveStudioState.active) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitPerspectiveShape();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelPerspectiveStudio();
        showToast('Cancelled perspective rectangle');
        return;
      }
    }

    // Block studio hotkeys while any modal is open
    if (isModalOpen()) return;

    // High-speed frame rolling (F / G keys)
    if (rolling.handleKeyDown(e)) {
      e.preventDefault();
      return;
    }

    const key = e.key.toLowerCase();
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

    // Undo / Redo
    if (cmdOrCtrl && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }
    if (cmdOrCtrl && key === 'y') {
      e.preventDefault();
      redo();
      return;
    }

    // Project Shortcuts (Save & Export)
    if (cmdOrCtrl && key === 's') {
      e.preventDefault();
      if (isDesktopApp()) {
        saveProjectSilent();
      } else {
        flushAutosave();
        showToast('Project saved');
      }
      return;
    }
    if (cmdOrCtrl && key === 'e') {
      e.preventDefault();
      if (elements.exportModal) {
        elements.exportModal.classList.remove('hidden');
      } else {
        exportProjectFile();
      }
      return;
    }

    // Default Colors Shortcut (D)
    if (key === 'd' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      state.toolSettings.color = '#1e293b';
      if (elements.primaryColorPicker) elements.primaryColorPicker.value = '#1e293b';
      refreshQuickPaletteUI();
      showToast('Default Graphite (#1e293b)');
      return;
    }

    // Timeline Navigation / Playback
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlayback();
      return;
    }
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

    // Frame Scrubbing
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
    // Duplicate Selection Shortcut (Cmd+D / Ctrl+D)
    if (cmdOrCtrl && key === 'd') {
      e.preventDefault();
      if (selectToolState.selectedStrokeIds && selectToolState.selectedStrokeIds.size > 0) {
        duplicateSelectedStrokes();
      }
      return;
    }

    // Select All Strokes Shortcut (Cmd+A / Ctrl+A)
    if (cmdOrCtrl && key === 'a') {
      e.preventDefault();
      if (state.engineMode !== 'vector') setEngineMode('vector');
      setToolByName('select');
      selectAllStrokes();
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectToolState.selectedStrokeIds && selectToolState.selectedStrokeIds.size > 0) {
        e.preventDefault();
        deleteSelectedStrokes();
        return;
      }
      if (e.key === 'Delete' && elements.btnDeleteFrame) {
        elements.btnDeleteFrame.click();
        return;
      }
    }

    // Collapse / Expand Timeline Shortcut (\)
    if (e.key === '\\' || e.code === 'Backslash') {
      e.preventDefault();
      toggleTimelineCollapse();
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
    if (key === 'o' && e.shiftKey) {
      if (elements.btnToggleOnion) elements.btnToggleOnion.click();
      return;
    }
    if (key === 'l' && e.shiftKey) {
      e.preventDefault();
      if (elements.btnToggleLoop) elements.btnToggleLoop.click();
      return;
    }

    // Pencil Size Adjustments
    if (e.key === '[') {
      e.preventDefault();
      adjustBrushSize(-1);
      return;
    }
    if (e.key === ']') {
      e.preventDefault();
      adjustBrushSize(1);
      return;
    }

    // Engine Mode Toggle & Tool Shortcuts
    if (key === '1' || key === 'p') {
      if (state.engineMode !== 'vector') {
        setEngineMode('vector');
      } else {
        setToolByName('vector-pen');
      }
      return;
    }
    if (key === '2' || key === 'b') {
      if (state.engineMode !== 'pixel') {
        setEngineMode('pixel');
      } else {
        setToolByName('graphite');
      }
      return;
    }
    if (key === '3' || key === 'u') {
      setToolByName('shape');
      return;
    }
    if (key === 'e') {
      if (state.engineMode !== 'pixel') setEngineMode('pixel');
      setToolByName('eraser');
      return;
    }
    if (key === 'r') {
      if (state.engineMode === 'pixel') {
        setToolByName('smear');
      } else {
        setToolByName('shape');
      }
      return;
    }
    if (key === 'g') {
      if (state.engineMode === 'vector') {
        setToolByName('vector-fill');
      } else {
        setToolByName('pixel-fill');
      }
      return;
    }
    if (key === 'v' && !cmdOrCtrl) {
      setToolByName('select');
      showToast('Select & Transform Tool Active');
      return;
    }
    if (key === 'n' && !cmdOrCtrl && !e.shiftKey) {
      setToolByName('node-tool');
      showToast('Node Tool Active — Click to plot nodes');
      return;
    }
    if (key === 'x' && !cmdOrCtrl) {
      e.preventDefault();
      const tmp = state.toolSettings.color;
      state.toolSettings.color = state.toolSettings.secondaryColor || '#ffffff';
      state.toolSettings.secondaryColor = tmp;
      if (elements.primaryColorPicker) elements.primaryColorPicker.value = state.toolSettings.color;
      if (elements.secondaryColorPicker) elements.secondaryColorPicker.value = state.toolSettings.secondaryColor;
      refreshQuickPaletteUI();
      showToast('Swapped colors');
      return;
    }
  });

  window.addEventListener('keyup', (e) => {
    rolling.handleKeyUp(e);

    if (e.key === 'Shift') {
      state.shiftPressed = false;
    }

    if (e.code === 'Space') {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || isModalOpen()) {
        state.isSpacePressed = false;
        state.spacePanUsed = false;
        return;
      }
      state.isSpacePressed = false;
      state.spacePanUsed = false;
      if (elements.canvasContainer) elements.canvasContainer.style.cursor = '';
    }
  });
}
