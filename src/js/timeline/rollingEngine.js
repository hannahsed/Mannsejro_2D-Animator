// src/js/timeline/rollingEngine.js
import { state } from '../state/appState.js';
import { setFrameIndex, stopPlayback } from './playback.js';

let rollingOriginFrame = null;
let activeRollingKey = null;

/**
 * High-Speed Rolling Engine
 * Provides instant frame-flipping muscle memory (F/G keys) for animators.
 * - Tap 'F': Step instantly to previous frame
 * - Tap 'G': Step instantly to next frame
 * - Hold 'F' or 'G': Rapidly flip/roll between frames
 */
export function handleRollingKeyDown(e) {
  if (e.repeat) return false;
  const key = e.key.toLowerCase();

  if (key === 'f' || key === 'g') {
    if (activeRollingKey === null) {
      rollingOriginFrame = state.currentFrameIndex;
    }
    activeRollingKey = key;
    stopPlayback();

    const total = state.project.frames.length;
    if (total <= 1) return true;

    if (key === 'f') {
      const prevIdx = (state.currentFrameIndex - 1 + total) % total;
      setFrameIndex(prevIdx);
    } else if (key === 'g') {
      const nextIdx = (state.currentFrameIndex + 1) % total;
      setFrameIndex(nextIdx);
    }
    return true;
  }
  return false;
}

export function handleRollingKeyUp(e) {
  const key = e.key.toLowerCase();
  if (key === 'f' || key === 'g') {
    if (activeRollingKey === key) {
      activeRollingKey = null;
    }
    return true;
  }
  return false;
}

export function setupRollingShortcuts() {
  return {
    handleKeyDown: handleRollingKeyDown,
    handleKeyUp: handleRollingKeyUp,
  };
}
