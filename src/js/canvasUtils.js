// src/js/canvasUtils.js
import { hexToRgba } from './colorUtils.js';
import { SmoothStrokeEngine } from './smoothStrokeEngine.js';

export { SmoothStrokeEngine };

export function toolCompositeOp(tool, settings) {
  if (tool === 'eraser') return 'destination-out';
  if (tool === 'draw' && settings?.composite) return settings.composite;
  return 'source-over';
}

/**
 * Calculates point-by-point width considering:
 * 1. Base brush size
 * 2. Pressure or simulated velocity
 * 3. Taper start & Taper end curve factors
 */
export function computeStrokePointWidths(points, baseSize, settings) {
  const n = points.length;
  if (n === 0) return [];
  if (n === 1) return [baseSize];

  const taperStart = settings.taperStart ?? true;
  const taperEnd = settings.taperEnd ?? true;
  const taperLen = settings.taperLength ?? 0.25;
  const isPressure = settings.pressure ?? true;

  const widths = new Array(n);

  for (let i = 0; i < n; i++) {
    const pt = points[i];
    const progress = i / (n - 1); // 0.0 to 1.0

    // Pressure multiplier (defaults to 1 if not pressure-sensitive)
    const press = isPressure ? (pt.pressure ?? 1) : 1;
    let w = baseSize * (0.3 + 0.7 * press);

    // Taper Start curve (eats into the first taperLen % of points)
    if (taperStart && taperLen > 0 && progress < taperLen) {
      const t = progress / taperLen;
      // Smooth sinusoidal ease-in
      const factor = Math.sin((t * Math.PI) / 2);
      w *= Math.max(0.1, factor);
    }

    // Taper End curve (tapers off in the last taperLen % of points)
    if (taperEnd && taperLen > 0 && progress > 1 - taperLen) {
      const t = (1 - progress) / taperLen;
      const factor = Math.sin((t * Math.PI) / 2);
      w *= Math.max(0.08, factor);
    }

    widths[i] = Math.max(0.5, w);
  }

  return widths;
}

/**
 * Draws high-precision tapered, smoothed strokes using SmoothStrokeEngine
 */
export function drawStroke(ctx, points, tool, settings) {
  return SmoothStrokeEngine.drawStroke(ctx, points, tool, settings);
}

export function drawShape(ctx, tool, startPoint, currentPoint, settings, shiftKey = false) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  const color = settings.color || '#000000';
  const secColor = settings.secondaryColor || '#ffffff';
  const opacity = settings.opacity !== undefined ? settings.opacity : 1;
  const strokeWidth = settings.size || 4;
  const mode = settings.shapeMode || 'stroke'; // 'stroke' | 'fill' | 'both'
  const preset = settings.shapePreset || 'rectangle';

  ctx.strokeStyle = hexToRgba(color, opacity);
  ctx.fillStyle = mode === 'both' ? hexToRgba(secColor, opacity) : hexToRgba(color, opacity);
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Apply Line Dash
  if (settings.strokeDash === 'dashed') {
    ctx.setLineDash([strokeWidth * 2.5, strokeWidth * 1.8]);
  } else if (settings.strokeDash === 'dotted') {
    ctx.setLineDash([strokeWidth * 0.5, strokeWidth * 1.5]);
  } else {
    ctx.setLineDash([]);
  }

  let dx = currentPoint.x - startPoint.x;
  let dy = currentPoint.y - startPoint.y;

  // Shift-Constraint (Square, 1:1 Circle, 45° Angle Snap)
  if (shiftKey) {
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

  const endX = startPoint.x + dx;
  const endY = startPoint.y + dy;
  const x = Math.min(startPoint.x, endX);
  const y = Math.min(startPoint.y, endY);
  const w = Math.max(1, Math.abs(dx));
  const h = Math.max(1, Math.abs(dy));

  const executePaint = () => {
    if (mode === 'fill') {
      ctx.fill();
    } else if (mode === 'both') {
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.stroke();
    }
  };

  // 1. Rectangle
  if (preset === 'rectangle') {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    executePaint();
  }

  // 2. Rounded Rectangle
  else if (preset === 'rounded-rect') {
    const rad = Math.min(settings.cornerRadius || 12, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, rad);
    } else {
      ctx.rect(x, y, w, h);
    }
    executePaint();
  }

  // 3. Ellipse / Circle
  else if (preset === 'ellipse') {
    const rx = w / 2;
    const ry = h / 2;
    ctx.beginPath();
    ctx.ellipse(x + rx, y + ry, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
    executePaint();
  }

  // 4. Straight Line
  else if (preset === 'line') {
    ctx.beginPath();
    ctx.moveTo(startPoint.x, startPoint.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  // 5. Motion Arrow
  else if (preset === 'arrow') {
    const headLen = Math.max(12, strokeWidth * 3.5);
    const angle = Math.atan2(endY - startPoint.y, endX - startPoint.x);

    ctx.beginPath();
    ctx.moveTo(startPoint.x, startPoint.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Solid Arrowhead
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = hexToRgba(color, opacity);
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - headLen * Math.cos(angle - Math.PI / 6),
      endY - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      endX - headLen * Math.cos(angle + Math.PI / 6),
      endY - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 6. Polygon (Triangle, Pentagon, Hexagon...)
  else if (preset === 'polygon') {
    const sides = Math.max(3, settings.polygonSides || 3);
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;

    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
      const px = cx + rx * Math.cos(a);
      const py = cy + ry * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    executePaint();
  }

  // 7. Impact Star / Sparkle
  else if (preset === 'star') {
    const points = 5;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const outerR = Math.min(w, h) / 2;
    const innerR = outerR * 0.42;

    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const px = cx + r * Math.cos(a);
      const py = cy + r * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    executePaint();
  }

  ctx.restore();
}
