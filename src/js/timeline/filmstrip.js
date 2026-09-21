// src/js/timeline/filmstrip.js
import { state } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { renderCameraView } from '../exportEngine.js';
import { stopPlayback, setFrameIndex, startPlayback } from './playback.js';
import { CameraTrack } from '../viewport/cameraTrack.js';
import { audioEngine } from '../audio/audioEngine.js';
import { requestRender } from '../render/renderEngine.js';
import {
  duplicateFrameAt,
  setFrameDuration,
  setFrameTag,
  moveFrameTo,
  clearFrameAt,
  deleteFrameAt,
} from './frameOperations.js';

const THUMB_W = 64;
const THUMB_H = 48;

let frameMenuEl = null;
let frameMenuIdx = -1;

export function renderTimelineWaveform() {
  const canvas = elements.waveformCanvas || document.getElementById('waveform-canvas');
  if (!canvas || !state.project) return;
  const totalFrames = state.project.frames?.length || 1;
  const fps = state.project.fps || 12;
  const currentFrame = state.currentFrameIndex || 0;
  audioEngine.renderWaveformToCanvas(canvas, totalFrames, fps, currentFrame);
}

export function renderTimelineFilmstrip() {
  if (!elements.filmstripScrollArea || !state.project?.frames) return;
  elements.filmstripScrollArea.innerHTML = '';

  const inFrame = state.loopIn || 0;
  const outFrame = state.loopOut >= 0 ? state.loopOut : state.project.frames.length - 1;
  const camTrack = CameraTrack.getTrack(state.project);
  const camKeyframeIndices = new Set((camTrack.keyframes || []).map((k) => k.frame));

  state.project.frames.forEach((frame, idx) => {
    const isActive = idx === state.currentFrameIndex;
    const inLoop = idx >= inFrame && idx <= outFrame;
    const hasCamKey = camTrack.enabled && camKeyframeIndices.has(idx);

    const item = document.createElement('div');
    item.dataset.frameIndex = idx;
    item.title = `Frame ${idx + 1} — click to select · right-click for options`;
    item.className = `flex-shrink-0 w-24 h-24 rounded-xl border flex flex-col items-center justify-between p-1.5 cursor-pointer transition relative group select-none ${
      isActive
        ? 'bg-blue-950/70 border-blue-500 shadow-md shadow-blue-600/20'
        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
    } ${inLoop ? 'border-t-2 border-t-sky-500' : ''}`;
    const tagHtml = frame.tag
      ? `<span class="text-[9px] font-bold px-1 py-0.5 rounded ${
          frame.tag.includes('Key')
            ? 'bg-orange-500/90 text-slate-950'
            : frame.tag.includes('Break')
              ? 'bg-blue-500 text-white'
              : 'bg-slate-700 text-slate-300'
        }">${frame.tag.includes('Inbetween') ? 'Inbtw' : frame.tag}</span>`
      : '';
    const holdHtml =
      (frame.duration || 1) > 1
        ? `<span class="text-[9px] font-bold px-1 py-0.5 rounded bg-orange-500/90 text-slate-950">×${frame.duration}</span>`
        : '';
    const camKeyHtml = hasCamKey
      ? `<span title="Camera Keyframe (◆)" class="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-500 text-slate-950 shadow-xs">◆</span>`
      : '';

    item.innerHTML = `
      <div class="flex items-center justify-between w-full text-[10px] font-mono">
        <span class="frame-num-label ${isActive ? 'text-blue-300 font-bold' : 'text-slate-400'}">#${idx + 1}</span>
        <span class="flex items-center gap-0.5">${camKeyHtml}${holdHtml}${tagHtml}</span>
      </div>
      <div class="absolute bottom-0.5 left-1.5 right-1.5 h-0.5 rounded bg-slate-800 overflow-hidden">
        <div class="h-full bg-orange-400" style="width: ${Math.min(100, ((frame.duration || 1) / 4) * 100)}%"></div>
      </div>
    `;
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = THUMB_W;
    thumbCanvas.height = THUMB_H;
    thumbCanvas.className = 'w-16 h-12 rounded bg-white object-contain border border-slate-700/60 mt-1';
    item.appendChild(thumbCanvas);

    item.addEventListener('click', () => {
      stopPlayback();
      setFrameIndex(idx);
    });

    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showFrameContextMenu(idx, e.clientX, e.clientY);
    });

    elements.filmstripScrollArea.appendChild(item);

    (async () => {
      const thumbCtx = thumbCanvas.getContext('2d');
      if (!thumbCtx) return;
      await renderCameraView(state.project, frame, thumbCtx, THUMB_W, THUMB_H);
    })();
  });
}

