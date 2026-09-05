// src/js/ui/referenceUI.js
import { state, currentFrame } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { worldToScreen, screenToWorld } from '../viewport/camera.js';
import { blitCanvasIntoTiles } from '../infiniteCanvas.js';
import { requestRender } from '../render/renderEngine.js';
import { renderTimelineFilmstrip } from '../timeline/filmstrip.js';
import { renderLayersList } from './layersUI.js';
import { saveHistoryState } from '../project/history.js';
import { showToast, escapeHtml } from './toast.js';

let refMenuEl = null;
let isSeekingVideo = false;

/* -------------------------------------------------------------------------
   1. Real-time Viewport & Position Transform
------------------------------------------------------------------------- */
export function updateReferenceOverlaysTransform() {
  if (!elements.refOverlaysContainer || !state.project?.referenceMedia) return;

  const activeRefs = state.project.referenceMedia.filter((r) => r.visible && r.mode === 'overlay');
  syncReferenceOverlayDOM(activeRefs);

  activeRefs.forEach((refItem) => {
    const el = elements.refOverlaysContainer.querySelector(`[data-ref-id="${refItem.id}"]`);
    if (!el) return;

    const screenPos = worldToScreen(refItem.x, refItem.y);
    const dispW = refItem.width * (refItem.scale || 1) * state.zoom;
    const dispH = refItem.height * (refItem.scale || 1) * state.zoom;

    el.style.left = `${screenPos.x}px`;
    el.style.top = `${screenPos.y}px`;
    el.style.width = `${dispW}px`;
    el.style.height = `${dispH}px`;
    el.style.opacity = refItem.opacity ?? 0.6;
    el.style.mixBlendMode = refItem.blendMode || 'normal';

    const flipX = refItem.flipH ? -1 : 1;
    const flipY = refItem.flipV ? -1 : 1;
    el.style.transform = `translate(-50%, -50%) rotate(${refItem.rotation || 0}deg) scale(${flipX}, ${flipY})`;
    el.style.cursor = refItem.locked ? 'not-allowed' : 'move';

    // Live Video HUD update
    if (refItem.type === 'video') {
      const hud = el.querySelector('.ref-video-hud');
      if (hud) {
        const fps = state.project.fps || 24;
        const targetTime = calculateVideoTargetTime(refItem, state.currentFrameIndex, fps);
        const curFrameNum = Math.floor(targetTime * fps) + 1;
        const totalFrames = refItem.duration ? Math.ceil(refItem.duration * fps) : '?';
        hud.textContent = `${formatTime(targetTime)} [F${curFrameNum}/${totalFrames}]`;
      }
    }
  });

  syncVideoReferences();
}

// Backward-compatible alias for existing callers
export const renderReferenceOverlays = updateReferenceOverlaysTransform;

