// src/js/timeline/filmstrip.js
import { state } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { renderCameraView } from '../exportEngine.js';
import { stopPlayback, setFrameIndex, startPlayback } from './playback.js';
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

export function renderTimelineFilmstrip() {
  if (!elements.filmstripScrollArea || !state.project?.frames) return;
  elements.filmstripScrollArea.innerHTML = '';

  const inFrame = state.loopIn || 0;
  const outFrame = state.loopOut >= 0 ? state.loopOut : state.project.frames.length - 1;

  state.project.frames.forEach((frame, idx) => {
    const isActive = idx === state.currentFrameIndex;
    const inLoop = idx >= inFrame && idx <= outFrame;
    const item = document.createElement('div');
    item.dataset.frameIndex = idx;
    item.title = `Frame ${idx + 1} — click to select · right-click for options`;
    item.className = `flex-shrink-0 w-24 h-24 rounded-xl border flex flex-col items-center justify-between p-1.5 cursor-pointer transition relative group select-none ${
      isActive
        ? 'bg-indigo-950/70 border-indigo-500 shadow-md shadow-indigo-600/20'
        : 'bg-zinc-850/60 border-zinc-800 hover:border-zinc-700'
    } ${inLoop ? 'border-t-2 border-t-emerald-500' : ''}`;
    const tagHtml = frame.tag
      ? `<span class="text-[9px] font-bold px-1 py-0.5 rounded ${
          frame.tag.includes('Key')
            ? 'bg-amber-500/90 text-zinc-950'
            : frame.tag.includes('Break')
              ? 'bg-indigo-500 text-white'
              : 'bg-zinc-700 text-zinc-300'
        }">${frame.tag.includes('Inbetween') ? 'Inbtw' : frame.tag}</span>`
      : '';
    const holdHtml =
      (frame.duration || 1) > 1
        ? `<span class="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-500/90 text-zinc-950">×${frame.duration}</span>`
        : '';
    item.innerHTML = `
      <div class="flex items-center justify-between w-full text-[10px] font-mono">
        <span class="frame-num-label ${isActive ? 'text-indigo-300 font-bold' : 'text-zinc-400'}">#${idx + 1}</span>
        <span class="flex items-center gap-1">${holdHtml}${tagHtml}</span>
      </div>
      <div class="absolute bottom-0.5 left-1.5 right-1.5 h-0.5 rounded bg-zinc-800 overflow-hidden">
        <div class="h-full bg-amber-400" style="width: ${Math.min(100, ((frame.duration || 1) / 4) * 100)}%"></div>
      </div>
    `;
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = THUMB_W;
    thumbCanvas.height = THUMB_H;
    thumbCanvas.className = 'w-16 h-12 rounded bg-white object-contain border border-zinc-700/60 mt-1';
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
    item.classList.toggle('bg-indigo-950/70', isActive);
    item.classList.toggle('border-indigo-500', isActive);
    item.classList.toggle('shadow-md', isActive);
    item.classList.toggle('shadow-indigo-600/20', isActive);
    item.classList.toggle('bg-zinc-850/60', !isActive);
    item.classList.toggle('border-zinc-800', !isActive);
    const numEl = item.querySelector('.frame-num-label');
    if (numEl) {
      numEl.classList.toggle('text-indigo-300', isActive);
      numEl.classList.toggle('font-bold', isActive);
      numEl.classList.toggle('text-zinc-400', !isActive);
    }
  });
}

export function setReorderIndicator(idx) {
  if (!elements.filmstripScrollArea) return;
  const items = elements.filmstripScrollArea.querySelectorAll('[data-frame-index]');
  items.forEach((item) => {
    const i = parseInt(item.dataset.frameIndex, 10);
    item.classList.toggle('ring-2', i === idx);
    item.classList.toggle('ring-indigo-400', i === idx);
  });
}

export function clearReorderIndicator() {
  if (!elements.filmstripScrollArea) return;
  const items = elements.filmstripScrollArea.querySelectorAll('[data-frame-index]');
  items.forEach((item) => {
    item.classList.remove('ring-2', 'ring-indigo-400', 'opacity-60');
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
    'fixed z-[100] min-w-[230px] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-1.5 hidden select-none text-xs';
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

  const rowBtn = 'w-full text-left px-2 py-1.5 rounded-lg text-zinc-200 hover:bg-zinc-800 transition';
  const chip = (active) =>
    `px-2 py-1 rounded-lg border font-semibold transition ${
      active
        ? 'bg-indigo-600 border-indigo-500 text-white'
        : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
    }`;
  const tagChip = (active) =>
    `px-2 py-1 rounded-lg border font-semibold transition ${
      active
        ? 'bg-amber-500 border-amber-400 text-zinc-950'
        : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
    }`;

  menu.innerHTML = `
    <div class="px-2 py-1 text-[10px] font-mono text-zinc-500">FRAME ${idx + 1}</div>
    <button data-action="duplicate" class="${rowBtn}">Duplicate Frame <span class="text-zinc-500 font-mono">Ctrl+D</span></button>
    <div class="my-1 h-px bg-zinc-800"></div>
    <div class="px-2 py-1 text-[10px] text-zinc-500">HOLD / EXPOSURE</div>
    <div class="flex gap-1 px-1.5 pb-1.5">
      ${[1, 2, 3, 4].map((n) => `<button data-action="hold" data-hold="${n}" class="${chip(dur === n)}">${n}×</button>`).join('')}
    </div>
    <div class="px-2 py-1 text-[10px] text-zinc-500">TAG</div>
    <div class="flex gap-1 px-1.5 pb-1.5 flex-wrap">
      <button data-action="tag" data-tag="Key" class="${tagChip(tag.includes('Key'))}">Key</button>
      <button data-action="tag" data-tag="Breakdown" class="${tagChip(tag.includes('Break'))}">Break</button>
      <button data-action="tag" data-tag="Inbetween" class="${tagChip(tag === 'Inbetween')}">Inbetween</button>
      <button data-action="tag" data-tag="" class="${chip(!tag)}">None</button>
    </div>
    <div class="my-1 h-px bg-zinc-800"></div>
    <button data-action="move-left" class="${rowBtn}" ${idx === 0 ? 'disabled style="opacity:.35"' : ''}>← Move Left</button>
    <button data-action="move-right" class="${rowBtn}" ${idx === last ? 'disabled style="opacity:.35"' : ''}>Move Right →</button>
    <div class="my-1 h-px bg-zinc-800"></div>
    <div class="px-2 py-1 text-[10px] text-zinc-500">LOOP RANGE</div>
    <button data-action="loop-in" class="${rowBtn}">Set Loop In (Start)</button>
    <button data-action="loop-out" class="${rowBtn}">Set Loop Out (End)</button>
    <button data-action="loop-clear" class="${rowBtn}">Clear Loop Range</button>
    <button data-action="clear" class="${rowBtn}">Clear Drawing (active layer)</button>
    <div class="my-1 h-px bg-zinc-800"></div>
    <button data-action="delete" class="w-full text-left px-2 py-1.5 rounded-lg text-red-300 hover:bg-red-900/50 transition ${canDelete ? '' : 'opacity-35'}" ${canDelete ? '' : 'disabled'}>Delete Frame</button>
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

