// src/js/smoothStrokeEngine.js
import { hexToRgba } from './colorUtils.js';
import { computeStrokePointWidths, drawSmoothRibbonStroke } from './canvasUtils.js';

/**
 * Catmull-Rom to Cubic Bézier spline converter.
 * Converts an array of control points into smooth cubic Bézier segments.
 *
 * @param {Array<{x: number, y: number, pressure?: number}>} points
 * @param {number} tension Tension factor (0.5 for standard Catmull-Rom)
 * @returns {Array<{p0: {x:number, y:number}, cp1: {x:number, y:number}, cp2: {x:number, y:number}, p1: {x:number, y:number}, t0: number, t1: number}>}
 */
export function catmullRomToBezier(points, tension = 0.5) {
  if (!points || points.length < 2) return [];

  const n = points.length;
  const segments = [];

  for (let i = 0; i < n - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[0];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < n - 2 ? points[i + 2] : p2;

    // Catmull-Rom tangents
    const cp1 = {
      x: p1.x + ((p2.x - p0.x) * tension) / 3,
      y: p1.y + ((p2.y - p0.y) * tension) / 3,
    };

    const cp2 = {
      x: p2.x - ((p3.x - p1.x) * tension) / 3,
      y: p2.y - ((p3.y - p1.y) * tension) / 3,
    };

    segments.push({
      p0: { x: p1.x, y: p1.y },
      cp1,
      cp2,
      p1: { x: p2.x, y: p2.y },
      i0: i,
      i1: i + 1,
    });
  }

  return segments;
}

/**
 * Draws high-precision tapered, smoothed strokes without alpha overlap knots or levelling joints
 */
export function drawStroke(ctx, points, tool, settings = {}) {
  if (!points || points.length === 0) return;

  const isEraser = tool === 'eraser';
  const baseSize = isEraser ? settings.eraserSize || 24 : settings.size || 5;
  const opacity = settings.opacity !== undefined ? settings.opacity : 1;
  const color = settings.color || '#000000';

  if (isEraser) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.85)';
    ctx.lineWidth = baseSize;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    if (points.length === 1) {
      ctx.arc(points[0].x, points[0].y, baseSize / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const segments = catmullRomToBezier(points);
      for (const seg of segments) {
        ctx.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.p1.x, seg.p1.y);
      }
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  const widths = computeStrokePointWidths(points, baseSize, settings);
  drawSmoothRibbonStroke(ctx, points, widths, color, opacity, 'source-over');
}

export const SmoothStrokeEngine = {
  catmullRomToBezier,
  drawStroke,
};