/* -------------------------------------------------------------------------
   2. DOM Synchronization
------------------------------------------------------------------------- */
function syncReferenceOverlayDOM(activeRefs) {
  const container = elements.refOverlaysContainer;
  const currentDomIds = new Set();

  container.querySelectorAll('[data-ref-id]').forEach((el) => {
    const id = el.dataset.refId;
    if (!activeRefs.some((r) => r.id === id)) {
      el.remove();
    } else {
      currentDomIds.add(id);
    }
  });

  activeRefs.forEach((refItem) => {
    if (currentDomIds.has(refItem.id)) return;

    const el = document.createElement('div');
    el.dataset.refId = refItem.id;
    el.className = 'absolute z-40 rounded select-none pointer-events-auto shadow-2xl transition-none';

    const isVideo = refItem.type === 'video';
    const mediaHtml = isVideo
      ? `<video data-video-ref="${refItem.id}" src="${refItem.url}" muted playsinline preload="auto" class="w-full h-full object-contain rounded pointer-events-none"></video>`
      : `<img src="${refItem.url}" alt="${escapeHtml(refItem.name)}" class="w-full h-full object-contain rounded pointer-events-none" draggable="false" />`;

    const hudBadge = isVideo
      ? `<span class="ref-video-hud font-mono text-[9px] text-amber-400 font-bold ml-1">00:00.00</span>`
      : '';

    el.innerHTML = `
      ${mediaHtml}
      <div class="ref-border absolute inset-0 border-2 ${refItem.locked ? 'border-amber-400/90' : 'border-indigo-400/90'} rounded pointer-events-none"></div>
      
      <!-- Live Info & Quick Action Header -->
      <div class="absolute -top-7 left-0 flex items-center gap-1.5 bg-zinc-950/90 backdrop-blur-md border border-zinc-700/80 rounded-md px-2 py-0.5 text-[10px] font-mono text-zinc-200 pointer-events-auto shadow-md whitespace-nowrap">
        <span class="truncate max-w-[120px] font-bold">${escapeHtml(refItem.name)}</span>
        ${hudBadge}
        <span class="text-zinc-600">|</span>
        <button class="btn-quick-stamp hover:text-amber-300 font-bold" title="Stamp current frame to active drawing layer">Stamp</button>
      </div>

      <!-- 4 Corner Handles -->
      <div data-ref-handle="move" title="Drag to move" class="absolute -left-2 -top-2 w-4 h-4 bg-rose-500 border-2 border-white rounded-sm cursor-move z-20 shadow-md"></div>
      <div data-ref-handle="rotate" title="Drag to rotate (Hold Shift to snap 45°)" class="absolute -right-2 -top-2 w-4 h-4 bg-indigo-500 border-2 border-white rounded-full cursor-grab z-20 shadow-md"></div>
      <div data-ref-handle="lock" title="Click to Lock/Unlock" class="absolute -left-2 -bottom-2 w-4 h-4 ${
        refItem.locked ? 'bg-amber-500' : 'bg-zinc-600'
      } border-2 border-white rounded-sm cursor-pointer z-20 flex items-center justify-center shadow-md">
        <svg class="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a5 5 0 00-5 5v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm-3 8V7a3 3 0 116 0v3H9z"/></svg>
      </div>
      <div data-ref-handle="scale" title="Drag to scale" class="absolute -right-2 -bottom-2 w-4 h-4 bg-emerald-500 border-2 border-white rounded-sm cursor-nwse-resize z-20 shadow-md"></div>
    `;

    setupReferenceInteraction(el, refItem);
    container.appendChild(el);
  });
}

/* -------------------------------------------------------------------------
   3. Perfect Sub-Frame Video Sync & Playback
------------------------------------------------------------------------- */
export function calculateVideoTargetTime(ref, frameIndex, fps) {
  const rate = ref.playbackRate || 1;
  const offset = ref.timeOffset || 0;
  const projectTime = frameIndex / fps;
  let target = offset + projectTime * rate;

  if (ref.duration && ref.duration > 0) {
    if (ref.loop) {
      target = target % ref.duration;
    } else {
      target = Math.max(0, Math.min(ref.duration, target));
    }
  }
  return target;
}

export function syncVideoReferences() {
  const fps = state.project.fps || 24;

  document.querySelectorAll('video[data-video-ref]').forEach((v) => {
    const ref = state.project.referenceMedia.find((r) => r.id === v.dataset.videoRef);
    if (!ref || !ref.duration) return;

    const targetTime = calculateVideoTargetTime(ref, state.currentFrameIndex, fps);

    if (state.isPlaying) {
      // During active timeline playback: run native hardware decode synchronized to rate
      if (v.paused) {
        v.playbackRate = (ref.playbackRate || 1);
        v.currentTime = targetTime;
        v.play().catch(() => {});
      }
    } else {
      // When paused / scrubbing: Pause and seek precisely to the millisecond
      if (!v.paused) v.pause();

      if (Math.abs(v.currentTime - targetTime) > 0.015 && !isSeekingVideo) {
        isSeekingVideo = true;
        v.currentTime = targetTime;
        v.addEventListener(
          'seeked',
          () => {
            isSeekingVideo = false;
          },
          { once: true }
        );
      }
    }
  });
}