/** Cheap in-place active-highlight update (hot path while scrubbing). */
export function updateFilmstripActiveState() {
  if (!elements.filmstripScrollArea) return;
  const items = elements.filmstripScrollArea.querySelectorAll('[data-frame-index]');
  items.forEach((item) => {
    const idx = parseInt(item.dataset.frameIndex, 10);
    const isActive = idx === state.currentFrameIndex;
    item.classList.toggle('bg-blue-950/70', isActive);
    item.classList.toggle('border-blue-500', isActive);
    item.classList.toggle('shadow-md', isActive);
    item.classList.toggle('shadow-blue-600/20', isActive);
    item.classList.toggle('bg-slate-900/60', !isActive);
    item.classList.toggle('border-slate-800', !isActive);
    const numEl = item.querySelector('.frame-num-label');
    if (numEl) {
      numEl.classList.toggle('text-blue-300', isActive);
      numEl.classList.toggle('font-bold', isActive);
      numEl.classList.toggle('text-slate-400', !isActive);
    }
  });
}

export function setReorderIndicator(idx) {
  if (!elements.filmstripScrollArea) return;
  const items = elements.filmstripScrollArea.querySelectorAll('[data-frame-index]');
  items.forEach((item) => {
    const i = parseInt(item.dataset.frameIndex, 10);
    item.classList.toggle('ring-2', i === idx);
    item.classList.toggle('ring-blue-400', i === idx);
  });
}

export function clearReorderIndicator() {
  if (!elements.filmstripScrollArea) return;
  const items = elements.filmstripScrollArea.querySelectorAll('[data-frame-index]');
  items.forEach((item) => {
    item.classList.remove('ring-2', 'ring-blue-400', 'opacity-60');
  });
}

export function hideFrameMenu() {
  if (frameMenuEl) frameMenuEl.classList.add('hidden');
  frameMenuIdx = -1;
}

export function getFrameMenu() {
  if (frameMenuEl) return frameMenuEl;
  frameMenuEl = document.createElement('div');
  frameMenuEl.id = 'frame-context-menu';
  frameMenuEl.className =
    'fixed z-[100] min-w-[230px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 hidden select-none text-xs';
  document.body.appendChild(frameMenuEl);

  window.addEventListener(
    'pointerdown',
    (e) => {
      if (!frameMenuEl.classList.contains('hidden') && !frameMenuEl.contains(e.target)) hideFrameMenu();
    },
    true
  );
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') hideFrameMenu();
    },
    true
  );
  window.addEventListener('resize', hideFrameMenu);
  if (elements.filmstripScrollArea) {
    elements.filmstripScrollArea.addEventListener('scroll', hideFrameMenu);
  }

  frameMenuEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const action = btn.dataset.action;
    const idx = frameMenuIdx;
    hideFrameMenu();
    if (idx < 0) return;
    if (action === 'duplicate') duplicateFrameAt(idx);
    else if (action === 'hold') setFrameDuration(idx, parseInt(btn.dataset.hold, 10));
    else if (action === 'tag') setFrameTag(idx, btn.dataset.tag || '');
    else if (action === 'move-left') moveFrameTo(idx, idx - 1);
    else if (action === 'move-right') moveFrameTo(idx, idx + 1);
    else if (action === 'loop-in') {
      state.loopIn = idx;
      renderTimelineFilmstrip();
      if (state.isPlaying) {
        stopPlayback();
        startPlayback();
      }
    } else if (action === 'loop-out') {
      state.loopOut = idx;
      renderTimelineFilmstrip();
      if (state.isPlaying) {
        stopPlayback();
        startPlayback();
      }
    } else if (action === 'loop-clear') {
      state.loopIn = 0;
      state.loopOut = -1;
      renderTimelineFilmstrip();
      if (state.isPlaying) {
        stopPlayback();
        startPlayback();
      }
    } else if (action === 'clear') clearFrameAt(idx);
    else if (action === 'delete') deleteFrameAt(idx);
  });

  return frameMenuEl;
}

