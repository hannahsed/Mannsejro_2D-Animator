import { state, currentFrame, SHAPE_TOOLS } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { drawShape, drawStroke, toolCompositeOp } from '../canvasUtils.js';
import { hexToRgba } from '../colorUtils.js';
import { blitCanvasIntoTiles } from '../infiniteCanvas.js';
import { applyWorldTransform, requestRender } from './renderEngine.js';
import { renderTimelineFilmstrip } from '../timeline/filmstrip.js';
import { saveHistoryState } from '../project/history.js';
import { showToast } from '../ui/toast.js';
import { scheduleAutosave } from '../project/autosave.js';
import { dualStabilizer } from '../viewport/dualStabilizer.js';

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
  if (state.currentTool === 'lassofill') {
    if (state.strokePoints.length >= 2) {
      const color = state.toolSettings.color || '#3b82f6';
      const opacity = (state.toolSettings.opacity !== undefined ? state.toolSettings.opacity : 1) * 0.45;
      ctx.fillStyle = hexToRgba(color, opacity);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 / state.zoom;
      ctx.setLineDash([5 / state.zoom, 4 / state.zoom]);
      ctx.beginPath();
      ctx.moveTo(state.strokePoints[0].x, state.strokePoints[0].y);
      for (let i = 1; i < state.strokePoints.length; i++) {
        ctx.lineTo(state.strokePoints[i].x, state.strokePoints[i].y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (SHAPE_TOOLS.has(state.currentTool)) {
    drawShape(ctx, state.currentTool, state.dragStartPoint, state.lastPointerWorld, state.toolSettings, Boolean(state.shiftPressed));
  } else {
    drawStroke(ctx, state.strokePoints, state.currentTool, state.toolSettings);

    // RENDER VISIBLE LEASH GUIDE IF ENABLED
    if (state.toolSettings.assistantStabilizer && state.toolSettings.showLeashGuide) {
      dualStabilizer.renderGuide(ctx);
    }
  }
  ctx.restore();
}

function strokeBBox(points, pad) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (!p) continue;
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  if (!isFinite(minX)) return null;
  return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
}

export async function commitLassoFill() {
  const points = state.strokePoints;
  if (!points || points.length < 3) {
    state.strokePoints = [];
    state.isDrawing = false;
    clearStrokePreview();
    return;
  }

  const pad = 4;
  const bbox = strokeBBox(points, pad);
  if (!bbox) {
    state.strokePoints = [];
    state.isDrawing = false;
    clearStrokePreview();
    return;
  }

  const activeLayer = state.project.layers.find((l) => l.id === state.activeLayerId);
  const op = activeLayer && activeLayer.alphaLocked ? 'source-atop' : 'source-over';

  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bbox.w));
  c.height = Math.max(1, Math.round(bbox.h));
  const cctx = c.getContext('2d');
  cctx.translate(-bbox.x, -bbox.y);

  const color = state.toolSettings.color || '#3b82f6';
  const opacity = state.toolSettings.opacity !== undefined ? state.toolSettings.opacity : 1;

  cctx.fillStyle = hexToRgba(color, opacity);
  cctx.beginPath();
  cctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    cctx.lineTo(points[i].x, points[i].y);
  }
  cctx.closePath();
  cctx.fill();

  const frame = currentFrame();
  if (!frame) return;
  const store = frame.layerData[state.activeLayerId] || (frame.layerData[state.activeLayerId] = { tiles: {} });
  await blitCanvasIntoTiles(store.tiles, c, bbox.x, bbox.y, op);

  state.strokePoints = [];
  state.isDrawing = false;
  clearStrokePreview();
  requestRender();
  renderTimelineFilmstrip();
  saveHistoryState();
  scheduleAutosave(true);
}

export async function commitStrokeToTiles() {
  const tool = state.currentTool;
  if (tool === 'lassofill') {
    return commitLassoFill();
  }
  const isShape = SHAPE_TOOLS.has(tool);
  const pad = Math.max(state.toolSettings.size || 6, state.toolSettings.eraserSize || 24, 8) + 8;
  let points = state.strokePoints;
  if (isShape && state.dragStartPoint && state.lastPointerWorld) {
    let dx = state.lastPointerWorld.x - state.dragStartPoint.x;
    let dy = state.lastPointerWorld.y - state.dragStartPoint.y;
    if (state.shiftPressed) {
      const preset = state.toolSettings.shapePreset || 'rectangle';
      if (preset === 'line' || preset === 'arrow') {
        const angle = Math.atan2(dy, dx);
        const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const dist = Math.hypot(dx, dy);
        dx = Math.cos(snapped) * dist;
        dy = Math.sin(snapped) * dist;
      } else {
        const maxDim = Math.max(Math.abs(dx), Math.abs(dy));
        dx = Math.sign(dx || 1) * maxDim;
        dy = Math.sign(dy || 1) * maxDim;
      }
    }
    const endPt = { x: state.dragStartPoint.x + dx, y: state.dragStartPoint.y + dy };
    points = [state.dragStartPoint, state.lastPointerWorld, endPt];
  }
  const bbox = strokeBBox(points, pad);
  if (!bbox) return;

  const activeLayer = state.project.layers.find((l) => l.id === state.activeLayerId);
  const op = activeLayer && activeLayer.alphaLocked ? 'source-atop' : toolCompositeOp(tool, state.toolSettings);

  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bbox.w));
  c.height = Math.max(1, Math.round(bbox.h));
  const cctx = c.getContext('2d');
  cctx.translate(-bbox.x, -bbox.y);

  if (isShape) {
    drawShape(cctx, tool, state.dragStartPoint, state.lastPointerWorld, state.toolSettings, Boolean(state.shiftPressed));
  } else {
    drawStroke(cctx, state.strokePoints, tool, state.toolSettings);
  }

  const frame = currentFrame();
  if (!frame) return;
  const store = frame.layerData[state.activeLayerId] || (frame.layerData[state.activeLayerId] = { tiles: {} });
  await blitCanvasIntoTiles(store.tiles, c, bbox.x, bbox.y, op);

  state.strokePoints = [];
  state.isDrawing = false;
  clearStrokePreview();
  requestRender();
  renderTimelineFilmstrip();
  saveHistoryState();
  
  // Trigger IMMEDIATE Crash-Guard disk sync (no waiting)
  scheduleAutosave(true);
}

export async function clearSelectionPixels() {
  const sel = state.floatingSelection;
  if (!sel) return;
  state.floatingSelection = null;
  requestRender();
  renderTimelineFilmstrip();
  saveHistoryState();
  showToast('Cleared selection');
}