export function onTimelinePlaybackStart() {
  const fps = state.project.fps || 24;
  document.querySelectorAll('video[data-video-ref]').forEach((v) => {
    const ref = state.project.referenceMedia.find((r) => r.id === v.dataset.videoRef);
    if (!ref) return;
    v.currentTime = calculateVideoTargetTime(ref, state.currentFrameIndex, fps);
    v.playbackRate = (ref.playbackRate || 1);
    v.play().catch(() => {});
  });
}

export function onTimelinePlaybackStop() {
  document.querySelectorAll('video[data-video-ref]').forEach((v) => {
    v.pause();
  });
  syncVideoReferences();
}

/* -------------------------------------------------------------------------
   4. Frame-Accurate Timeline Actions: Match Timeline & Extract Layer
------------------------------------------------------------------------- */
/**
 * Extends or aligns the project timeline frames to match the video duration exactly.
 */
export function matchTimelineToVideoDuration(refId) {
  const ref = state.project.referenceMedia.find((r) => r.id === refId);
  if (!ref || !ref.duration) {
    showToast('Video duration unavailable');
    return;
  }

  const fps = state.project.fps || 24;
  const rate = ref.playbackRate || 1;
  const neededFrames = Math.max(1, Math.ceil((ref.duration / rate) * fps));
  const currentCount = state.project.frames.length;

  if (neededFrames === currentCount) {
    showToast(`Timeline already matches video (${neededFrames} frames)`);
    return;
  }

  if (neededFrames > currentCount) {
    // Add blank frames until the timeline length matches video
    for (let i = currentCount; i < neededFrames; i++) {
      const layerData = {};
      state.project.layers.forEach((l) => (layerData[l.id] = { tiles: {} }));
      state.project.frames.push({
        id: `frame_${Date.now()}_${i}`,
        duration: 1,
        layerData,
      });
    }
  } else {
    // Trim excess frames
    state.project.frames.splice(neededFrames);
    if (state.currentFrameIndex >= neededFrames) {
      state.currentFrameIndex = neededFrames - 1;
    }
  }

  renderTimelineFilmstrip();
  updateReferenceOverlaysTransform();
  saveHistoryState();
  showToast(`Timeline aligned: ${neededFrames} frames @ ${fps} FPS (${ref.duration.toFixed(2)}s)`);
}

/**
 * Extracts and stamps every single frame of the video across the timeline into a dedicated drawing layer.
 */
export async function extractVideoToAnimationLayer(refId, onProgress) {
  const ref = state.project.referenceMedia.find((r) => r.id === refId);
  if (!ref || ref.type !== 'video') return;

  const fps = state.project.fps || 24;
  const totalFrames = state.project.frames.length;

  // Create an offscreen video decoder element to avoid disturbing the UI
  const v = document.createElement('video');
  v.src = ref.url;
  v.muted = true;
  v.preload = 'auto';
  await new Promise((res) => {
    v.onloadeddata = res;
    v.onerror = res;
  });

  const w = Math.round(ref.width * (ref.scale || 1));
  const h = Math.round(ref.height * (ref.scale || 1));
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = w;
  tempCanvas.height = h;
  const ctx = tempCanvas.getContext('2d');

  // Create a new Rotoscoping drawing layer
  const newLayerId = `layer_roto_${Date.now()}`;
  state.project.layers.push({
    id: newLayerId,
    name: `Roto: ${ref.name.slice(0, 12)}`,
    visible: true,
    locked: false,
    opacity: 0.8,
    blendMode: 'source-over',
    clippingMask: false,
    alphaLocked: false,
    colorTag: 'amber',
  });
  state.project.frames.forEach((f) => (f.layerData[newLayerId] = { tiles: {} }));

  showToast('Extracting video frames to layer…');

  for (let i = 0; i < totalFrames; i++) {
    const targetTime = calculateVideoTargetTime(ref, i, fps);
    v.currentTime = targetTime;

    await new Promise((resolve) => {
      v.addEventListener('seeked', resolve, { once: true });
      setTimeout(resolve, 150); // Fallback timeout
    });

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(((ref.rotation || 0) * Math.PI) / 180);
    ctx.scale(ref.flipH ? -1 : 1, ref.flipV ? -1 : 1);
    ctx.drawImage(v, -w / 2, -h / 2, w, h);
    ctx.restore();

    const worldX = ref.x - w / 2;
    const worldY = ref.y - h / 2;
    const frame = state.project.frames[i];
    await blitCanvasIntoTiles(frame.layerData[newLayerId].tiles, tempCanvas, worldX, worldY, 'source-over');

    if (onProgress) onProgress(Math.round(((i + 1) / totalFrames) * 100));
  }

  state.activeLayerId = newLayerId;
  renderLayersList();
  renderTimelineFilmstrip();
  requestRender();
  saveHistoryState();
  showToast(`Successfully extracted ${totalFrames} frames to layer!`);
}