export function showFrameContextMenu(idx, clientX, clientY) {
  const menu = getFrameMenu();
  const frame = state.project.frames[idx];
  if (!frame) return;
  frameMenuIdx = idx;
  const dur = frame.duration || 1;
  const tag = frame.tag || '';
  const last = state.project.frames.length - 1;
  const canDelete = state.project.frames.length > 1;

  const rowBtn = 'w-full text-left px-2 py-1.5 rounded-lg text-slate-200 hover:bg-slate-800 transition';
  const chip = (active) =>
    `px-2 py-1 rounded-lg border font-semibold transition ${
      active
        ? 'bg-blue-600 border-blue-500 text-white'
        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
    }`;
  const tagChip = (active) =>
    `px-2 py-1 rounded-lg border font-semibold transition ${
      active
        ? 'bg-orange-500 border-orange-400 text-slate-950'
        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
    }`;

  menu.innerHTML = `
    <div class="px-2 py-1 text-[10px] font-mono text-slate-500">FRAME ${idx + 1}</div>
    <button data-action="duplicate" class="${rowBtn}">Duplicate Frame <span class="text-slate-500 font-mono">Ctrl+D</span></button>
    <div class="my-1 h-px bg-slate-800"></div>
    <div class="px-2 py-1 text-[10px] text-slate-500">HOLD / EXPOSURE</div>
    <div class="flex gap-1 px-1.5 pb-1.5">
      ${[1, 2, 3, 4].map((n) => `<button data-action="hold" data-hold="${n}" class="${chip(dur === n)}">${n}×</button>`).join('')}
    </div>
    <div class="px-2 py-1 text-[10px] text-slate-500">TAG</div>
    <div class="flex gap-1 px-1.5 pb-1.5 flex-wrap">
      <button data-action="tag" data-tag="Key" class="${tagChip(tag.includes('Key'))}">Key</button>
      <button data-action="tag" data-tag="Breakdown" class="${tagChip(tag.includes('Break'))}">Break</button>
      <button data-action="tag" data-tag="Inbetween" class="${tagChip(tag === 'Inbetween')}">Inbetween</button>
      <button data-action="tag" data-tag="" class="${chip(!tag)}">None</button>
    </div>
    <div class="my-1 h-px bg-slate-800"></div>
    <button data-action="move-left" class="${rowBtn}" ${idx === 0 ? 'disabled style="opacity:.35"' : ''}>← Move Left</button>
    <button data-action="move-right" class="${rowBtn}" ${idx === last ? 'disabled style="opacity:.35"' : ''}>Move Right →</button>
    <div class="my-1 h-px bg-slate-800"></div>
    <div class="px-2 py-1 text-[10px] text-slate-500">LOOP RANGE</div>
    <button data-action="loop-in" class="${rowBtn}">Set Loop In (Start)</button>
    <button data-action="loop-out" class="${rowBtn}">Set Loop Out (End)</button>
    <button data-action="loop-clear" class="${rowBtn}">Clear Loop Range</button>
    <button data-action="clear" class="${rowBtn}">Clear Drawing (active layer)</button>
    <div class="my-1 h-px bg-slate-800"></div>
    <button data-action="delete" class="w-full text-left px-2 py-1.5 rounded-lg text-orange-400 hover:bg-orange-950/60 transition ${canDelete ? '' : 'opacity-35'}" ${canDelete ? '' : 'disabled'}>Delete Frame</button>
  `;
  menu.classList.remove('hidden');
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(clientX, window.innerWidth - rect.width - 8))}px`;
  menu.style.top = `${Math.max(4, Math.min(clientY, window.innerHeight - rect.height - 8))}px`;
}

export function setupFilmstripScroll() {
  if (!elements.filmstripScrollArea) return;
  elements.filmstripScrollArea.addEventListener(
    'wheel',
    (e) => {
      if (e.deltaY !== 0 && e.deltaX === 0) {
        e.preventDefault();
        elements.filmstripScrollArea.scrollLeft += e.deltaY;
      }
    },
    { passive: false }
  );
}

export function isTimelineCollapsed() {
  const timeline = elements.studioTimeline || document.getElementById('studio-timeline');
  return timeline ? timeline.classList.contains('timeline-collapsed') : false;
}

/**
 * Toggles timeline between full filmstrip (176px) and compact bottom bar (40px)
 */
export function toggleTimelineCollapse(forceState) {
  const timeline = elements.studioTimeline || document.getElementById('studio-timeline');
  if (!timeline) return;

  const shouldCollapse = forceState !== undefined 
    ? forceState 
    : !timeline.classList.contains('timeline-collapsed');

  const waveform = document.getElementById('timeline-waveform-wrap');
  const filmstrip = document.getElementById('filmstrip-scroll-area');
  const toggleIcon = document.getElementById('icon-timeline-collapse');
  const toggleLabel = document.getElementById('label-timeline-collapse');
  const toggleBtn = document.getElementById('btn-toggle-timeline');

  if (shouldCollapse) {
    timeline.classList.add('timeline-collapsed');
    timeline.classList.remove('h-44');
    timeline.classList.add('h-10');

    if (waveform) waveform.classList.add('hidden');
    if (filmstrip) filmstrip.classList.add('hidden');
    if (toggleIcon) toggleIcon.style.transform = 'rotate(180deg)';
    if (toggleLabel) toggleLabel.textContent = 'Expand';
    if (toggleBtn) {
      toggleBtn.title = 'Expand Full Filmstrip (\\)';
      toggleBtn.classList.add('text-orange-400');
    }
  } else {
    timeline.classList.remove('timeline-collapsed');
    timeline.classList.remove('h-10');
    timeline.classList.add('h-44');

    if (waveform) waveform.classList.remove('hidden');
    if (filmstrip) filmstrip.classList.remove('hidden');
    if (toggleIcon) toggleIcon.style.transform = 'rotate(0deg)';
    if (toggleLabel) toggleLabel.textContent = 'Bar';
    if (toggleBtn) {
      toggleBtn.title = 'Collapse Timeline to Bar (\\)';
      toggleBtn.classList.remove('text-orange-400');
    }

    renderTimelineFilmstrip();
    renderTimelineWaveform();
  }

  try {
    localStorage.setItem('mannsejro_timeline_collapsed', shouldCollapse ? 'true' : 'false');
  } catch (e) {}

  // Resize canvas stage and re-render viewport
  requestRender();
  setTimeout(() => {
    requestRender();
    if (!shouldCollapse) renderTimelineWaveform();
  }, 240);
}

/**
 * Sets up click, double-click, and saved-preference listeners
 */
export function setupTimelineCollapse() {
  const toggleBtn = document.getElementById('btn-toggle-timeline');
  toggleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTimelineCollapse();
  });

  // Double-click empty area on header bar to toggle
  const headerBar = document.getElementById('timeline-header-bar');
  headerBar?.addEventListener('dblclick', (e) => {
    if (e.target.closest('button') || e.target.closest('select') || e.target.closest('input') || e.target.closest('label')) return;
    toggleTimelineCollapse();
  });

  // Restore saved preference
  try {
    const saved = localStorage.getItem('mannsejro_timeline_collapsed');
    if (saved === 'true') {
      toggleTimelineCollapse(true);
    }
  } catch (e) {}
}


