// src/js/canvasUtils.js
import { hexToRgba } from './colorUtils.js';
import { drawPencilStroke } from './render/naturalMediaEngine.js';
import { drawPolygonShape } from './viewport/polygonStudio.js';
export { drawPolygonShape };

export function toolCompositeOp(tool, settings) {
  return 'source-over';
}

/**
 * Computes calibrated, smooth width arrays with graceful start and end tapering.
 */
export function computeStrokePointWidths(points, baseSize, settings = {}) {
  const n = points.length;
  if (n === 0) return [];

  const mode = settings.interpolationMode || 'both';
  const shouldTaperStart = mode === 'both' || mode === 'start';
  const shouldTaperEnd = mode === 'both' || mode === 'end';
  const taperRatio = Math.min(0.4, Math.max(0.1, settings.taperLength ?? 0.22));

  if (n === 1) {
    const press = settings.pressure !== false ? (points[0].pressure ?? 0.75) : 1;
    const w = Math.max(0.8, baseSize * (0.35 + 0.65 * press));
    return [shouldTaperStart ? Math.max(0.2, w * 0.15) : w];
  }

  // Calculate arc lengths along trajectory
  const dists = new Float64Array(n);
  dists[0] = 0;
  for (let i = 1; i < n; i++) {
    dists[i] = dists[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  const totalLength = dists[n - 1];

  const widths = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const pt = points[i];
    const progress = totalLength > 0.001 ? (dists[i] / totalLength) : (i / (n - 1));
    const press = settings.pressure !== false ? (pt.pressure ?? 0.75) : 1.0;
    
    // Smooth dynamic line weight
    let w = Math.max(0.8, baseSize * (0.35 + 0.65 * press));

    // Smoothstep beginning taper
    if (shouldTaperStart && progress < taperRatio) {
      const t = progress / taperRatio;
      const smoothT = t * t * (3 - 2 * t);
      w *= Math.max(0.08, smoothT);
    }

    // Smoothstep end flick taper
    if (shouldTaperEnd && progress > (1 - taperRatio)) {
      const t = (1 - progress) / taperRatio;
      const smoothT = t * t * (3 - 2 * t);
      w *= Math.max(0.08, smoothT);
    }

    widths[i] = Math.max(0.5, w);
  }

  // 2-pass binomial smoothing on width array to eliminate stepped jumps
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < n - 1; i++) {
      widths[i] = widths[i - 1] * 0.25 + widths[i] * 0.5 + widths[i + 1] * 0.25;
    }
  }

  return widths;
}

/**
 * WATERTIGHT BÉZIER OUTLINE CONTOUR ENGINE
 * Connects offset normal vectors into a single, closed, continuous polygon.
 * Completely eliminates overlapping conical wedges and caterpillar edges.
 */