/* -------------------------------------------------------------------------
   5. Interactive Handles & Context Menu
------------------------------------------------------------------------- */
function setupReferenceInteraction(el, refItem) {
  el.querySelector('.btn-quick-stamp')?.addEventListener('click', (e) => {
    e.stopPropagation();
    stampReferenceToActiveLayer(refItem.id);
  });

  el.querySelectorAll('[data-ref-handle]').forEach((handle) => {
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const mode = handle.dataset.refHandle;

      if (mode === 'lock') {
        refItem.locked = !refItem.locked;
        updateReferenceOverlaysTransform();
        renderReferenceList();
        showToast(refItem.locked ? `Locked "${refItem.name}"` : `Unlocked "${refItem.name}"`);
        saveHistoryState();
        return;
      }

      if (refItem.locked) {
        showToast('Reference is locked');
        return;
      }

      const startX = refItem.x;
      const startY = refItem.y;
      const startRot = refItem.rotation || 0;
      const startScale = refItem.scale || 1;
      const startPointer = screenToWorld(e.clientX, e.clientY);
      const centerScreen = worldToScreen(refItem.x, refItem.y);
      const startAngle = Math.atan2(e.clientY - centerScreen.y, e.clientX - centerScreen.x);
      const startDist = Math.hypot(e.clientX - centerScreen.x, e.clientY - centerScreen.y) || 1;

      const onMove = (me) => {
        if (mode === 'move') {
          const cur = screenToWorld(me.clientX, me.clientY);
          refItem.x = Math.round(startX + (cur.x - startPointer.x));
          refItem.y = Math.round(startY + (cur.y - startPointer.y));
        } else if (mode === 'rotate') {
          const curAngle = Math.atan2(me.clientY - centerScreen.y, me.clientX - centerScreen.x);
          let degrees = startRot + ((curAngle - startAngle) * 180) / Math.PI;
          if (me.shiftKey) degrees = Math.round(degrees / 45) * 45;
          refItem.rotation = Math.round(degrees);
        } else if (mode === 'scale') {
          const factor = Math.hypot(me.clientX - centerScreen.x, me.clientY - centerScreen.y) / startDist;
          refItem.scale = Math.max(0.05, Math.min(10, +(startScale * factor).toFixed(3)));
        }
        updateReferenceOverlaysTransform();
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        renderReferenceList();
        saveHistoryState();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });

  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-ref-handle]') || e.target.closest('button')) return;
    if (e.button !== 0 || refItem.locked) return;
    e.stopPropagation();

    const startX = refItem.x;
    const startY = refItem.y;
    const startPointer = screenToWorld(e.clientX, e.clientY);

    const onMove = (me) => {
      const cur = screenToWorld(me.clientX, me.clientY);
      refItem.x = Math.round(startX + (cur.x - startPointer.x));
      refItem.y = Math.round(startY + (cur.y - startPointer.y));
      updateReferenceOverlaysTransform();
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      saveHistoryState();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showReferenceContextMenu(refItem.id, e.clientX, e.clientY);
  });
}

