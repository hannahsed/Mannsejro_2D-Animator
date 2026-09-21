// src/js/color/gradientFill.js
import { hexToRgb } from '../colorUtils.js';
import { compositeLayerRegion } from '../infiniteCanvas.js';
import { MaxedFillEngine } from './maxedFillEngine.js';
import { commitRasterBlit } from '../render/rasterPaint.js';
import { drawStroke, drawShape, drawPolygonShape } from '../canvasUtils.js';
import { drawNodeQuad } from '../viewport/nodeDraw.js';
import { drawPerspectiveShape } from '../viewport/perspectiveRectangleStudio.js';

function drawLayerStrokesToSample(ctx, strokes, winX, winY) {
  if (!strokes || strokes.length === 0) return;
  ctx.save();
  ctx.translate(-winX, -winY);
  for (const stroke of strokes) {
    if (stroke.isPerspectiveShape) {
      drawPerspectiveShape(ctx, stroke);
    } else if (stroke.isPolygon) {
      drawPolygonShape(ctx, stroke);
    } else if (stroke.isNodeQuad) {
      drawNodeQuad(ctx, stroke);
    } else if (stroke.isShape && stroke.shapeData) {
      drawShape(ctx, stroke.tool, stroke.shapeData.start, stroke.shapeData.end, stroke.settings, stroke.shapeData.shiftKey);
    } else if (stroke.points && stroke.points.length > 0) {
      drawStroke(ctx, stroke.points, stroke.tool || 'pencil', stroke.settings);
    }
  }
  ctx.restore();
}

export async function executeGradientFill(project, frame, layer, ax, ay, bx, by, settings) {
  if (layer.locked || !layer.visible) return false;
  const tolerance = settings.fillTolerance ?? 32;
  const closeGapRadius = settings.fillCloseGap ?? 3;
  const windowSize = 1536;
  const winX = Math.floor((ax - windowSize / 2) / 64) * 64;
  const winY = Math.floor((ay - windowSize / 2) / 64) * 64;

  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = sampleCanvas.height = windowSize;
  const sctx = sampleCanvas.getContext('2d');
  for (const l of project.layers) {
    if (!l.visible) continue;
    const tiles = frame.layerData[l.id]?.tiles;
    if (tiles && Object.keys(tiles).length > 0) {
      const region = await compositeLayerRegion(tiles, winX, winY, windowSize, windowSize);
      sctx.save();
      sctx.globalAlpha = l.opacity ?? 1;
      sctx.drawImage(region, 0, 0);
      sctx.restore();
    }
    const strokes = frame.layerData[l.id]?.strokes;
    if (strokes && strokes.length > 0) {
      sctx.save();
      sctx.globalAlpha = l.opacity ?? 1;
      drawLayerStrokesToSample(sctx, strokes, winX, winY);
      sctx.restore();
    }
  }
  const lx = Math.round(ax - winX), ly = Math.round(ay - winY);
  if (lx < 0 || lx >= windowSize || ly < 0 || ly >= windowSize) return false;

  const imgData = sctx.getImageData(0, 0, windowSize, windowSize);
  const data = imgData.data;
  const total = windowSize * windowSize;
  const si = (ly * windowSize + lx) * 4;
  const tR = data[si], tG = data[si + 1], tB = data[si + 2], tA = data[si + 3];
  const tol = tolerance * 4;
  const isTarget = (p) =>
    Math.abs(data[p] - tR) + Math.abs(data[p + 1] - tG) +
    Math.abs(data[p + 2] - tB) + Math.abs(data[p + 3] - tA) <= tol;

  let obstacles = new Uint8Array(total);
  for (let i = 0; i < total; i++) if (!isTarget(i * 4)) obstacles[i] = 1;
  if (closeGapRadius > 0) {
    const dil = MaxedFillEngine.dilateBinary(obstacles, windowSize, windowSize, closeGapRadius);
    obstacles = MaxedFillEngine.erodeBinary(dil, windowSize, windowSize, closeGapRadius);
  }

  const mask = new Uint8Array(total);
  const queue = [[lx, ly]];
  mask[ly * windowSize + lx] = 1;
  while (queue.length) {
    const [cx, cy] = queue.pop();
    let wx = cx;
    while (wx > 0) { const p = cy * windowSize + wx - 1; if (mask[p] || obstacles[p]) break; mask[p] = 1; wx--; }
    let ex = cx;
    while (ex < windowSize - 1) { const p = cy * windowSize + ex + 1; if (mask[p] || obstacles[p]) break; mask[p] = 1; ex++; }
    for (const ny of [cy - 1, cy + 1]) {
      if (ny < 0 || ny >= windowSize) continue;
      let inRun = false;
      for (let x = wx; x <= ex; x++) {
        const p = ny * windowSize + x;
        const open = !mask[p] && !obstacles[p];
        if (open) { if (!inRun) { queue.push([x, ny]); mask[p] = 1; inRun = true; } }
        else inRun = false;
      }
    }
  }

  const cA = hexToRgb(settings.color || '#3b82f6');
  const cB = hexToRgb(settings.secondaryColor || '#ffffff');
  const dlx = (bx - ax), dly = (by - ay);
  const len2 = Math.max(0.0001, dlx * dlx + dly * dly);
  const out = document.createElement('canvas');
  out.width = out.height = windowSize;
  const octx = out.getContext('2d');
  const oimg = octx.createImageData(windowSize, windowSize);
  const od = oimg.data;
  let painted = 0;
  for (let i = 0; i < total; i++) {
    if (mask[i] !== 1) continue;
    const px = i % windowSize, py = (i / windowSize) | 0;
    let t = ((px - lx) * dlx + (py - ly) * dly) / len2;
    t = Math.max(0, Math.min(1, t));
    const p = i * 4;
    od[p] = cA.r + (cB.r - cA.r) * t;
    od[p + 1] = cA.g + (cB.g - cA.g) * t;
    od[p + 2] = cA.b + (cB.b - cA.b) * t;
    od[p + 3] = 255;
    painted++;
  }
  if (painted === 0) return false;
  octx.putImageData(oimg, 0, 0);
  await commitRasterBlit(frame, layer.id, out, winX, winY, 'source-over', 1);
  return true;
}
