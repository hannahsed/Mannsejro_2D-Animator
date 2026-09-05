// src/js/project/autosave.js
import { state } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { atomicSaveProject, createRollingCheckpoint } from '../persistence.js';

let autosaveTimer = null;
let isWriting = false;
let writeQueued = false;
let lastSaveTimestamp = Date.now();

/**
 * Fast schedule:
 * - immediate = true: commits in ~80ms (for pointer-up stroke end, delete, add frame)
 * - immediate = false: debounces at 200ms (for slider dragging)
 */
export function scheduleAutosave(immediate = false) {
  if (autosaveTimer) clearTimeout(autosaveTimer);

  updateAutosaveIndicator('saving');

  const delay = immediate ? 80 : 200;
  autosaveTimer = setTimeout(() => {
    flushAutosave();
  }, delay);
}

export async function flushAutosave() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }

  if (!state.project) return;

  if (isWriting) {
    writeQueued = true;
    return;
  }

  isWriting = true;
  try {
    await atomicSaveProject(state.project);
    lastSaveTimestamp = Date.now();
    updateAutosaveIndicator('saved');
  } catch (err) {
    console.error('[CrashGuard] Save error:', err);
    updateAutosaveIndicator('error');
  } finally {
    isWriting = false;
    if (writeQueued) {
      writeQueued = false;
      flushAutosave();
    }
  }
}

export function updateAutosaveIndicator(status) {
  const dot = elements.autosaveDot;
  const text = elements.autosaveText;
  if (!dot || !text) return;

  dot.className = 'w-2 h-2 rounded-full transition-all duration-200';

  if (status === 'saving') {
    dot.classList.add('bg-amber-400', 'animate-pulse');
    text.textContent = 'Saving…';
  } else if (status === 'error') {
    dot.classList.add('bg-rose-500');
    text.textContent = 'Save Failed';
  } else {
    dot.classList.add('bg-emerald-400', 'shadow-[0_0_8px_rgba(52,211,153,0.8)]');
    text.textContent = 'Crash-Guarded';
  }
}

/**
 * OS & Browser Lifecycle Hooks:
 * Flushes pending writes before power-down/tab freeze.
 */
export function setupCrashGuardLifecycleHooks() {
  // 1. Tab minimized, switched, or OS locking
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushAutosave();
    }
  });

  // 2. Window closing / sudden navigation
  window.addEventListener('pagehide', () => {
    flushAutosave();
  });

  window.addEventListener('beforeunload', () => {
    flushAutosave();
  });

  // 3. Safety heartbeat: guarantees a disk sync every 10 seconds regardless of edits
  setInterval(() => {
    if (Date.now() - lastSaveTimestamp > 10000 && state.project) {
      flushAutosave();
    }
  }, 10000);

  // 4. Auto-checkpoint every 5 minutes (Rolling Time Machine)
  setInterval(() => {
    if (state.project) {
      createRollingCheckpoint(state.project);
    }
  }, 5 * 60 * 1000);
}
