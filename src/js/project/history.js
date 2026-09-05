// src/js/project/history.js
import { state } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { scheduleAutosave } from './autosave.js';
import { requestRender } from '../render/renderEngine.js';
import { renderTimelineFilmstrip } from '../timeline/filmstrip.js';
import { renderLayersList } from '../ui/layersUI.js';

const MAX_HISTORY = 15;

export function saveHistoryState() {
  if (!state.project) return;
  const serialized = JSON.stringify(state.project);
  const upToCurrent = state.historyStack.slice(0, state.historyIndex + 1);
  state.historyStack = [...upToCurrent, serialized];
  if (state.historyStack.length > MAX_HISTORY) state.historyStack.shift();
  state.historyIndex = state.historyStack.length - 1;
  updateUndoRedoButtons();
  scheduleAutosave();
}

export function undo() {
  if (state.historyIndex > 0) {
    state.historyIndex--;
    state.project = JSON.parse(state.historyStack[state.historyIndex]);
    requestRender();
    renderTimelineFilmstrip();
    renderLayersList();
    updateUndoRedoButtons();
    scheduleAutosave();
  }
}

export function redo() {
  if (state.historyIndex < state.historyStack.length - 1) {
    state.historyIndex++;
    state.project = JSON.parse(state.historyStack[state.historyIndex]);
    requestRender();
    renderTimelineFilmstrip();
    renderLayersList();
    updateUndoRedoButtons();
    scheduleAutosave();
  }
}

export function updateUndoRedoButtons() {
  if (elements.btnUndo) elements.btnUndo.disabled = state.historyIndex <= 0;
  if (elements.btnRedo) elements.btnRedo.disabled = state.historyIndex >= state.historyStack.length - 1;
}
