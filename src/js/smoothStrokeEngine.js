// src/js/smoothStrokeEngine.js
import { hexToRgba } from './colorUtils.js';
import { computeStrokePointWidths } from './canvasUtils.js';

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
 * Evaluates cubic Bézier position at t in [0, 1]
 */
function evaluateCubicBezier(p0, cp1, cp2, p1, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: mt3 * p0.x + 3 * mt2 * t * cp1.x + 3 * mt * t2 * cp2.x + t3 * p1.x,
    y: mt3 * p0.y + 3 * mt2 * t * cp1.y + 3 * mt * t2 * cp2.y + t3 * p1.y,
  };
}

/**
 * Draws high-precision tapered, smoothed strokes without alpha overlap knots
 */
export function drawStroke(ctx, points, tool, settings = {}) {
  if (!points || points.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const isEraser = tool === 'eraser';
  const baseSize = isEraser ? settings.eraserSize || 24 : settings.size || 5;
  const opacity = settings.opacity !== undefined ? settings.opacity : 1;
  const color = settings.color || '#000000';

  if (isEraser) {
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

  // Draw / Ink / Brush
  const widths = computeStrokePointWidths(points, baseSize, settings);

  // Single dot
  if (points.length === 1) {
    ctx.fillStyle = hexToRgba(color, opacity);
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, Math.max(0.5, widths[0] / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Two points straight line
  if (points.length === 2) {
    const p0 = points[0];
    const p1 = points[1];
    const w0 = widths[0];
    const w1 = widths[1];

    ctx.fillStyle = hexToRgba(color, opacity);
    ctx.strokeStyle = hexToRgba(color, opacity);

    if (Math.abs(w0 - w1) < 0.5) {
      ctx.lineWidth = w0;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    } else {
      // Variable width trapezoid capsule
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      ctx.beginPath();
      ctx.arc(p0.x, p0.y, w0 / 2, 0, Math.PI * 2);
      ctx.arc(p1.x, p1.y, w1 / 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(p0.x + nx * (w0 / 2), p0.y + ny * (w0 / 2));
      ctx.lineTo(p1.x + nx * (w1 / 2), p1.y + ny * (w1 / 2));
      ctx.lineTo(p1.x - nx * (w1 / 2), p1.y - ny * (w1 / 2));
      ctx.lineTo(p0.x - nx * (w0 / 2), p0.y - ny * (w0 / 2));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // Smooth Catmull-Rom to Cubic Bézier Spline with Ribbon Outline
  // To avoid beaded alpha overlap knots when opacity < 1:
  // We generate boundary vertices along the spline and fill a single continuous polygon.
  const segments = catmullRomToBezier(points);
  const leftPoints = [];
  const rightPoints = [];

  const totalPoints = points.length;

  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];
    const i0 = seg.i0;
    const i1 = seg.i1;
    const w0 = widths[i0];
    const w1 = widths[i1];

    // Adaptive sampling steps per segment based on curve length
    const chord = Math.hypot(seg.p1.x - seg.p0.x, seg.p1.y - seg.p0.y);
    const steps = Math.max(3, Math.min(12, Math.ceil(chord / 8)));

    for (let step = (s === 0 ? 0 : 1); step <= steps; step++) {
      const t = step / steps;
      const pt = evaluateCubicBezier(seg.p0, seg.cp1, seg.cp2, seg.p1, t);
      const width = w0 + (w1 - w0) * t;
      const radius = Math.max(0.25, width / 2);

      // Tangent vector
      const dt = 0.01;
      const ptBefore = evaluateCubicBezier(seg.p0, seg.cp1, seg.cp2, seg.p1, Math.max(0, t - dt));
      const ptAfter = evaluateCubicBezier(seg.p0, seg.cp1, seg.cp2, seg.p1, Math.min(1, t + dt));
      const tx = ptAfter.x - ptBefore.x;
      const ty = ptAfter.y - ptBefore.y;
      const tlen = Math.hypot(tx, ty) || 1;
      const nx = -ty / tlen;
      const ny = tx / tlen;

      leftPoints.push({ x: pt.x + nx * radius, y: pt.y + ny * radius });
      rightPoints.push({ x: pt.x - nx * radius, y: pt.y - ny * radius });
    }
  }

  ctx.fillStyle = hexToRgba(color, opacity);
  ctx.beginPath();

  // Start round cap
  const pStart = points[0];
  const rStart = widths[0] / 2;
  ctx.arc(pStart.x, pStart.y, rStart, 0, Math.PI * 2);

  // End round cap
  const pEnd = points[totalPoints - 1];
  const rEnd = widths[totalPoints - 1] / 2;
  ctx.arc(pEnd.x, pEnd.y, rEnd, 0, Math.PI * 2);

  // Smooth Ribbon Body Path
  if (leftPoints.length > 0 && rightPoints.length > 0) {
    ctx.moveTo(leftPoints[0].x, leftPoints[0].y);
    for (let i = 1; i < leftPoints.length; i++) {
      ctx.lineTo(leftPoints[i].x, leftPoints[i].y);
    }
    for (let i = rightPoints.length - 1; i >= 0; i--) {
      ctx.lineTo(rightPoints[i].x, rightPoints[i].y);
    }
    ctx.closePath();
  }

  ctx.fill();
  ctx.restore();
}

export const SmoothStrokeEngine = {
  catmullRomToBezier,
  drawStroke,
};