function showReferenceContextMenu(refId, clientX, clientY) {
  if (!refMenuEl) {
    refMenuEl = document.createElement('div');
    refMenuEl.id = 'reference-context-menu';
    refMenuEl.className =
      'fixed z-[130] min-w-[220px] bg-zinc-900/95 backdrop-blur-md border border-zinc-700/80 rounded-2xl shadow-2xl p-1.5 hidden select-none text-xs text-zinc-200';
    document.body.appendChild(refMenuEl);

    window.addEventListener(
      'pointerdown',
      (e) => {
        if (!refMenuEl.classList.contains('hidden') && !refMenuEl.contains(e.target)) {
          refMenuEl.classList.add('hidden');
        }
      },
      true
    );
  }

  const ref = state.project.referenceMedia.find((r) => r.id === refId);
  if (!ref) return;

  const isVideo = ref.type === 'video';

  const row = (action, label, kbd = '', danger = false) => `
    <button data-ref-action="${action}" class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition ${
      danger ? 'text-rose-400 hover:bg-rose-950/50' : 'hover:bg-zinc-800 text-zinc-200'
    }">
      <span>${label}</span>
      ${kbd ? `<span class="text-[10px] font-mono text-zinc-500">${kbd}</span>` : ''}
    </button>
  `;

  refMenuEl.innerHTML = `
    <div class="px-2.5 py-1 text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider truncate">${escapeHtml(
      ref.name
    )}</div>
    ${row('fit-camera', 'Fit to Camera Frame')}
    ${row('stamp', 'Stamp Frame to Layer')}
    ${isVideo ? row('match-timeline', 'Match Timeline to Video Duration') : ''}
    ${isVideo ? row('extract-layer', 'Extract Video to New Layer') : ''}
    <div class="my-1 h-px bg-zinc-800"></div>
    ${row('flip-h', `Flip Horizontal (${ref.flipH ? 'ON' : 'OFF'})`)}
    ${row('flip-v', `Flip Vertical (${ref.flipV ? 'ON' : 'OFF'})`)}
    ${row('toggle-lock', ref.locked ? 'Unlock Reference' : 'Lock Reference')}
    ${row('toggle-pip', 'Switch to Floating PiP Window')}
    <div class="my-1 h-px bg-zinc-800"></div>
    ${row('delete', 'Delete Reference', 'Del', true)}
  `;

  refMenuEl.classList.remove('hidden');
  const rect = refMenuEl.getBoundingClientRect();
  refMenuEl.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - rect.width - 12))}px`;
  refMenuEl.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - rect.height - 12))}px`;

  refMenuEl.querySelectorAll('[data-ref-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.refAction;
      refMenuEl.classList.add('hidden');

      if (action === 'fit-camera') {
        fitReferenceToCamera(ref);
        updateReferenceOverlaysTransform();
      } else if (action === 'stamp') {
        stampReferenceToActiveLayer(ref.id);
      } else if (action === 'match-timeline') {
        matchTimelineToVideoDuration(ref.id);
      } else if (action === 'extract-layer') {
        extractVideoToAnimationLayer(ref.id);
      } else if (action === 'flip-h') {
        ref.flipH = !ref.flipH;
        updateReferenceOverlaysTransform();
      } else if (action === 'flip-v') {
        ref.flipV = !ref.flipV;
        updateReferenceOverlaysTransform();
      } else if (action === 'toggle-lock') {
        ref.locked = !ref.locked;
        updateReferenceOverlaysTransform();
      } else if (action === 'toggle-pip') {
        ref.mode = 'floating';
        renderReferenceList();
        updateReferenceOverlaysTransform();
        updateFloatingRefViewer();
      } else if (action === 'delete') {
        state.project.referenceMedia = state.project.referenceMedia.filter((r) => r.id !== ref.id);
        updateReferenceOverlaysTransform();
        renderReferenceList();
      }
      saveHistoryState();
    });
  });
}

