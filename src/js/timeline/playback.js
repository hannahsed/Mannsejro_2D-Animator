// src/js/timeline/playback.js
import { state, playbackTimer } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { requestRender } from '../render/renderEngine.js';
import { updateFilmstripActiveState, renderTimelineWaveform } from './filmstrip.js';
import { onTimelinePlaybackStart, onTimelinePlaybackStop, syncVideoReferences } from '../ui/referenceUI.js';
import { audioEngine } from '../audio/audioEngine.js';

let playbackTickMap = [];
let playbackTickIndex = 0;

export function buildPlaybackTicks() {
  playbackTickMap = [];
  if (!state.project?.frames) return;
  const inFrame = state.loopIn || 0;
  const outFrame = state.loopOut >= 0 ? state.loopOut : state.project.frames.length - 1;
  for (let idx = inFrame; idx <= outFrame; idx++) {
    const frame = state.project.frames[idx];
    if (!frame) continue;
    const d = Math.max(1, Math.round(frame.duration || 1));
    for (let i = 0; i < d; i++) playbackTickMap.push(idx);
  }
  playbackTickIndex = playbackTickMap.indexOf(state.currentFrameIndex);
  if (playbackTickIndex < 0) playbackTickIndex = 0;
}

export function updateTimecode() {
  if (!state.project) return;
  const fps = state.project.fps || 12;
  const totalSeconds = state.currentFrameIndex / fps;
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  const frames = state.currentFrameIndex % fps;
  const tc = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  if (elements.timecodeDisplay) elements.timecodeDisplay.textContent = tc;
  if (elements.statusTimecode) elements.statusTimecode.textContent = tc;
}

export function setFrameIndex(idx) {
  if (!state.project?.frames) return;
  state.currentFrameIndex = Math.max(0, Math.min(state.project.frames.length - 1, idx));

  // Audio scrub micro-slice with pop-free cosine envelope
  if (!state.isPlaying) {
    audioEngine.scrubToFrame(state.currentFrameIndex, state.project.fps || 12);
  }

  if (elements.currentFrameNum) elements.currentFrameNum.textContent = state.currentFrameIndex + 1;
  if (elements.totalFramesNum) elements.totalFramesNum.textContent = state.project.frames.length;
  requestRender();
  updateFilmstripActiveState();
  renderTimelineWaveform();
  syncVideoReferences();
  updateTimecode();
}

export function togglePlayback() {
  if (state.isPlaying) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

export function startPlaybackInterval() {
  buildPlaybackTicks();
  const interval = 1000 / (state.project?.fps || 12);
  playbackTimer.id = setInterval(() => {
    if (playbackTickMap.length === 0) return;
    const nextTick = playbackTickIndex + 1;
    if (nextTick >= playbackTickMap.length) {
      if (state.loop) {
        playbackTickIndex = 0;
        // Loop audio
        audioEngine.startPlayback(0, state.project?.fps || 12);
      } else {
        stopPlayback();
        return;
      }
    } else {
      playbackTickIndex = nextTick;
    }
    const target = playbackTickMap[playbackTickIndex];
    if (target !== state.currentFrameIndex) setFrameIndex(target);
  }, interval);
}

export function startPlayback() {
  state.isPlaying = true;
  if (elements.iconPlay) elements.iconPlay.classList.add('hidden');
  if (elements.iconPause) elements.iconPause.classList.remove('hidden');
  
  // Synchronized audio start
  audioEngine.startPlayback(state.currentFrameIndex, state.project?.fps || 12);

  // Hardware-accelerate reference video playback
  onTimelinePlaybackStart();
  startPlaybackInterval();
}

export function stopPlayback() {
  state.isPlaying = false;
  audioEngine.stopPlayback();

  if (playbackTimer.id) {
    clearInterval(playbackTimer.id);
    playbackTimer.id = null;
  }
  if (elements.iconPlay) elements.iconPlay.classList.remove('hidden');
  if (elements.iconPause) elements.iconPause.classList.add('hidden');
  
  // Pause and seek reference video to exact millisecond timestamp
  onTimelinePlaybackStop();
}

