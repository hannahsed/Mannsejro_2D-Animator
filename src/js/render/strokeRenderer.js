// src/js/render/strokeRenderer.js
import { state, currentFrame } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { drawStroke, drawShape } from '../canvasUtils.js';
import { applyWorldTransform, requestRender } from './renderEngine.js';
import { renderTimelineFilmstrip } from '../timeline/filmstrip.js';
import { scheduleAutosave } from '../project/autosave.js';
import { commandManager, AddStrokeCommand } from '../project/commandManager.js';
import { simplifyStrokePoints } from '../geometry/strokeSimplifier.js';
import { commitRasterBlit } from './rasterPaint.js';
import { paintScatterProp, paintStampProp } from './propsLibrary.js';

export function clearStrokePreview() {
  if (!elements.strokeCanvas || !elements.canvasContainer) return;
  const ctx = elements.strokeCanvas.getContext('2d');
  const rect = elements.canvasContainer.getBoundingClientRect();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, rect.width * (window.devicePixelRatio || 1), rect.height * (window.devicePixelRatio || 1));
}

export function renderStrokePreview() {
  const canvas = elements.strokeCanvas;
  if (!canvas || !elements.canvasContainer) return;
  const rect = elements.canvasContainer.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.max(1, Math.round(rect.width * dpr));
  const ph = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== pw) canvas.width = pw;
  if (canvas.height !== ph) canvas.height = ph;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  if (!state.isDrawing || !state.dragStartPoint) return;

  ctx.save();
  applyWorldTransform(ctx, rect);

  const isEraser = Boolean(state.isEraserActive || state.toolSettings.isEraser);
  const activeSettings = isEraser ? { ...state.toolSettings, isEraser: true } : state.toolSettings;

  if (state.currentTool === 'props') {
    const propId = state.toolSettings.propId || 'tree';
    if (state.strokePoints.length > 2) {
      paintScatterProp(ctx, propId, state.strokePoints, activeSettings.color, activeSettings.size);
    } else {
      paintStampProp(ctx, propId, state.dragStartPoint, activeSettings.color, activeSettings.size);
    }
  } else if ((state.currentTool === 'shape' || state.currentTool === 'pixel-shape') && state.lastPointerWorld) {
    drawShape(ctx, 'shape', state.dragStartPoint, state.lastPointerWorld, state.toolSettings, state.shiftPressed);
  } else if (state.strokePoints.length > 0) {
    drawStroke(ctx, state.strokePoints, isEraser ? 'eraser' : 'pencil', activeSettings);
  }

  ctx.restore();
}

/**
 * Commits stroke to either:
 * 1. Vector Space (Fine Strokes): stored in store.strokes with zero-degradation mathematical resolution
 * 2. Pixel Space (Raster Tiles): baked into 512px tile bitmap chunks at 1:1 canvas coordinates
 */
export async function commitStrokeToTiles() {
  let points = [...state.strokePoints];
  if (points.length === 0) return;

  const frame = currentFrame();
  if (!frame) return;

  const isEraser = Boolean(state.isEraserActive || state.toolSettings.isEraser);
  const activeSettings = isEraser ? { ...state.toolSettings, isEraser: true } : { ...state.toolSettings };
  const isVectorSpace = !isEraser && activeSettings.strokeSpace === 'vector';

  // 1. VECTOR SPACE: Retain resolution-independent spline path
  if (isVectorSpace) {
    if (points.length > 2) {
      points = simplifyStrokePoints(points, 0.4);
    }

    const newStroke = {
      id: `vector_stroke_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      tool: 'pencil',
      points,
      settings: activeSettings,
    };

    await commandManager.execute(
      new AddStrokeCommand(frame.id, state.activeLayerId, newStroke)
    );
  } else {
    // 2. PIXEL SPACE: Bake onto raster tiles
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }

    const pad = Math.max(8, (activeSettings.size || 3) * 2 + 10);
    const rx = Math.floor(minX - pad);
    const ry = Math.floor(minY - pad);
    const rw = Math.max(2, Math.ceil(maxX - minX + pad * 2));
    const rh = Math.max(2, Math.ceil(maxY - minY + pad * 2));

    const strokeCanvas = document.createElement('canvas');
    strokeCanvas.width = rw;
    strokeCanvas.height = rh;
    const sctx = strokeCanvas.getContext('2d');
    sctx.translate(-rx, -ry);

    drawStroke(sctx, points, isEraser ? 'eraser' : 'pencil', activeSettings);

    await commitRasterBlit(
      frame,
      state.activeLayerId,
      strokeCanvas,
      rx,
      ry,
      isEraser ? 'destination-out' : 'source-over',
      1.0
    );
  }

  state.strokePoints = [];
  state.isDrawing = false;
  state.isEraserActive = false;
  clearStrokePreview();
  requestRender();
  renderTimelineFilmstrip();
  commandManager.notifyUI();
  scheduleAutosave(true);
}

export function clearSelectionPixels() {
  // Pass-through stub for selection reset
}
