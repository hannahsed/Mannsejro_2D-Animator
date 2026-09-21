// src/js/render/softBrushEngine.js
// VELVETY SOFT BRUSH: Zero-banding Gaussian diffusion + single bake on commit.
// Continuous smooth Gaussian diffusion.

import { drawVelvetAirbrush } from './naturalMediaEngine.js';

export function drawSoftStroke(ctx, points, settings) {
  drawVelvetAirbrush(ctx, points, settings);
}

/**
 * BAKE: render the stroke once into a canvas with pure Gaussian blur, return image coordinates.
 */
export function bakeSoftStroke(points, settings) {
  const baseSize = settings.size || 35;
  const color = settings.color || '#000000';
  const hardness = Math.max(0.01, Math.min(0.89, settings.hardness ?? settings.brushHardness ?? 0.15));
  const blurRadius = Math.max(1, baseSize * (1 - hardness) * 0.85);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const pad = baseSize * 1.5 + blurRadius * 2 + 8;
  const SS = 2; // supersample for velvety smoothness
  const w = Math.max(2, Math.ceil((maxX - minX + pad * 2) * SS));
  const h = Math.max(2, Math.ceil((maxY - minY + pad * 2) * SS));

  // 1) Crisp core stroke on supersampled canvas
  const crisp = document.createElement('canvas');
  crisp.width = w; crisp.height = h;
  const cx = crisp.getContext('2d');
  cx.scale(SS, SS);
  cx.translate(pad - minX, pad - minY);
  cx.lineCap = 'round'; cx.lineJoin = 'round';
  cx.strokeStyle = color; cx.fillStyle = color;

  if (points.length === 1) {
    const p = points[0];
    cx.beginPath();
    cx.arc(p.x, p.y, Math.max(0.5, baseSize * hardness * 0.5), 0, Math.PI * 2);
    cx.fill();
  } else {
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i], p1 = points[i + 1];
      const press = ((p0.pressure ?? 1) + (p1.pressure ?? 1)) / 2;
      cx.lineWidth = Math.max(0.5, baseSize * hardness * (0.3 + 0.7 * press));
      cx.beginPath();
      cx.moveTo(p0.x, p0.y);
      if (i < points.length - 2) {
        const p2 = points[i + 2];
        cx.quadraticCurveTo(p1.x, p1.y, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      } else {
        cx.lineTo(p1.x, p1.y);
      }
      cx.stroke();
    }
  }

  // 2) Single Gaussian blur pass into the bake canvas (ZERO banding)
  const bake = document.createElement('canvas');
  bake.width = Math.max(2, Math.ceil(maxX - minX + pad * 2));
  bake.height = Math.max(2, Math.ceil(maxY - minY + pad * 2));
  const bx = bake.getContext('2d');
  if ('filter' in bx) bx.filter = `blur(${blurRadius.toFixed(1)}px)`;
  bx.drawImage(crisp, 0, 0, bake.width, bake.height);

  return { canvas: bake, x: minX - pad, y: minY - pad };
}