/* -------------------------------------------------------------------------
   6. Stamp / Freeze Reference Frame
------------------------------------------------------------------------- */
export async function stampReferenceToActiveLayer(refId) {
  const ref = state.project.referenceMedia.find((r) => r.id === refId);
  if (!ref) return;

  const activeLayer = state.project.layers.find((l) => l.id === state.activeLayerId);
  if (!activeLayer || activeLayer.locked || !activeLayer.visible) {
    showToast('Cannot stamp to locked or hidden layer');
    return;
  }

  const domEl = elements.refOverlaysContainer.querySelector(`[data-ref-id="${ref.id}"]`);
  const mediaEl = domEl?.querySelector('img, video');
  if (!mediaEl) return;

  const w = Math.round(ref.width * (ref.scale || 1));
  const h = Math.round(ref.height * (ref.scale || 1));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  ctx.translate(w / 2, h / 2);
  ctx.rotate(((ref.rotation || 0) * Math.PI) / 180);
  ctx.scale(ref.flipH ? -1 : 1, ref.flipV ? -1 : 1);
  ctx.drawImage(mediaEl, -w / 2, -h / 2, w, h);

  const worldX = ref.x - w / 2;
  const worldY = ref.y - h / 2;
  const frame = currentFrame();
  const store = frame.layerData[state.activeLayerId] || (frame.layerData[state.activeLayerId] = { tiles: {} });
  await blitCanvasIntoTiles(store.tiles, c, worldX, worldY, 'source-over');

  requestRender();
  renderTimelineFilmstrip();
  saveHistoryState();
  showToast(`Stamped frame into "${activeLayer.name}"`);
}

export function fitReferenceToCamera(ref) {
  const cam = state.project.camera || { x: 640, y: 360, scale: 1, rotation: 0 };
  const cw = state.project.width * (cam.scale || 1);
  const ch = state.project.height * (cam.scale || 1);
  const fitScale = Math.min(cw / ref.width, ch / ref.height);

  ref.scale = +(fitScale * 0.95).toFixed(3);
  ref.x = cam.x;
  ref.y = cam.y;
  ref.rotation = cam.rotation || 0;
  ref.flipH = false;
  ref.flipV = false;
}

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  const ms = Math.floor((secs % 1) * 100).toString().padStart(2, '0');
  return `${m}:${s}.${ms}`;
}

