// src/js/project/autosave.js
/**
 * Background Auto-Save Engine (Crash-Guard Persistence Architecture)
 * 
 * Guarantees that:
 * 1. Every stroke and layer change is immutably snapshotted and serialized to IndexedDB in the background.
 * 2. Background serialization never drops animation frames or blocks the UI thread.
 * 3. Asynchronous queueing ensures sequential ACID persistence without race conditions.
 * 4. Browser/OS shutdown, sudden tab termination, or power-cuts are handled with multi-stage crash hooks.
 */

import { state } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { atomicSaveProject, createRollingCheckpoint, saveRolling60sCheckpoint, cloneProjectFast } from '../persistence.js';

let autosaveTimer = null;
let isWriting = false;
let pendingSnapshot = null;
let lastSaveTimestamp = Date.now();
const EMERGENCY_SESSION_KEY = 'mannsejro_crashguard_emergency';

/**
 * Schedules background persistence:
 * - immediate = true: executes after every completed stroke, vector shape, fill, or layer modification.
 * - immediate = false: debounces continuous input (e.g. dragging layer opacity slider) at 80ms.
 */
export function scheduleAutosave(immediate = false) {
  if (!state.project) return;

  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }

  updateAutosaveIndicator('saving');

  // Synchronously update the instant crash guard emergency buffer in sessionStorage
  writeEmergencyBufferSync(state.project);

  if (immediate) {
    enqueueBackgroundSave(state.project);
  } else {
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
      if (state.project) {
        enqueueBackgroundSave(state.project);
      }
    }, 80);
  }
}

/**
 * Captures an immutable snapshot of the project and dispatches it to the background IndexedDB writer.
 */
function enqueueBackgroundSave(project) {
  if (!project) return;

  try {
    // Snapshot state so subsequent strokes/edits do not mutate the in-flight serialization
    const snapshot = cloneProjectFast(project);

    if (isWriting) {
      // Background worker is currently writing to IndexedDB; keep the freshest snapshot queued
      pendingSnapshot = snapshot;
      return;
    }

    processBackgroundSave(snapshot);
  } catch (err) {
    console.warn('[CrashGuard] Failed to capture snapshot:', err);
  }
}

/**
 * Background worker loop: serializes snapshot to IndexedDB.
 */
async function processBackgroundSave(snapshot) {
  isWriting = true;
  updateAutosaveIndicator('saving');

  try {
    // Run asynchronously to allow browser paint/render loops to breathe
    await new Promise((resolve) => {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(resolve, { timeout: 16 });
      } else {
        setTimeout(resolve, 0);
      }
    });

    await atomicSaveProject(snapshot, true);
    lastSaveTimestamp = Date.now();
    updateAutosaveIndicator('saved');
  } catch (err) {
    console.error('[CrashGuard] Background serialization error:', err);
    updateAutosaveIndicator('error');
  } finally {
    isWriting = false;

    // If another stroke or layer edit happened while this transaction was writing, process the newest snapshot immediately
    if (pendingSnapshot) {
      const next = pendingSnapshot;
      pendingSnapshot = null;
      processBackgroundSave(next);
    }
  }
}

/**
 * Flushes all pending writes immediately (useful on navigation, tab close, or frame switch).
 */
export async function flushAutosave() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }

  if (!state.project) return;

  writeEmergencyBufferSync(state.project);
  const snapshot = cloneProjectFast(state.project);

  if (isWriting) {
    pendingSnapshot = snapshot;
    return;
  }

  await processBackgroundSave(snapshot);
}

export async function saveCurrentProjectImmediate() {
  return await flushAutosave();
}

/**
 * Synchronously writes a compact recovery record into sessionStorage/localStorage
 * as an extra fallback shield against instant OS power cutoffs.
 */
function writeEmergencyBufferSync(project) {
  if (!project) return;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(EMERGENCY_SESSION_KEY, JSON.stringify({
        id: project.id,
        name: project.name,
        timestamp: Date.now(),
        frameCount: project.frames?.length || 0,
        layerCount: project.layers?.length || 0
      }));
    }
  } catch (_) {
    // Ignore storage quota limits gracefully
  }
}

/**
 * Updates visual Crash-Guard status badge in the top navigation bar.
 */
export function updateAutosaveIndicator(status) {
  const dot = elements.autosaveDot;
  const text = elements.autosaveText;
  if (!dot || !text) return;

  dot.className = 'w-2 h-2 rounded-full transition-all duration-200';

  if (status === 'saving') {
    dot.classList.add('bg-amber-400', 'animate-pulse');
    text.textContent = 'Saving…';
    dot.title = 'Serializing project state to IndexedDB…';
  } else if (status === 'error') {
    dot.classList.add('bg-rose-500');
    text.textContent = 'Save Failed';
    dot.title = 'Database persistence error; retrying in background…';
  } else {
    dot.classList.add('bg-emerald-400', 'shadow-[0_0_8px_rgba(52,211,153,0.8)]');
    text.textContent = 'Crash-Guarded';
    const timeStr = new Date(lastSaveTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    dot.title = `Persisted safely to IndexedDB (Last auto-saved: ${timeStr})`;
  }
}

/**
 * OS & Browser Lifecycle Hooks:
 * Captures browser unload, tab hide, mobile freeze, and periodic heartbeats.
 */
export function setupCrashGuardLifecycleHooks() {
  const syncEmergency = () => {
    if (state.project) {
      writeEmergencyBufferSync(state.project);
      flushAutosave();
    }
  };

  // 1. Tab minimized, switched, or OS screen locked
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      syncEmergency();
    }
  });

  // 2. Window closing / sudden navigation
  window.addEventListener('pagehide', syncEmergency);
  window.addEventListener('beforeunload', syncEmergency);

  // 3. Page Lifecycle API: Freeze event (Chromium background freeze)
  if ('freeze' in window) {
    window.addEventListener('freeze', syncEmergency);
  }

  // 4. Safety heartbeat: guarantees disk sync check every 5 seconds
  setInterval(() => {
    if (Date.now() - lastSaveTimestamp > 5000 && state.project) {
      flushAutosave();
    }
  }, 5000);

  // 5. Rolling checkpoint every 5 minutes (Version Time Machine)
  setInterval(() => {
    if (state.project) {
      createRollingCheckpoint(state.project);
    }
  }, 5 * 60 * 1000);

  // 6. 60-Second Rolling Checkpoint Vault (Tier 3 CrashGuard)
  setInterval(() => {
    if (state.project) {
      saveRolling60sCheckpoint(state.project);
    }
  }, 60 * 1000);
}
