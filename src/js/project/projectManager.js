// src/js/project/projectManager.js
import { state } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { sanitizeFilename } from '../exportEngine.js';
import { flushAutosave } from './autosave.js';

export function updateHeaderInfo() {
  if (!state.project) return;
  if (elements.headerResBadge) elements.headerResBadge.textContent = `${state.project.width}×${state.project.height} px`;
  if (elements.headerFpsBadge) elements.headerFpsBadge.textContent = `${state.project.fps} FPS`;
  if (elements.totalFramesNum) elements.totalFramesNum.textContent = state.project.frames.length;
  if (elements.projectNameInput) elements.projectNameInput.value = state.project.name;
}

export function isValidProject(p) {
  return Boolean(
    p &&
      typeof p === 'object' &&
      typeof p.width === 'number' &&
      typeof p.height === 'number' &&
      Array.isArray(p.layers) &&
      p.layers.length > 0 &&
      Array.isArray(p.frames) &&
      p.frames.length > 0 &&
      p.frames.every((f) => f && typeof f.layerData === 'object' && f.layerData !== null)
  );
}

export function confirmReplaceProject(actionLabel) {
  if (state.historyStack.length <= 1) return true;
  return window.confirm(
    `${actionLabel}?\n\nThe current project ("${state.project.name}") will be replaced.\nUse Save (Ctrl+S) first if you want to keep a backup.`
  );
}

export function exportProjectFile() {
  if (!state.project) return;
  const payload = {
    format: 'animation-studio-project',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    project: state.project,
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFilename(state.project.name)}.animstudio.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  flushAutosave();
}