/* -------------------------------------------------------------------------
   7. Reference Media Sidebar Panel
------------------------------------------------------------------------- */
export function renderReferenceList() {
  if (!elements.refListContainer) return;
  elements.refListContainer.innerHTML = '';

  const refs = state.project.referenceMedia || [];
  if (refs.length === 0) {
    elements.refListContainer.innerHTML =
      '<div class="text-[11px] text-zinc-500 text-center py-6">No references loaded.<br>Import a video or image to start.</div>';
    return;
  }

  refs.forEach((refItem) => {
    const isVideo = refItem.type === 'video';
    const rate = refItem.playbackRate || 1;
    const dur = refItem.duration;
    const fps = state.project.fps || 24;
    const spanFrames = isVideo && dur ? Math.ceil((dur / rate) * fps) : null;

    const card = document.createElement('div');
    card.className =
      'p-3 bg-zinc-800/60 rounded-xl border border-zinc-700/60 space-y-2.5 text-xs select-none shadow-sm';

    const videoControls =
      isVideo && dur
        ? `
      <div class="pt-2 border-t border-zinc-700/50 space-y-2">
        <div class="flex justify-between items-center text-[10px] text-zinc-400 font-mono">
          <span>Source: ${dur.toFixed(2)}s</span>
          <span class="text-indigo-400 font-bold">~${spanFrames} frames @ ${fps}fps</span>
        </div>

        <div class="grid grid-cols-2 gap-1.5 pt-0.5">
          <button class="btn-match-timeline px-2 py-1 rounded bg-indigo-600/30 border border-indigo-500/60 hover:bg-indigo-600/50 text-indigo-200 text-[10px] font-semibold text-center truncate" title="Expand animation timeline to match video length">
            Match Timeline
          </button>
          <button class="btn-extract-layer px-2 py-1 rounded bg-amber-600/30 border border-amber-500/60 hover:bg-amber-600/50 text-amber-200 text-[10px] font-semibold text-center truncate" title="Bake video frame-by-frame into a drawing layer">
            Extract to Layer
          </button>
        </div>

        <div class="space-y-1 pt-1">
          <div class="flex justify-between text-[10px] text-zinc-400 font-mono">
            <span>Time offset</span>
            <span class="ref-offset-val text-indigo-400 font-bold">${(refItem.timeOffset || 0).toFixed(2)}s</span>
          </div>
          <input type="range" min="0" max="${dur.toFixed(2)}" step="0.01" value="${refItem.timeOffset || 0}" class="ref-offset-slider w-full accent-indigo-500 h-1 bg-zinc-700 rounded cursor-pointer" />
        </div>

        <div class="flex items-center justify-between text-[10px] text-zinc-400">
          <span>Playback Speed</span>
          <select class="ref-rate-select bg-zinc-900 text-zinc-200 text-[10px] px-1.5 py-0.5 rounded border border-zinc-700 outline-none">
            <option value="0.25" ${rate === 0.25 ? 'selected' : ''}>0.25×</option>
            <option value="0.5" ${rate === 0.5 ? 'selected' : ''}>0.5×</option>
            <option value="1" ${rate === 1 ? 'selected' : ''}>1× match</option>
            <option value="2" ${rate === 2 ? 'selected' : ''}>2×</option>
          </select>
        </div>
      </div>`
        : '';

    card.innerHTML = `
      <div class="flex items-center justify-between gap-1.5">
        <span class="font-bold text-zinc-200 truncate flex-1">${escapeHtml(refItem.name)}${refItem.locked ? ' 🔒' : ''}</span>
        <button class="btn-stamp-ref text-[10px] px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-xs">Stamp</button>
        <button class="btn-fit-ref text-[10px] px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200">Fit</button>
        <button class="btn-del-ref p-1 text-zinc-400 hover:text-rose-400">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div class="space-y-1 pt-1">
        <div class="flex justify-between items-center text-[10px] text-zinc-400">
          <span>Opacity</span>
          <span class="ref-op-val font-mono text-indigo-400 font-bold">${Math.round((refItem.opacity ?? 0.6) * 100)}%</span>
        </div>
        <input type="range" min="5" max="100" value="${Math.round((refItem.opacity ?? 0.6) * 100)}" class="ref-op-slider w-full accent-indigo-500 h-1 bg-zinc-700 rounded cursor-pointer" />
      </div>

      <div class="flex items-center justify-between text-[10px] text-zinc-400 pt-1">
        <span>Blend</span>
        <select class="ref-blend-select bg-zinc-900 text-zinc-200 text-[10px] px-2 py-0.5 rounded border border-zinc-700 outline-none">
          <option value="normal" ${(refItem.blendMode || 'normal') === 'normal' ? 'selected' : ''}>Normal</option>
          <option value="multiply" ${refItem.blendMode === 'multiply' ? 'selected' : ''}>Multiply (Tracing)</option>
          <option value="screen" ${refItem.blendMode === 'screen' ? 'selected' : ''}>Screen</option>
          <option value="difference" ${refItem.blendMode === 'difference' ? 'selected' : ''}>Difference</option>
        </select>
        <button class="btn-toggle-mode px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-semibold uppercase text-[9px]">${refItem.mode}</button>
      </div>

      ${videoControls}
    `;

    card.querySelector('.btn-stamp-ref')?.addEventListener('click', () => stampReferenceToActiveLayer(refItem.id));
    card.querySelector('.btn-fit-ref')?.addEventListener('click', () => {
      fitReferenceToCamera(refItem);
      updateReferenceOverlaysTransform();
      renderReferenceList();
      saveHistoryState();
    });
    card.querySelector('.btn-del-ref')?.addEventListener('click', () => {
      if (refItem.url && typeof refItem.url === 'string' && refItem.url.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(refItem.url);
        } catch (err) {}
      }
      state.project.referenceMedia = state.project.referenceMedia.filter((r) => r.id !== refItem.id);
      updateReferenceOverlaysTransform();
      renderReferenceList();
      saveHistoryState();
    });
    card.querySelector('.ref-op-slider')?.addEventListener('input', (e) => {
      refItem.opacity = parseInt(e.target.value, 10) / 100;
      card.querySelector('.ref-op-val').textContent = `${Math.round(refItem.opacity * 100)}%`;
      updateReferenceOverlaysTransform();
    });
    card.querySelector('.ref-blend-select')?.addEventListener('change', (e) => {
      refItem.blendMode = e.target.value;
      updateReferenceOverlaysTransform();
      saveHistoryState();
    });
    card.querySelector('.btn-toggle-mode')?.addEventListener('click', () => {
      refItem.mode = refItem.mode === 'overlay' ? 'floating' : 'overlay';
      renderReferenceList();
      updateReferenceOverlaysTransform();
      updateFloatingRefViewer();
    });

    if (isVideo && dur) {
      card.querySelector('.btn-match-timeline')?.addEventListener('click', () => matchTimelineToVideoDuration(refItem.id));
      card.querySelector('.btn-extract-layer')?.addEventListener('click', () => extractVideoToAnimationLayer(refItem.id));
      card.querySelector('.ref-offset-slider')?.addEventListener('input', (ev) => {
        const val = parseFloat(ev.target.value);
        refItem.timeOffset = val;
        card.querySelector('.ref-offset-val').textContent = `${val.toFixed(2)}s`;
        syncVideoReferences();
      });
      card.querySelector('.ref-rate-select')?.addEventListener('change', (ev) => {
        refItem.playbackRate = parseFloat(ev.target.value);
        renderReferenceList();
        syncVideoReferences();
      });
    }

    elements.refListContainer.appendChild(card);
  });
}