export function drawFineStrokeVector(ctx, rawPoints, settings = {}) {
  if (!rawPoints || rawPoints.length === 0) return;

  const baseSize = settings.size || 3;
  const color = settings.color || '#000000';
  const opacity = settings.opacity !== undefined ? settings.opacity : 1.0;

  // 1. Deduplicate points too close together (< 0.6 world units)
  const points = [rawPoints[0]];
  for (let i = 1; i < rawPoints.length; i++) {
    const prev = points[points.length - 1];
    const curr = rawPoints[i];
    if (Math.hypot(curr.x - prev.x, curr.y - prev.y) >= 0.6) {
      points.push(curr);
    }
  }

  const n = points.length;

  ctx.save();
  ctx.globalCompositeOperation = settings.composite || 'source-over';
  ctx.fillStyle = hexToRgba(color, opacity);
  ctx.strokeStyle = hexToRgba(color, opacity);

  // Single dot
  if (n === 1) {
    const press = settings.pressure !== false ? (points[0].pressure ?? 0.75) : 1;
    const r = Math.max(0.5, (baseSize * (0.35 + 0.65 * press)) / 2);
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const widths = computeStrokePointWidths(points, baseSize, settings);

  // 2. Compute smooth unit normals for left and right offset tracks
  const leftTrack = new Array(n);
  const rightTrack = new Array(n);

  for (let i = 0; i < n; i++) {
    let dx, dy;
    if (i === 0) {
      dx = points[1].x - points[0].x;
      dy = points[1].y - points[0].y;
    } else if (i === n - 1) {
      dx = points[n - 1].x - points[n - 2].x;
      dy = points[n - 1].y - points[n - 2].y;
    } else {
      dx = points[i + 1].x - points[i - 1].x;
      dy = points[i + 1].y - points[i - 1].y;
    }

    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const halfW = widths[i] / 2;

    leftTrack[i] = { x: points[i].x + nx * halfW, y: points[i].y + ny * halfW };
    rightTrack[i] = { x: points[i].x - nx * halfW, y: points[i].y - ny * halfW };
  }

  // 3. Build closed continuous Bézier boundary with outward-projecting caps
  ctx.beginPath();

  // Direction of movement at stroke start
  const startDx = points[1].x - points[0].x;
  const startDy = points[1].y - points[0].y;
  const startDir = Math.atan2(startDy, startDx);

  // Start with left flank
  ctx.moveTo(leftTrack[0].x, leftTrack[0].y);

  // Trace left flank with midpoint quadratic Béziers
  for (let i = 0; i < n - 1; i++) {
    const p1 = leftTrack[i];
    const p2 = leftTrack[i + 1];
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    ctx.quadraticCurveTo(p1.x, p1.y, mx, my);
  }
  ctx.lineTo(leftTrack[n - 1].x, leftTrack[n - 1].y);

  // Outward End Cap: arcs forward away from stroke trajectory
  const endHalfW = widths[n - 1] / 2;
  const lastPt = points[n - 1];
  const endDx = points[n - 1].x - points[n - 2].x;
  const endDy = points[n - 1].y - points[n - 2].y;
  const endDir = Math.atan2(endDy, endDx);

  ctx.arc(lastPt.x, lastPt.y, endHalfW, endDir - Math.PI / 2, endDir + Math.PI / 2, false);

  // Trace return path along right flank
  ctx.lineTo(rightTrack[n - 1].x, rightTrack[n - 1].y);
  for (let i = n - 1; i > 0; i--) {
    const p1 = rightTrack[i];
    const p2 = rightTrack[i - 1];
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    ctx.quadraticCurveTo(p1.x, p1.y, mx, my);
  }
  ctx.lineTo(rightTrack[0].x, rightTrack[0].y);

  // Outward Start Cap: arcs backward away from initial movement
  const startHalfW = widths[0] / 2;
  const firstPt = points[0];
  ctx.arc(firstPt.x, firstPt.y, startHalfW, startDir + Math.PI / 2, startDir + 3 * Math.PI / 2, false);

  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Universal dispatcher for the Pencil tool
 * Routes cleanly between "Fine Strokes (Vector)" and "Graphite Pencil"
 */
export function drawStroke(ctx, points, tool = 'pencil', settings = {}) {
  if (!points || points.length === 0) return;

  if (tool === 'eraser' || settings.isEraser) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const size = Math.max(2, (settings.size || 6) * 1.5);
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    ctx.restore();
    return;
  }

  const isFineStrokes = settings.strokeSpace === 'vector' ||
    settings.pencilPreset === 'fine-strokes' ||
    settings.pencilPreset === 'precision-ink' ||
    settings.pencilPreset === 'clean-lineart';

  if (isFineStrokes) {
    drawFineStrokeVector(ctx, points, settings);
    return;
  }

  // Default: Authentic Graphite Pencil with paper grain
  drawPencilStroke(ctx, points, {
    size: settings.size || 3,
    opacity: settings.opacity !== undefined ? settings.opacity : 0.85,
    color: settings.color || '#1e293b',
    grade: settings.pencilGrade || '2B',
    toothIntensity: settings.pencilTooth !== undefined ? settings.pencilTooth : 0.85,
    isBroad: settings.pencilTip === 'broad',
    ...settings,
  });
}

export function drawShape(ctx, tool, startPoint, currentPoint, settings = {}, shiftKey = false) {
  if (!startPoint || !currentPoint) return;
  const shapeType = settings.shapeType || settings.activeShapeType || 'rectangle';

  let x1 = startPoint.x;
  let y1 = startPoint.y;
  let x2 = currentPoint.x;
  let y2 = currentPoint.y;
  let dx = x2 - x1;
  let dy = y2 - y1;

  const strokeColor = settings.color || '#1e293b';
  const strokeWidth = Math.max(0.5, settings.size || 2);
  const opacity = settings.opacity !== undefined ? settings.opacity : 1.0;
  const isFilled = settings.shapeMode === 'fill' || settings.shapeMode === 'both';
  const hasStroke = settings.shapeMode === 'stroke' || settings.shapeMode === 'both';
  const fillColor = settings.shapeMode === 'both' ? (settings.secondaryColor || '#ffffff') : strokeColor;

  ctx.save();
  ctx.globalCompositeOperation = settings.composite || 'source-over';

  // Configure dash pattern
  if (settings.strokeDash === 'dashed') {
    ctx.setLineDash([strokeWidth * 3, strokeWidth * 2]);
  } else if (settings.strokeDash === 'dotted') {
    ctx.setLineDash([strokeWidth, strokeWidth * 1.5]);
  } else {
    ctx.setLineDash([]);
  }

  // =========================================================
  // 1. STRAIGHT LINE WORKFLOW
  // =========================================================
  if (shapeType === 'line') {
    if (shiftKey) {
      // Snap line to nearest 45° increment (0°, 45°, 90°, 135°, 180°)
      const angle = Math.atan2(dy, dx);
      const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      const dist = Math.hypot(dx, dy);
      x2 = x1 + Math.cos(snappedAngle) * dist;
      y2 = y1 + Math.sin(snappedAngle) * dist;
    }

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = hexToRgba(strokeColor, opacity);
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = settings.lineCap || 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Constrain squares and perfect circles when Shift is held
  if (shiftKey) {
    const maxDim = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * maxDim;
    dy = Math.sign(dy || 1) * maxDim;
    x2 = x1 + dx;
    y2 = y1 + dy;
  }

  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const w = Math.abs(dx);
  const h = Math.abs(dy);
  if (w < 0.5 && h < 0.5) {
    ctx.restore();
    return;
  }

  // =========================================================
  // 2. ELLIPSE / CIRCLE WORKFLOW
  // =========================================================
  if (shapeType === 'ellipse') {
    const rx = w / 2;
    const ry = h / 2;
    const cx = minX + rx;
    const cy = minY + ry;

    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
    if (isFilled) {
      ctx.fillStyle = hexToRgba(fillColor, opacity);
      ctx.fill();
    }
    if (hasStroke) {
      ctx.strokeStyle = hexToRgba(strokeColor, opacity);
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  // =========================================================
  // 3. 2D RECTANGLE WORKFLOW
  // =========================================================
  const radius = Math.min(settings.cornerRadius || 0, Math.min(w / 2, h / 2));
  ctx.beginPath();
  if (radius > 0 && typeof ctx.roundRect === 'function') {
    ctx.roundRect(minX, minY, w, h, radius);
  } else {
    ctx.rect(minX, minY, w, h);
  }
  ctx.closePath();

  if (isFilled) {
    ctx.fillStyle = hexToRgba(fillColor, opacity);
    ctx.fill();
  }
  if (hasStroke) {
    ctx.strokeStyle = hexToRgba(strokeColor, opacity);
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = settings.lineCap || 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  ctx.restore();
}
