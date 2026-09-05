import { state, currentFrame, renderTokenState, renderScheduledState, shiftTraceState } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { drawTilesInWorldRect, TILE, tileKey, getTileImage } from '../infiniteCanvas.js';
import { getVisibleWorldRect, positionCameraOverlay } from '../viewport/camera.js';
import { updateMarqueeDisplay, renderFloatingSelectionOverlay } from '../viewport/floatingSelection.js';
export { updateMarqueeDisplay, updateMarqueeDisplay as renderSelectionMarquee } from '../viewport/floatingSelection.js';
import { updateReferenceOverlaysTransform } from '../ui/referenceUI.js';
import { rgbaToHex } from '../colorUtils.js';

export function applyWorldTransform(ctx, rect) {
  ctx.translate(rect.width / 2 + state.pan.x, rect.height / 2 + state.pan.y);
  ctx.scale(state.zoom, state.zoom);
}

export async function drawLayerTiles(ctx, frame, layer, vis) {
  if (!layer || !layer.visible) return;
  const tiles = frame.layerData[layer.id]?.tiles;
  if (!tiles) return;
  ctx.save();
  ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1;
  ctx.globalCompositeOperation = layer.blendMode || 'source-over';
  await drawTilesInWorldRect(ctx, tiles, vis);
  ctx.restore();
}

// Composite a group of layers that may contain clipping masks
export async function drawLayerGroupWithClipping(ctx, frame, layers, vis, rect) {
  let i = 0;
  while (i < layers.length) {
    const baseLayer = layers[i];
    if (!baseLayer.visible) {
      i++;
      continue;
    }

    // Check if subsequent layers are clipped to this base layer
    const clippedGroup = [];
    let j = i + 1;
    while (j < layers.length && layers[j].clippingMask) {
      if (layers[j].visible) clippedGroup.push(layers[j]);
      j++;
    }

    if (clippedGroup.length === 0) {
      // Standard layer
      await drawLayerTiles(ctx, frame, baseLayer, vis);
    } else {
      // Create an offscreen buffer for the base layer + its clipping chain
      const buf = document.createElement('canvas');
      buf.width = ctx.canvas.width;
      buf.height = ctx.canvas.height;
      const bctx = buf.getContext('2d');
      bctx.setTransform(ctx.getTransform());

      // 1. Draw base silhouette
      await drawLayerTiles(bctx, frame, baseLayer, vis);

      // 2. Draw clipped children with source-atop
      for (const child of clippedGroup) {
        bctx.save();
        bctx.globalCompositeOperation = 'source-atop';
        bctx.globalAlpha = child.opacity !== undefined ? child.opacity : 1;
        await drawTilesInWorldRect(bctx, frame.layerData[child.id]?.tiles, vis);
        bctx.restore();
      }

      // 3. Composite group into destination
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = baseLayer.opacity !== undefined ? baseLayer.opacity : 1;
      ctx.globalCompositeOperation = baseLayer.blendMode || 'source-over';
      ctx.drawImage(buf, 0, 0);
      ctx.restore();
    }

    i = j;
  }
}

async function drawOnionScreen(ctx, rect, dpr) {
  const os = state.onionSkin;
  if (!os.enabled || !state.project?.frames) return;
  const frames = state.project.frames;
  const idx = state.currentFrameIndex;
  const vis = getVisibleWorldRect();
  const jobs = [];

  for (let i = 1; i <= os.prevFrames; i++) {
    const fi = idx - i;
    if (fi >= 0) {
      jobs.push({
        frame: frames[fi],
        color: os.prevColor || '#ef4444',
        alpha: os.opacity * (1 - (i - 1) / Math.max(1, os.prevFrames)) * 0.75,
      });
    }
  }
  for (let i = 1; i <= os.nextFrames; i++) {
    const fi = idx + i;
    if (fi < frames.length) {
      jobs.push({
        frame: frames[fi],
        color: os.nextColor || '#10b981',
        alpha: os.opacity * (1 - (i - 1) / Math.max(1, os.nextFrames)) * 0.75,
      });
    }
  }

  for (const job of jobs) {
    const tmp = document.createElement('canvas');
    tmp.width = Math.max(1, Math.round(rect.width * dpr));
    tmp.height = Math.max(1, Math.round(rect.height * dpr));
    const tctx = tmp.getContext('2d');
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    applyWorldTransform(tctx, rect);

    for (const layer of state.project.layers) {
      if (!layer.visible) continue;
      await drawTilesInWorldRect(tctx, job.frame.layerData[layer.id]?.tiles, vis);
    }

    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.globalCompositeOperation = 'source-in';
    tctx.fillStyle = job.color;
    tctx.fillRect(0, 0, tmp.width, tmp.height);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = job.alpha;
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
  }
}

