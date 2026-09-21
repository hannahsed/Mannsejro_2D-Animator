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
import { drawPerspectiveImage } from '../viewport/perspectiveWarp.js';
import { startNodeQuadWithImage } from '../viewport/nodeDraw.js';

let refMenuEl = null;
let isSeekingVideo = false;
let seekTimeoutId = null;

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

    const isTraceMode = Boolean(refItem.traceMode || refItem.locked);

    // -------------------------------------------------------------
    // A. 4-CORNER PERSPECTIVE WARP MODE
    // -------------------------------------------------------------
    if (refItem.perspectiveMode && refItem.corners) {
      el.style.transform = 'none';
      el.style.left = '0px';
      el.style.top = '0px';
      el.style.width = '100%';
      el.style.height = '100%';
      el.style.pointerEvents = 'none';

      // Update corner handle visual positions
      const pinLabels = ['tl', 'tr', 'br', 'bl'];
      const scrCorners = refItem.corners.map((pt) => worldToScreen(pt.x, pt.y));

      pinLabels.forEach((pin, i) => {
        const handle = el.querySelector(`[data-corner-pin="${pin}"]`);
        if (handle) {
          const scr = scrCorners[i];
          handle.style.left = `${scr.x - 7}px`;
          handle.style.top = `${scr.y - 7}px`;
          handle.style.display = refItem.locked ? 'none' : 'block';
        }
      });

      // Perspective Center Quad Move Handle
      const centerHandle = el.querySelector('[data-corner-pin="center"]');
      if (centerHandle) {
        const avgScrX = (scrCorners[0].x + scrCorners[1].x + scrCorners[2].x + scrCorners[3].x) / 4;
        const avgScrY = (scrCorners[0].y + scrCorners[1].y + scrCorners[2].y + scrCorners[3].y) / 4;
        centerHandle.style.left = `${avgScrX - 9}px`;
        centerHandle.style.top = `${avgScrY - 9}px`;
        centerHandle.style.display = refItem.locked ? 'none' : 'flex';
      }

      // Hide standard handles and direct media element
      el.querySelectorAll('[data-ref-handle]').forEach((h) => (h.style.display = 'none'));
      const mediaEl = el.querySelector('img, video');
      if (mediaEl) mediaEl.style.display = 'none';

      // Header positioning in perspective mode (anchored above top-most corner)
      const headerEl = el.querySelector('.ref-header');
      if (headerEl) {
        const minY = Math.min(...scrCorners.map((p) => p.y));
        const avgX = (scrCorners[0].x + scrCorners[1].x + scrCorners[2].x + scrCorners[3].x) / 4;
        headerEl.style.left = `${avgX}px`;
        headerEl.style.top = `${Math.max(10, minY - 36)}px`;
        headerEl.style.transform = 'translateX(-50%)';
      }

      // Render live perspective warp on internal overlay canvas
      let pCanvas = el.querySelector('canvas.ref-perspective-canvas');
      if (!pCanvas) {
        pCanvas = document.createElement('canvas');
        pCanvas.className = 'ref-perspective-canvas absolute inset-0 pointer-events-none z-10';
        el.appendChild(pCanvas);
      }
      pCanvas.style.display = 'block';

      const rect = elements.canvasContainer.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.round(rect.width * dpr);
      const targetH = Math.round(rect.height * dpr);

      // Only resize canvas backing buffer when dimensions change to prevent GPU re-allocations
      if (pCanvas.width !== targetW || pCanvas.height !== targetH) {
        pCanvas.width = targetW;
        pCanvas.height = targetH;
        pCanvas.style.width = `${rect.width}px`;
        pCanvas.style.height = `${rect.height}px`;
      }

      const pCtx = pCanvas.getContext('2d');
      pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pCtx.clearRect(0, 0, rect.width, rect.height);

      if (mediaEl) {
        pCtx.save();
        pCtx.globalAlpha = refItem.opacity ?? 0.6;
        pCtx.globalCompositeOperation = refItem.blendMode || 'source-over';
        drawPerspectiveImage(pCtx, mediaEl, scrCorners, 10);
        pCtx.restore();

        // Render quadrilateral outline guide in perspective mode when unlocked
        if (!refItem.locked) {
          pCtx.save();
          pCtx.strokeStyle = 'rgba(249, 115, 22, 0.75)';
          pCtx.lineWidth = 1.5;
          pCtx.setLineDash([4, 3]);
          pCtx.beginPath();
          pCtx.moveTo(scrCorners[0].x, scrCorners[0].y);
          pCtx.lineTo(scrCorners[1].x, scrCorners[1].y);
          pCtx.lineTo(scrCorners[2].x, scrCorners[2].y);
          pCtx.lineTo(scrCorners[3].x, scrCorners[3].y);
          pCtx.closePath();
          pCtx.stroke();
          pCtx.restore();
        }
      }
      return;
    }

    // -------------------------------------------------------------
    // B. STANDARD 2D TRANSFORM MODE
    // -------------------------------------------------------------
    const mediaEl = el.querySelector('img, video');
    if (mediaEl) {
      mediaEl.style.display = 'block';
      // Enable direct drawing pass-through when locked or trace mode is active
      mediaEl.style.pointerEvents = isTraceMode ? 'none' : 'auto';
    }

    const pCanvas = el.querySelector('canvas.ref-perspective-canvas');
    if (pCanvas) pCanvas.style.display = 'none';

    // Hide perspective corner pins
    const pinLabels = ['tl', 'tr', 'br', 'bl', 'center'];
    pinLabels.forEach((pin) => {
      const handle = el.querySelector(`[data-corner-pin="${pin}"]`);
      if (handle) handle.style.display = 'none';
    });

    // Standard handles visibility
    el.querySelectorAll('[data-ref-handle]').forEach((h) => {
      h.style.display = refItem.locked ? 'none' : 'block';
    });

    const screenPos = worldToScreen(refItem.x, refItem.y);
    const dispW = Math.max(16, refItem.width * (refItem.scale || 1) * state.zoom);
    const dispH = Math.max(16, refItem.height * (refItem.scale || 1) * state.zoom);

    el.style.left = `${screenPos.x}px`;
    el.style.top = `${screenPos.y}px`;
    el.style.width = `${dispW}px`;
    el.style.height = `${dispH}px`;
    el.style.opacity = refItem.opacity ?? 0.6;
    el.style.mixBlendMode = refItem.blendMode || 'normal';

    // When locked or trace mode is on, pass clicks straight through to the canvas underneath!
    el.style.pointerEvents = isTraceMode ? 'none' : 'auto';

    const flipX = refItem.flipH ? -1 : 1;
    const flipY = refItem.flipV ? -1 : 1;
    el.style.transform = `translate(-50%, -50%) rotate(${refItem.rotation || 0}deg) scale(${flipX}, ${flipY})`;
    el.style.cursor = isTraceMode ? 'default' : 'move';

    // Header positioning (anchored to top-left of overlay, counteract inverse transform if flipped)
    const headerEl = el.querySelector('.ref-header');
    if (headerEl) {
      headerEl.style.transform = `scale(${flipX}, ${flipY})`;
    }

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
  if (!container) return;

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
    el.className = 'absolute z-30 rounded select-none pointer-events-none transition-none';

    const isVideo = refItem.type === 'video';
    const mediaHtml = isVideo
      ? `<video data-video-ref="${refItem.id}" src="${refItem.url}" muted playsinline preload="auto" class="w-full h-full object-contain rounded select-none pointer-events-auto"></video>`
      : `<img src="${refItem.url}" alt="${escapeHtml(refItem.name)}" class="w-full h-full object-contain rounded select-none pointer-events-auto" draggable="false" />`;

    const hudBadge = isVideo
      ? `<span class="ref-video-hud font-mono text-[9px] text-orange-400 font-bold ml-0.5">00:00.00</span>`
      : '';

    el.innerHTML = `
      ${mediaHtml}
      <div class="ref-border absolute inset-0 border-2 ${
        refItem.locked ? 'border-orange-400/80 border-dashed' : 'border-blue-500/80'
      } rounded pointer-events-none"></div>
      
      <!-- Live Info & Quick Action Header (Always clickable) -->
      <div class="ref-header absolute -top-8 left-0 flex items-center gap-1.5 bg-slate-950/90 backdrop-blur-md border border-slate-700/80 rounded-lg px-2 py-1 text-[10px] font-mono text-slate-200 pointer-events-auto shadow-xl whitespace-nowrap z-40">
        <!-- Drag Grip Handle -->
        <span class="ref-header-drag cursor-grab active:cursor-grabbing text-slate-400 hover:text-white mr-0.5 font-sans" title="Drag to move reference">⋮⋮</span>
        <span class="truncate max-w-[110px] font-bold text-slate-100">${escapeHtml(refItem.name)}</span>
        ${hudBadge}
        <span class="text-slate-600">|</span>
        
        <!-- Quick Trace Mode Button -->
        <button class="btn-toggle-trace px-1.5 py-0.5 rounded text-[9px] font-semibold flex items-center gap-1 ${
          refItem.traceMode ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50' : 'text-slate-300 hover:bg-slate-800'
        }" title="Toggle Trace Mode (Click-through to draw directly over reference)">
          <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          <span>Trace</span>
        </button>

        <!-- Lock Button -->
        <button class="btn-quick-lock px-1 py-0.5 rounded text-slate-300 hover:text-white hover:bg-slate-800" title="${
          refItem.locked ? 'Unlock Reference' : 'Lock Reference'
        }">
          <svg class="w-3 h-3 ${refItem.locked ? 'text-orange-400' : 'text-slate-400'}" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a5 5 0 00-5 5v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm-3 8V7a3 3 0 116 0v3H9z"/></svg>
        </button>

        <!-- Stamp Button -->
        <button class="btn-quick-stamp px-1.5 py-0.5 rounded bg-blue-600/40 border border-blue-500/60 hover:bg-blue-600/70 text-blue-200 font-bold text-[9px]" title="Stamp current frame to active drawing layer">Stamp</button>
      </div>

      <!-- 4 Standard Corner Handles -->
      <div data-ref-handle="move" title="Drag to move" class="absolute -left-2 -top-2 w-4 h-4 bg-orange-500 border-2 border-white rounded-sm cursor-move z-30 shadow-md pointer-events-auto"></div>
      <div data-ref-handle="rotate" title="Drag to rotate (Hold Shift to snap 45°)" class="absolute -right-2 -top-2 w-4 h-4 bg-blue-500 border-2 border-white rounded-full cursor-grab z-30 shadow-md pointer-events-auto"></div>
      <div data-ref-handle="lock" title="Click to Lock/Unlock" class="absolute -left-2 -bottom-2 w-4 h-4 ${
        refItem.locked ? 'bg-orange-500' : 'bg-slate-600'
      } border-2 border-white rounded-sm cursor-pointer z-30 flex items-center justify-center shadow-md pointer-events-auto">
        <svg class="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a5 5 0 00-5 5v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm-3 8V7a3 3 0 116 0v3H9z"/></svg>
      </div>
      <div data-ref-handle="scale" title="Drag to scale" class="absolute -right-2 -bottom-2 w-4 h-4 bg-sky-500 border-2 border-white rounded-sm cursor-nwse-resize z-30 shadow-md pointer-events-auto"></div>

      <!-- 4 Perspective Corner Pin Handles -->
      <div data-corner-pin="tl" title="Drag Corner (Top-Left)" class="absolute w-4 h-4 bg-orange-500 border-2 border-white rounded-full cursor-crosshair z-40 shadow-lg pointer-events-auto"></div>
      <div data-corner-pin="tr" title="Drag Corner (Top-Right)" class="absolute w-4 h-4 bg-orange-500 border-2 border-white rounded-full cursor-crosshair z-40 shadow-lg pointer-events-auto"></div>
      <div data-corner-pin="br" title="Drag Corner (Bottom-Right)" class="absolute w-4 h-4 bg-orange-500 border-2 border-white rounded-full cursor-crosshair z-40 shadow-lg pointer-events-auto"></div>
      <div data-corner-pin="bl" title="Drag Corner (Bottom-Left)" class="absolute w-4 h-4 bg-orange-500 border-2 border-white rounded-full cursor-crosshair z-40 shadow-lg pointer-events-auto"></div>
      
      <!-- Center Quad Move Handle (for perspective mode) -->
      <div data-corner-pin="center" title="Drag to move entire perspective quad" class="absolute w-5 h-5 bg-amber-500 border-2 border-white rounded-full cursor-move z-40 shadow-xl items-center justify-center pointer-events-auto hidden">
        <svg class="w-2.5 h-2.5 text-white pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M4 8h16M4 16h16" /></svg>
      </div>
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
    if (ref.loop !== false) {
      target = target % ref.duration;
      if (target < 0) target += ref.duration;
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
        v.playbackRate = ref.playbackRate || 1;
        v.currentTime = targetTime;
        v.play().catch(() => {});
      }
    } else {
      // When paused / scrubbing: Pause and seek precisely to the frame
      if (!v.paused) v.pause();

      if (Math.abs(v.currentTime - targetTime) > 0.02 && !isSeekingVideo) {
        isSeekingVideo = true;
        v.currentTime = targetTime;

        if (seekTimeoutId) clearTimeout(seekTimeoutId);
        seekTimeoutId = setTimeout(() => {
          isSeekingVideo = false;
        }, 120);

        v.addEventListener(
          'seeked',
          () => {
            isSeekingVideo = false;
            if (seekTimeoutId) clearTimeout(seekTimeoutId);
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
    v.playbackRate = ref.playbackRate || 1;
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

export async function extractVideoToAnimationLayer(refId, onProgress) {
  const ref = state.project.referenceMedia.find((r) => r.id === refId);
  if (!ref || ref.type !== 'video') return;

  const fps = state.project.fps || 24;
  const totalFrames = state.project.frames.length;

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

  const newLayerId = `layer_roto_${Date.now()}`;
  state.project.layers.push({
    id: newLayerId,
    name: `Roto: ${ref.name.slice(0, 12)}`,
    visible: true,
    locked: false,
    opacity: 0.85,
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
      setTimeout(resolve, 150);
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
   5. Interactive Handles & Header Bar
------------------------------------------------------------------------- */
function setupReferenceInteraction(el, refItem) {
  // Quick Trace Mode Button
  el.querySelector('.btn-toggle-trace')?.addEventListener('click', (e) => {
    e.stopPropagation();
    refItem.traceMode = !refItem.traceMode;
    updateReferenceOverlaysTransform();
    renderReferenceList();
    showToast(
      refItem.traceMode
        ? 'Trace Mode ON: Click-through enabled to draw directly on canvas'
        : 'Trace Mode OFF: Reference handles active'
    );
    saveHistoryState();
  });

  // Quick Lock Button
  el.querySelector('.btn-quick-lock')?.addEventListener('click', (e) => {
    e.stopPropagation();
    refItem.locked = !refItem.locked;
    updateReferenceOverlaysTransform();
    renderReferenceList();
    showToast(refItem.locked ? `Locked "${refItem.name}"` : `Unlocked "${refItem.name}"`);
    saveHistoryState();
  });

  // Quick Stamp Button
  el.querySelector('.btn-quick-stamp')?.addEventListener('click', (e) => {
    e.stopPropagation();
    stampReferenceToActiveLayer(refItem.id);
  });

  // Header Drag Grip
  const headerDrag = el.querySelector('.ref-header-drag');
  if (headerDrag) {
    headerDrag.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (refItem.locked) {
        showToast('Reference is locked');
        return;
      }

      const startX = refItem.x;
      const startY = refItem.y;
      const startPointer = screenToWorld(e.clientX, e.clientY);
      const startCorners = refItem.corners ? refItem.corners.map((p) => ({ ...p })) : null;

      try {
        headerDrag.setPointerCapture(e.pointerId);
      } catch (_) {}

      const onMove = (me) => {
        const cur = screenToWorld(me.clientX, me.clientY);
        const dx = cur.x - startPointer.x;
        const dy = cur.y - startPointer.y;
        refItem.x = Math.round(startX + dx);
        refItem.y = Math.round(startY + dy);

        if (refItem.perspectiveMode && startCorners) {
          refItem.corners = startCorners.map((p) => ({
            x: Math.round(p.x + dx),
            y: Math.round(p.y + dy),
          }));
        }

        updateReferenceOverlaysTransform();
      };

      const onUp = (ue) => {
        try {
          headerDrag.releasePointerCapture(ue.pointerId);
        } catch (_) {}
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        saveHistoryState();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  // Perspective 4-Corner Pin Handles
  el.querySelectorAll('[data-corner-pin]').forEach((pinHandle) => {
    pinHandle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const pin = pinHandle.dataset.cornerPin;

      if (refItem.locked) {
        showToast('Reference is locked');
        return;
      }

      if (!refItem.corners) {
        const hw = (refItem.width * (refItem.scale || 1)) / 2;
        const hh = (refItem.height * (refItem.scale || 1)) / 2;
        refItem.corners = [
          { x: refItem.x - hw, y: refItem.y - hh }, // TL
          { x: refItem.x + hw, y: refItem.y - hh }, // TR
          { x: refItem.x + hw, y: refItem.y + hh }, // BR
          { x: refItem.x - hw, y: refItem.y + hh }, // BL
        ];
      }

      try {
        pinHandle.setPointerCapture(e.pointerId);
      } catch (_) {}

      if (pin === 'center') {
        // Drag all 4 corners together
        const startCorners = refItem.corners.map((p) => ({ ...p }));
        const startPointer = screenToWorld(e.clientX, e.clientY);
        const startRefX = refItem.x;
        const startRefY = refItem.y;

        const onMove = (me) => {
          const curWorld = screenToWorld(me.clientX, me.clientY);
          const dx = curWorld.x - startPointer.x;
          const dy = curWorld.y - startPointer.y;
          refItem.corners = startCorners.map((p) => ({
            x: Math.round(p.x + dx),
            y: Math.round(p.y + dy),
          }));
          refItem.x = Math.round(startRefX + dx);
          refItem.y = Math.round(startRefY + dy);
          updateReferenceOverlaysTransform();
        };

        const onUp = (ue) => {
          try {
            pinHandle.releasePointerCapture(ue.pointerId);
          } catch (_) {}
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          saveHistoryState();
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return;
      }

      const pinIndex = ['tl', 'tr', 'br', 'bl'].indexOf(pin);
      if (pinIndex === -1) return;

      const onMove = (me) => {
        const curWorld = screenToWorld(me.clientX, me.clientY);
        refItem.corners[pinIndex].x = Math.round(curWorld.x);
        refItem.corners[pinIndex].y = Math.round(curWorld.y);

        // Update center anchor x/y as centroid
        refItem.x = Math.round((refItem.corners[0].x + refItem.corners[1].x + refItem.corners[2].x + refItem.corners[3].x) / 4);
        refItem.y = Math.round((refItem.corners[0].y + refItem.corners[1].y + refItem.corners[2].y + refItem.corners[3].y) / 4);

        updateReferenceOverlaysTransform();
      };

      const onUp = (ue) => {
        try {
          pinHandle.releasePointerCapture(ue.pointerId);
        } catch (_) {}
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        saveHistoryState();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });

  // Standard 4 Handles (Move, Rotate, Lock, Scale)
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

      try {
        handle.setPointerCapture(e.pointerId);
      } catch (_) {}

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
          refItem.scale = Math.max(0.05, Math.min(15, +(startScale * factor).toFixed(3)));
        }
        updateReferenceOverlaysTransform();
      };

      const onUp = (ue) => {
        try {
          handle.releasePointerCapture(ue.pointerId);
        } catch (_) {}
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        renderReferenceList();
        saveHistoryState();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });

  // Body Dragging (only when NOT locked and NOT in trace mode)
  const mediaEl = el.querySelector('img, video');
  if (mediaEl) {
    mediaEl.addEventListener('pointerdown', (e) => {
      if (refItem.locked || refItem.traceMode) return;
      if (e.button !== 0) return;

      e.stopPropagation();
      e.preventDefault();

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
  }

  // Context Menu on right click
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showReferenceContextMenu(refItem.id, e.clientX, e.clientY);
  });
}

/* -------------------------------------------------------------------------
   6. Reference Context Menu
------------------------------------------------------------------------- */
export function showReferenceContextMenu(refId, clientX, clientY) {
  if (!refMenuEl) {
    refMenuEl = document.createElement('div');
    refMenuEl.id = 'reference-context-menu';
    refMenuEl.className =
      'fixed z-[130] min-w-[230px] bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl p-1.5 hidden select-none text-xs text-slate-200';
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
  const isPerspective = Boolean(ref.perspectiveMode);

  const row = (action, label, kbd = '', danger = false) => `
    <button data-ref-action="${action}" class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition ${
      danger ? 'text-orange-400 hover:bg-orange-950/50' : 'hover:bg-slate-800 text-slate-200'
    }">
      <span>${label}</span>
      ${kbd ? `<span class="text-[10px] font-mono text-slate-500">${kbd}</span>` : ''}
    </button>
  `;

  refMenuEl.innerHTML = `
    <div class="px-2.5 py-1 text-[10px] font-mono font-bold text-orange-400 uppercase tracking-wider truncate">${escapeHtml(
      ref.name
    )}</div>

    <!-- Direct Perspective Pin Toggle -->
    <button data-ref-action="toggle-perspective" class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition hover:bg-slate-800 text-slate-200 cursor-pointer">
      <span class="font-bold flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5 text-orange-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6l16-3v14l-16 3V6z"/></svg>
        <span>4-Corner Warp Mode</span>
      </span>
      <span class="text-[10px] font-mono ${isPerspective ? 'text-orange-400 font-bold' : 'text-slate-500'}">
        ${isPerspective ? 'ACTIVE' : 'OFF'}
      </span>
    </button>

    <!-- Trace Mode Toggle -->
    <button data-ref-action="toggle-trace" class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition hover:bg-slate-800 text-slate-200 cursor-pointer">
      <span class="font-bold flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
        <span>Trace Mode (Draw Through)</span>
      </span>
      <span class="text-[10px] font-mono ${ref.traceMode ? 'text-amber-400 font-bold' : 'text-slate-500'}">
        ${ref.traceMode ? 'ON' : 'OFF'}
      </span>
    </button>

    <!-- Fill Shape Tool / Node Quad with this Image -->
    <button data-ref-action="fill-shape-with-image" class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition hover:bg-slate-800 text-slate-200 cursor-pointer">
      <span class="font-bold flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
        <span>Fill Shape/Quad with this Image</span>
      </span>
      <span class="text-[10px] font-mono text-blue-400">Node Draw</span>
    </button>

    <div class="my-1 h-px bg-slate-800"></div>
    ${row('fit-camera', 'Fit to Camera View')}
    ${row('stamp', 'Stamp Frame to Active Layer')}
    ${isVideo ? row('match-timeline', 'Match Timeline to Video Duration') : ''}
    ${isVideo ? row('extract-layer', 'Extract Video to Rotoscope Layer') : ''}
    <div class="my-1 h-px bg-slate-800"></div>
    ${row('flip-h', `Flip Horizontal (${ref.flipH ? 'ON' : 'OFF'})`)}
    ${row('flip-v', `Flip Vertical (${ref.flipV ? 'ON' : 'OFF'})`)}
    ${row('toggle-lock', ref.locked ? 'Unlock Reference' : 'Lock Reference')}
    ${row('toggle-pip', 'Switch to Floating PiP Window')}
    <div class="my-1 h-px bg-slate-800"></div>
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

      if (action === 'toggle-perspective') {
        ref.perspectiveMode = !ref.perspectiveMode;
        if (ref.perspectiveMode && !ref.corners) {
          const hw = (ref.width * (ref.scale || 1)) / 2;
          const hh = (ref.height * (ref.scale || 1)) / 2;
          ref.corners = [
            { x: ref.x - hw, y: ref.y - hh }, // TL
            { x: ref.x + hw, y: ref.y - hh }, // TR
            { x: ref.x + hw, y: ref.y + hh }, // BR
            { x: ref.x - hw, y: ref.y + hh }, // BL
          ];
        }
        updateReferenceOverlaysTransform();
        renderReferenceList();
        saveHistoryState();
        showToast(ref.perspectiveMode ? '4-Corner Pins Active: Drag corners to warp' : 'Perspective warp mode disabled');
      } else if (action === 'toggle-trace') {
        ref.traceMode = !ref.traceMode;
        updateReferenceOverlaysTransform();
        renderReferenceList();
        saveHistoryState();
        showToast(ref.traceMode ? 'Trace Mode Enabled' : 'Trace Mode Disabled');
      } else if (action === 'fill-shape-with-image') {
        startNodeQuadWithImage(ref);
      } else if (action === 'fit-camera') {
        fitReferenceToCamera(ref);
        updateReferenceOverlaysTransform();
        renderReferenceList();
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
        renderReferenceList();
      } else if (action === 'toggle-pip') {
        ref.mode = 'floating';
        renderReferenceList();
        updateReferenceOverlaysTransform();
        updateFloatingRefViewer();
      } else if (action === 'delete') {
        if (ref.url && typeof ref.url === 'string' && ref.url.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(ref.url);
          } catch (_) {}
        }
        state.project.referenceMedia = state.project.referenceMedia.filter((r) => r.id !== ref.id);
        updateReferenceOverlaysTransform();
        renderReferenceList();
      }
      saveHistoryState();
    });
  });
}

