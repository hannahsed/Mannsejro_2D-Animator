// src/js/timeline/frameOperations.js
import { state } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { setFrameIndex, buildPlaybackTicks } from './playback.js';
import { renderTimelineFilmstrip } from './filmstrip.js';
import { saveHistoryState } from '../project/history.js';
import { requestRender } from '../render/renderEngine.js';
import { copyTiles } from '../infiniteCanvas.js';

export function addFrameAfter(idx) {
  const newId = `frame_${Date.now()}`;
  const layerData = {};
  state.project.layers.forEach((l) => {
    layerData[l.id] = { tiles: {} };
  });
  state.project.frames.splice(idx + 1, 0, { id: newId, duration: 1, layerData });
  if (state.isPlaying) buildPlaybackTicks();
  setFrameIndex(idx + 1);
  renderTimelineFilmstrip();
  saveHistoryState();
}

export function duplicateFrameAt(idx) {
  const curr = state.project.frames[idx];
  if (!curr) return;
  const dupId = `frame_dup_${Date.now()}`;
  const layerData = {};
  for (const key in curr.layerData) {
    layerData[key] = { tiles: copyTiles(curr.layerData[key]?.tiles) };
  }
  state.project.frames.splice(idx + 1, 0, {
    id: dupId,
    duration: curr.duration || 1,
    tag: curr.tag,
    layerData,
  });
  if (state.isPlaying) buildPlaybackTicks();
  setFrameIndex(idx + 1);
  renderTimelineFilmstrip();
  saveHistoryState();
}

export function deleteFrameAt(idx) {
  if (state.project.frames.length <= 1) return;
  state.project.frames.splice(idx, 1);
  let next = state.currentFrameIndex;
  if (idx < next) next--;
  next = Math.max(0, Math.min(state.project.frames.length - 1, next));
  if (state.isPlaying) buildPlaybackTicks();
  setFrameIndex(next);
  renderTimelineFilmstrip();
  saveHistoryState();
}

export function clearFrameAt(idx) {
  const frame = state.project.frames[idx];
  if (!frame) return;
  frame.layerData[state.activeLayerId] = { tiles: {} };
  if (idx === state.currentFrameIndex) requestRender();
  renderTimelineFilmstrip();
  saveHistoryState();
}

export function setFrameDuration(idx, duration) {
  const frame = state.project.frames[idx];
  if (!frame) return;
  frame.duration = Math.max(1, Math.min(8, Math.round(duration)));
  if (state.isPlaying) buildPlaybackTicks();
  renderTimelineFilmstrip();
  saveHistoryState();
}

export function setFrameTag(idx, tag) {
  const frame = state.project.frames[idx];
  if (!frame) return;
  if (tag) frame.tag = tag;
  else delete frame.tag;
  renderTimelineFilmstrip();
  saveHistoryState();
}

export function moveFrameTo(from, to) {
  const frames = state.project.frames;
  if (from === to || from < 0 || to < 0 || from >= frames.length || to >= frames.length) return;
  const [moved] = frames.splice(from, 1);
  frames.splice(to, 0, moved);

  if (state.currentFrameIndex === from) {
    state.currentFrameIndex = to;
  } else if (from < state.currentFrameIndex && to >= state.currentFrameIndex) {
    state.currentFrameIndex--;
  } else if (from > state.currentFrameIndex && to <= state.currentFrameIndex) {
    state.currentFrameIndex++;
  }
  if (elements.currentFrameNum) elements.currentFrameNum.textContent = state.currentFrameIndex + 1;
  if (state.isPlaying) buildPlaybackTicks();
  renderTimelineFilmstrip();
  saveHistoryState();
}