async function drawShiftAndTrace(ctx, rect, dpr) {
  if (!shiftTraceState.active || !state.project?.frames) return;
  const frames = state.project.frames;
  const targetIdx = shiftTraceState.frameIndex !== null ? shiftTraceState.frameIndex : (state.currentFrameIndex - 1);
  if (targetIdx < 0 || targetIdx >= frames.length) return;

  const targetFrame = frames[targetIdx];
  const vis = getVisibleWorldRect();

  const tmp = document.createElement('canvas');
  tmp.width = Math.max(1, Math.round(rect.width * dpr));
  tmp.height = Math.max(1, Math.round(rect.height * dpr));
  const tctx = tmp.getContext('2d');
  tctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Apply world transform + shiftTraceState offsets
  tctx.translate(
    rect.width / 2 + state.pan.x + (shiftTraceState.offsetX || 0) * state.zoom,
    rect.height / 2 + state.pan.y + (shiftTraceState.offsetY || 0) * state.zoom
  );
  if (shiftTraceState.rotation) {
    tctx.rotate((shiftTraceState.rotation * Math.PI) / 180);
  }
  if (shiftTraceState.scale && shiftTraceState.scale !== 1) {
    tctx.scale(shiftTraceState.scale, shiftTraceState.scale);
  }
  tctx.scale(state.zoom, state.zoom);

  for (const layer of state.project.layers) {
    if (!layer.visible) continue;
    await drawTilesInWorldRect(tctx, targetFrame.layerData[layer.id]?.tiles, vis);
  }

  // 40% blue tint for shift and trace alignment
  tctx.setTransform(1, 0, 0, 1, 0, 0);
  tctx.globalCompositeOperation = 'source-in';
  tctx.fillStyle = shiftTraceState.color || '#3b82f6';
  tctx.fillRect(0, 0, tmp.width, tmp.height);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = shiftTraceState.opacity || 0.4;
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();
}

function drawGrid(ctx, vis) {
  const step = 64;
  const x0 = Math.floor(vis.x / step) * step;
  const y0 = Math.floor(vis.y / step) * step;
  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.lineWidth = 1 / state.zoom;
  ctx.beginPath();
  for (let x = x0; x <= vis.x + vis.w; x += step) {
    ctx.moveTo(x, vis.y);
    ctx.lineTo(x, vis.y + vis.h);
  }
  for (let y = y0; y <= vis.y + vis.h; y += step) {
    ctx.moveTo(vis.x, y);
    ctx.lineTo(vis.x + vis.w, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawFloatingSelectionWorld(ctx) {
  const sel = state.floatingSelection;
  if (!sel || !sel.canvas) return;
  ctx.save();
  ctx.translate(sel.x, sel.y);
  ctx.rotate((sel.rotation * Math.PI) / 180);
  ctx.scale(sel.scale, sel.scale);
  ctx.drawImage(sel.canvas, -sel.width / 2, -sel.height / 2);
  ctx.restore();
}

export async function renderViewport() {
  const token = ++renderTokenState.token;
  const canvas = elements.viewportCanvas;
  if (!canvas || !elements.canvasContainer) return;

  const rect = elements.canvasContainer.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.max(1, Math.round(rect.width * dpr));
  const ph = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== pw) canvas.width = pw;
  if (canvas.height !== ph) canvas.height = ph;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = state.project?.backgroundColor || '#ffffff';
  ctx.fillRect(0, 0, rect.width, rect.height);

  const frame = currentFrame();
  if (!frame) {
    positionCameraOverlay();
    return;
  }

  const vis = getVisibleWorldRect();
  const layers = state.project.layers;
  const activeIdx = layers.findIndex((l) => l.id === state.activeLayerId);

  // Lower layers (before active layer)
  ctx.save();
  applyWorldTransform(ctx, rect);
  if (activeIdx > 0) {
    const lowerLayers = layers.slice(0, activeIdx);
    await drawLayerGroupWithClipping(ctx, frame, lowerLayers, vis, rect);
    if (token !== renderTokenState.token) return;
  }
  ctx.restore();
  if (token !== renderTokenState.token) return;

  // Onion skin
  await drawOnionScreen(ctx, rect, dpr);
  if (token !== renderTokenState.token) return;

  // Shift and Trace (for aligning distant keyframes without altering project data)
  await drawShiftAndTrace(ctx, rect, dpr);
  if (token !== renderTokenState.token) return;

  // Active layer & upper layers
  ctx.save();
  applyWorldTransform(ctx, rect);
  if (activeIdx >= 0) {
    const currentAndUpperLayers = layers.slice(activeIdx);
    await drawLayerGroupWithClipping(ctx, frame, currentAndUpperLayers, vis, rect);
    if (token !== renderTokenState.token) return;

    // Live floating selection rendered in world coordinates on top of active layer
    drawFloatingSelectionWorld(ctx);
  }

  if (state.showGrid) drawGrid(ctx, vis);
  ctx.restore();

  positionCameraOverlay();
  updateMarqueeDisplay();
  renderFloatingSelectionOverlay();

  // Sticking reference transforms in lockstep with the infinite canvas world
  updateReferenceOverlaysTransform();
}

export function requestRender() {
  if (renderScheduledState.scheduled) return;
  renderScheduledState.scheduled = true;
  requestAnimationFrame(() => {
    renderScheduledState.scheduled = false;
    renderViewport();
  });
}

export const renderAllCanvases = requestRender;

export async function sampleWorldColor(wx, wy) {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext('2d');
  ctx.fillStyle = state.project?.backgroundColor || '#ffffff';
  ctx.fillRect(0, 0, 1, 1);
  const px = Math.floor(wx / TILE);
  const py = Math.floor(wy / TILE);
  const frame = currentFrame();
  if (!frame) return null;

  for (const layer of state.project.layers) {
    if (!layer.visible) continue;
    const tiles = frame.layerData[layer.id]?.tiles;
    if (!tiles) continue;
    const img = await getTileImage(tiles[tileKey(px, py)]);
    if (!img) continue;
    ctx.save();
    ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1;
    ctx.globalCompositeOperation = layer.blendMode || 'source-over';
    ctx.drawImage(img, px * TILE - wx, py * TILE - wy);
    ctx.restore();
  }
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return d[3] > 0 ? rgbaToHex(d[0], d[1], d[2]) : null;
}
