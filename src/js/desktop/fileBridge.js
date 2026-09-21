// src/js/desktop/fileBridge.js
/**
 * UNIVERSAL FILE BRIDGE
 * Handles native desktop file I/O with automatic fallback
 * to browser File System Access API.
 */

import { state } from '../state/appState.js';
import { packProjectToArchive, unpackProjectArchive } from '../storage/archiveFormat.js';
import { showToast } from '../ui/toast.js';

let activeFileHandle = null; // Browser FileSystemHandle (Web)
let activeFilePath = null;   // Native Absolute Path (Tauri)

export const isDesktopApp = Boolean(typeof window !== 'undefined' && window.__TAURI__);

/**
 * Silent save: updates the open file immediately without prompts.
 */
export async function saveProjectSilent() {
  if (isDesktopApp) {
    if (activeFilePath) {
      await saveToNativePath(activeFilePath);
      return;
    }
    await saveProjectAs();
  } else {
    if (activeFileHandle) {
      await saveToWebHandle(activeFileHandle);
      return;
    }
    await saveProjectAs();
  }
}

/**
 * Save As: Prompts for a location, then sets it as the active file.
 */
export async function saveProjectAs() {
  const defaultName = `${(state.project?.name || 'Untitled').replace(/[^a-zA-Z0-9_-]/g, '_')}.animstudio`;

  if (isDesktopApp) {
    try {
      const { save } = window.__TAURI__.dialog;
      const selectedPath = await save({
        filters: [{ name: 'MannSejro Project', extensions: ['animstudio'] }],
        defaultPath: defaultName
      });

      if (selectedPath) {
        activeFilePath = selectedPath;
        await saveToNativePath(activeFilePath);
      }
    } catch (err) {
      showToast(`Save dialog error: ${err}`, 'error');
    }
  } else if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    // Modern Browser File System Access API
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: defaultName,
        types: [{
          description: 'MannSejro Animation Project',
          accept: { 'application/x-animstudio': ['.animstudio'] }
        }]
      });
      activeFileHandle = handle;
      await saveToWebHandle(activeFileHandle);
    } catch (err) {
      if (err.name !== 'AbortError') console.error(err);
    }
  } else {
    // Fallback download anchor for legacy browsers
    const { blob } = await packProjectToArchive(state.project);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast('Project exported');
  }
}

async function saveToNativePath(targetPath) {
  const { invoke } = window.__TAURI__;
  showToast('Saving to disk…');

  const { manifestJson, timelineJson, tilesBinaryMap } = await packProjectToArchive(state.project);

  try {
    await invoke('save_project_archive', {
      filePath: targetPath,
      manifestJson,
      timelineJson,
      tiles: tilesBinaryMap
    });
    showToast('Saved successfully');
  } catch (err) {
    showToast(`Save failed: ${err}`, 'error');
  }
}

async function saveToWebHandle(handle) {
  showToast('Writing to disk…');
  try {
    const { blob } = await packProjectToArchive(state.project);
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    showToast('File saved');
  } catch (err) {
    showToast(`Write failed: ${err.message}`, 'error');
  }
}

/**
 * Open Project: native dialog with desktop/browser parity.
 */
export async function openProjectDialog(loadProjectFn) {
  if (isDesktopApp) {
    const { open } = window.__TAURI__.dialog;
    const selected = await open({
      filters: [{ name: 'MannSejro Project', extensions: ['animstudio'] }],
      multiple: false
    });

    if (selected && typeof selected === 'string') {
      activeFilePath = selected;
      const { invoke } = window.__TAURI__;
      showToast('Loading archive…');
      const loaded = await invoke('load_project_archive', { filePath: selected });
      const project = await unpackProjectArchive(loaded);
      if (loadProjectFn) await loadProjectFn(project);
      showToast(`Loaded ${project.name}`);
    }
  } else if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'MannSejro Animation Project',
          accept: { 'application/x-animstudio': ['.animstudio', '.zip'] }
        }]
      });
      activeFileHandle = handle;
      const file = await handle.getFile();
      const project = await unpackProjectArchive(file);
      if (loadProjectFn) await loadProjectFn(project);
      showToast(`Loaded ${project.name}`);
    } catch (err) {
      if (err.name !== 'AbortError') console.error(err);
    }
  }
}

export function setupDesktopMenuListeners(loadProjectFn) {
  if (!isDesktopApp) return;
  try {
    const { listen } = window.__TAURI__.event;
    listen('menu-save', () => saveProjectSilent());
    listen('menu-save-as', () => saveProjectAs());
    listen('menu-open', () => openProjectDialog(loadProjectFn));
  } catch (err) {
    console.warn('[Tauri] Failed to attach menu listeners:', err);
  }
}