/* -------------------------------------------------------------------------
   8. Floating PiP Viewer
------------------------------------------------------------------------- */
export function updateFloatingRefViewer() {
  const floatingRef = (state.project.referenceMedia || []).find((r) => r.visible && r.mode === 'floating');
  if (!elements.floatingRefViewer) return;
  if (!floatingRef) {
    elements.floatingRefViewer.classList.add('hidden');
    return;
  }
  elements.floatingRefViewer.classList.remove('hidden');
  if (elements.floatingRefTitle) elements.floatingRefTitle.textContent = floatingRef.name;
  if (elements.floatingRefBody) {
    elements.floatingRefBody.innerHTML =
      floatingRef.type === 'video'
        ? `<video src="${floatingRef.url}" controls muted playsinline autoplay loop class="max-w-full max-h-full object-contain rounded"></video>`
        : `<img src="${floatingRef.url}" alt="${escapeHtml(floatingRef.name)}" class="max-w-full max-h-full object-contain rounded" />`;
  }
}

export function setupFloatingRefDragging() {
  if (!elements.floatingRefHeader || !elements.floatingRefViewer) return;
  let isDragging = false;
  let startOffset = { x: 0, y: 0 };
  let startPos = { top: 70, left: 80 };

  elements.floatingRefHeader.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#btn-close-floating-ref')) return;
    isDragging = true;
    startOffset = { x: e.clientX, y: e.clientY };
    const rect = elements.floatingRefViewer.getBoundingClientRect();
    startPos = { top: rect.top, left: rect.left };
    try {
      elements.floatingRefHeader.setPointerCapture(e.pointerId);
    } catch (err) {}
  });

  window.addEventListener('pointermove', (e) => {
    if (isDragging) {
      const dx = e.clientX - startOffset.x;
      const dy = e.clientY - startOffset.y;
      elements.floatingRefViewer.style.left = `${Math.max(10, startPos.left + dx)}px`;
      elements.floatingRefViewer.style.top = `${Math.max(10, startPos.top + dy)}px`;
    }
  });

  window.addEventListener('pointerup', () => {
    isDragging = false;
  });
}