/* -------------------------------------------------------------------------
   7. Stamp Reference Frame to Drawing Layer
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

  const frame = currentFrame();
  if (!frame) return;
  const store = frame.layerData[state.activeLayerId] || (frame.layerData[state.activeLayerId] = { tiles: {} });

  if (ref.perspectiveMode && ref.corners) {
    const minX = Math.floor(Math.min(...ref.corners.map((p) => p.x)));
    const minY = Math.floor(Math.min(...ref.corners.map((p) => p.y)));
    const maxX = Math.ceil(Math.max(...ref.corners.map((p) => p.x)));
    const maxY = Math.ceil(Math.max(...ref.corners.map((p) => p.y)));
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);

    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');

    const relCorners = ref.corners.map((p) => ({ x: p.x - minX, y: p.y - minY }));
    ctx.globalAlpha = ref.opacity !== undefined ? ref.opacity : 1;
    ctx.globalCompositeOperation = ref.blendMode || 'source-over';
    drawPerspectiveImage(ctx, mediaEl, relCorners, 12);

    await blitCanvasIntoTiles(store.tiles, c, minX, minY, 'source-over');
  } else {
    const w = Math.round(ref.width * (ref.scale || 1));
    const h = Math.round(ref.height * (ref.scale || 1));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');

    ctx.globalAlpha = ref.opacity !== undefined ? ref.opacity : 1;
    ctx.globalCompositeOperation = ref.blendMode || 'source-over';
    ctx.translate(w / 2, h / 2);
    ctx.rotate(((ref.rotation || 0) * Math.PI) / 180);
    ctx.scale(ref.flipH ? -1 : 1, ref.flipV ? -1 : 1);
    ctx.drawImage(mediaEl, -w / 2, -h / 2, w, h);

    const worldX = ref.x - w / 2;
    const worldY = ref.y - h / 2;
    await blitCanvasIntoTiles(store.tiles, c, worldX, worldY, 'source-over');
  }

  requestRender();
  renderTimelineFilmstrip();
  saveHistoryState();
  showToast(`Stamped reference into "${activeLayer.name}"`);
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

  const hw = (ref.width * ref.scale) / 2;
  const hh = (ref.height * ref.scale) / 2;
  ref.corners = [
    { x: ref.x - hw, y: ref.y - hh },
    { x: ref.x + hw, y: ref.y - hh },
    { x: ref.x + hw, y: ref.y + hh },
    { x: ref.x - hw, y: ref.y + hh },
  ];
}

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  const ms = Math.floor((secs % 1) * 100).toString().padStart(2, '0');
  return `${m}:${s}.${ms}`;
}

/* -------------------------------------------------------------------------
   8. Reference Media Sidebar Panel
------------------------------------------------------------------------- */
export function renderReferenceList() {
  if (!elements.refListContainer) return;
  elements.refListContainer.innerHTML = '';

  const refs = state.project.referenceMedia || [];
  if (refs.length === 0) {
    elements.refListContainer.innerHTML =
      '<div class="text-[11px] text-slate-500 text-center py-6">No references loaded.<br>Import a video or image to start.</div>';
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
      'p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-2.5 text-xs select-none shadow-sm';

    const videoControls =
      isVideo && dur
        ? `
      <div class="pt-2 border-t border-slate-700/50 space-y-2">
        <div class="flex justify-between items-center text-[10px] text-slate-400 font-mono">
          <span>Source: ${dur.toFixed(2)}s</span>
          <span class="text-blue-400 font-bold">~${spanFrames} frames @ ${fps}fps</span>
        </div>

        <div class="grid grid-cols-2 gap-1.5 pt-0.5">
          <button class="btn-match-timeline px-2 py-1 rounded bg-blue-600/30 border border-blue-500/60 hover:bg-blue-600/50 text-blue-200 text-[10px] font-semibold text-center truncate" title="Expand animation timeline to match video length">
            Match Timeline
          </button>
          <button class="btn-extract-layer px-2 py-1 rounded bg-orange-600/30 border border-orange-500/60 hover:bg-orange-600/50 text-orange-200 text-[10px] font-semibold text-center truncate" title="Bake video frame-by-frame into a drawing layer">
            Extract to Layer
          </button>
        </div>

        <div class="space-y-1 pt-1">
          <div class="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>Time offset</span>
            <span class="ref-offset-val text-blue-400 font-bold">${(refItem.timeOffset || 0).toFixed(2)}s</span>
          </div>
          <input type="range" min="0" max="${dur.toFixed(2)}" step="0.01" value="${refItem.timeOffset || 0}" class="ref-offset-slider w-full accent-blue-500 h-1 bg-slate-700 rounded cursor-pointer" />
        </div>

        <div class="flex items-center justify-between text-[10px] text-slate-400">
          <span>Playback Speed</span>
          <select class="ref-rate-select bg-slate-900 text-slate-200 text-[10px] px-1.5 py-0.5 rounded border border-slate-700 outline-none">
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
        <!-- Visibility Eye Toggle -->
        <button class="btn-vis-ref p-1 text-slate-400 hover:text-white" title="${refItem.visible ? 'Hide Reference' : 'Show Reference'}">
          ${
            refItem.visible
              ? '<svg class="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>'
              : '<svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/></svg>'
          }
        </button>

        <span class="font-bold text-slate-200 truncate flex-1 flex items-center gap-1">
          <span>${escapeHtml(refItem.name)}</span>
          ${refItem.locked ? '<svg class="w-3 h-3 text-orange-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>' : ''}
        </span>

        <!-- Trace Mode Toggle -->
        <button class="btn-toggle-trace-sidebar text-[10px] px-1.5 py-0.5 rounded ${
          refItem.traceMode ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50 font-bold' : 'bg-slate-700 text-slate-300'
        }" title="Toggle Trace Mode (Click-through to draw directly over reference)">
          Trace
        </button>

        <!-- 4-Corner Warp Toggle -->
        <button class="btn-toggle-pin flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${
          refItem.perspectiveMode ? 'bg-orange-500 text-white font-bold' : 'bg-slate-700 text-slate-200'
        }" title="Toggle 4-Corner Perspective Warp">
          <svg class="w-2.5 h-2.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 6l16-3v14l-16 3V6z"/></svg>
          <span>Warp</span>
        </button>

        <button class="btn-stamp-ref text-[10px] px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-xs">Stamp</button>
        <button class="btn-fit-ref text-[10px] px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200">Fit</button>
        <button class="btn-del-ref p-1 text-slate-400 hover:text-orange-400" title="Delete Reference">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div class="space-y-1 pt-1">
        <div class="flex justify-between items-center text-[10px] text-slate-400">
          <span>Opacity</span>
          <span class="ref-op-val font-mono text-blue-400 font-bold">${Math.round((refItem.opacity ?? 0.6) * 100)}%</span>
        </div>
        <input type="range" min="5" max="100" value="${Math.round((refItem.opacity ?? 0.6) * 100)}" class="ref-op-slider w-full accent-blue-500 h-1 bg-slate-700 rounded cursor-pointer" />
      </div>

      <div class="flex items-center justify-between text-[10px] text-slate-400 pt-1">
        <span>Blend</span>
        <select class="ref-blend-select bg-slate-900 text-slate-200 text-[10px] px-2 py-0.5 rounded border border-slate-700 outline-none">
          <option value="normal" ${(refItem.blendMode || 'normal') === 'normal' ? 'selected' : ''}>Normal</option>
          <option value="multiply" ${refItem.blendMode === 'multiply' ? 'selected' : ''}>Multiply (Tracing)</option>
          <option value="screen" ${refItem.blendMode === 'screen' ? 'selected' : ''}>Screen</option>
          <option value="difference" ${refItem.blendMode === 'difference' ? 'selected' : ''}>Difference</option>
          <option value="overlay" ${refItem.blendMode === 'overlay' ? 'selected' : ''}>Overlay</option>
        </select>
        <button class="btn-toggle-mode px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold uppercase text-[9px]" title="Toggle between Canvas Overlay and Floating Picture-in-Picture window">${refItem.mode}</button>
      </div>

      ${videoControls}
    `;

    card.querySelector('.btn-vis-ref')?.addEventListener('click', () => {
      refItem.visible = !refItem.visible;
      renderReferenceList();
      updateReferenceOverlaysTransform();
      updateFloatingRefViewer();
      saveHistoryState();
    });

    card.querySelector('.btn-toggle-trace-sidebar')?.addEventListener('click', () => {
      refItem.traceMode = !refItem.traceMode;
      updateReferenceOverlaysTransform();
      renderReferenceList();
      saveHistoryState();
    });

    card.querySelector('.btn-toggle-pin')?.addEventListener('click', () => {
      refItem.perspectiveMode = !refItem.perspectiveMode;
      if (refItem.perspectiveMode && !refItem.corners) {
        const hw = (refItem.width * (refItem.scale || 1)) / 2;
        const hh = (refItem.height * (refItem.scale || 1)) / 2;
        refItem.corners = [
          { x: refItem.x - hw, y: refItem.y - hh },
          { x: refItem.x + hw, y: refItem.y - hh },
          { x: refItem.x + hw, y: refItem.y + hh },
          { x: refItem.x - hw, y: refItem.y + hh },
        ];
      }
      updateReferenceOverlaysTransform();
      renderReferenceList();
      saveHistoryState();
    });

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
        } catch (_) {}
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
   9. Floating PiP Viewer
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
    } catch (_) {}
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
