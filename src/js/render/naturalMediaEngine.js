// src/js/render/naturalMediaEngine.js
// Authentic Natural Media Engine for artists: Multi-Grade Graphite Pencil (2H-6B) with paper tooth interaction.
import { drawFineStrokeVector } from '../canvasUtils.js';

// Cache procedural graphite stamps per (grade, size, color, tooth, tip)
const pencilStampCache = new Map();

function getOrCreateGraphiteStamp(size, color, grade = '2B', toothIntensity = 0.85, isBroad = false) {
  const s = Math.max(2, Math.round(size * (isBroad ? 2.0 : 1.0)));
  const key = `graphite_${grade}_${s}_${color}_${Math.round(toothIntensity * 10)}_${isBroad ? 'b' : 'p'}`;
  if (pencilStampCache.has(key)) return pencilStampCache.get(key);

  const canvas = document.createElement('canvas');
  const d = s * 2;
  canvas.width = d;
  canvas.height = isBroad ? Math.max(2, Math.round(d * 0.55)) : d;
  const ctx = canvas.getContext('2d');

  // Parse color
  const temp = document.createElement('canvas');
  temp.width = 1;
  temp.height = 1;
  const tctx = temp.getContext('2d');
  tctx.fillStyle = color;
  tctx.fillRect(0, 0, 1, 1);
  const pCol = tctx.getImageData(0, 0, 1, 1).data;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.createImageData(w, h);
  const data = imgData.data;

  // Grade profiles for authentic graphite hardness:
  // 2H: hard, crisp, light silvery tone, fine grain
  // HB: classic balanced drafting & sketching graphite
  // 2B: rich soft graphite with distinct tooth bite
  // 4B: dark velvety graphite, expressive sketch texture
  // 6B: ultra soft, deep matte carbon deposit
  const gradeProfiles = {
    '2H': { hardness: 0.85, density: 0.55, toothCatch: 0.60 },
    'HB': { hardness: 0.70, density: 0.72, toothCatch: 0.75 },
    '2B': { hardness: 0.50, density: 0.88, toothCatch: 0.88 },
    '4B': { hardness: 0.35, density: 1.00, toothCatch: 0.95 },
    '6B': { hardness: 0.20, density: 1.15, toothCatch: 1.05 },
  };
  const prof = gradeProfiles[grade] || gradeProfiles['2B'];

  const cx = w / 2;
  const cy = h / 2;
  const rx = cx;
  const ry = cy;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const dist = Math.hypot(nx, ny);

      if (dist <= 1.0) {
        // Natural graphite falloff from lead center to microscopic edge tooth
        const coreFalloff = Math.pow(1 - dist, 0.65);
        // Multi-frequency procedural paper tooth noise
        const n1 = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1;
        const n2 = ((Math.sin(x * 93.989 + y * 67.345) * 24634.63) % 1 + 1) % 1;
        const toothNoise = n1 * 0.65 + n2 * 0.35;

        // Microscopic tooth bite threshold
        const toothFactor = (1 - toothIntensity * 0.6) + toothNoise * (toothIntensity * prof.toothCatch * 0.9);
        const alphaVal = Math.min(255, Math.floor(coreFalloff * toothFactor * prof.density * 225));

        if (alphaVal > 2) {
          const idx = (y * w + x) * 4;
          data[idx] = pCol[0];
          data[idx + 1] = pCol[1];
          data[idx + 2] = pCol[2];
          data[idx + 3] = alphaVal;
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  if (pencilStampCache.size > 250) pencilStampCache.clear();
  pencilStampCache.set(key, canvas);
  return canvas;
}

/**
 * 1. FINE ART GRAPHITE PENCIL (P)
 * Authentic graphite lead engine with paper tooth interaction, multi-grade hardness (2H-6B), and broad chisel shading.
 */
export function drawPencilStroke(ctx, points, settings = {}) {
  if (!points || points.length === 0) return;
  const baseSize = settings.size || 3;
  const color = settings.color || '#1e293b';
  const opacity = settings.opacity !== undefined ? settings.opacity : 0.85;
  const grade = settings.pencilGrade || settings.hardnessGrade || '2B';
  const toothIntensity = settings.pencilTooth !== undefined ? settings.pencilTooth : 0.85;
  const isBroad = settings.pencilTip === 'broad';

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  const n = points.length;

  if (n === 1) {
    const p = points[0];
    const press = p.pressure ?? 0.7;
    const size = Math.max(1.5, baseSize * (0.6 + 0.6 * press));
    const stamp = getOrCreateGraphiteStamp(size, color, grade, toothIntensity, isBroad);
    ctx.globalAlpha = opacity * Math.min(1.0, 0.4 + 0.6 * press);
    ctx.drawImage(stamp, p.x - stamp.width / 2, p.y - stamp.height / 2);
    ctx.restore();
    return;
  }

  // Dense Catmull-Rom spline interpolation for smooth sketch lines
  for (let i = 0; i < n - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[0];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < n - 2 ? points[i + 2] : p2;

    const pr1 = p1.pressure ?? 0.7;
    const pr2 = p2.pressure ?? 0.7;

    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const avgSize = Math.max(1.5, baseSize * (0.6 + 0.6 * ((pr1 + pr2) / 2)));
    const stepSize = Math.max(0.7, Math.min(2.5, avgSize * 0.25));
    const numSteps = Math.max(2, Math.ceil(dist / stepSize));

    for (let s = (i === 0 ? 0 : 1); s <= numSteps; s++) {
      const t = s / numSteps;
      const t2 = t * t;
      const t3 = t2 * t;

      // Catmull-Rom point
      const x = 0.5 * ((2 * p1.x) +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);

      const y = 0.5 * ((2 * p1.y) +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

      const press = pr1 + (pr2 - pr1) * t;
      const curSize = Math.max(1.2, baseSize * (0.5 + 0.7 * press));

      // Deterministic positional hash (completely eliminates stroke boil/flutter)
      const pHash = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1;
      const pHash2 = ((Math.cos(x * 93.989 + y * 67.345) * 24634.63) % 1 + 1) % 1;
      const jx = (pHash - 0.5) * curSize * 0.12;
      const jy = (pHash2 - 0.5) * curSize * 0.12;

      const stamp = getOrCreateGraphiteStamp(curSize, color, grade, toothIntensity, isBroad);
      ctx.globalAlpha = opacity * Math.min(1.0, 0.35 + 0.65 * press);

      if (isBroad) {
        // Broad pencil lead angle
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const angle = Math.atan2(dy, dx) + Math.PI / 4;
        ctx.save();
        ctx.translate(x + jx, y + jy);
        ctx.rotate(angle);
        ctx.drawImage(stamp, -stamp.width / 2, -stamp.height / 2);
        ctx.restore();
      } else {
        ctx.drawImage(stamp, (x + jx) - stamp.width / 2, (y + jy) - stamp.height / 2);
      }
    }
  }

  ctx.restore();
}

export function drawInkPenStroke(ctx, points, settings = {}) {
  drawFineStrokeVector(ctx, points, settings);
}

/**
 * Master dispatcher for drawing pencil strokes
 */
export function drawMasterArtStroke(ctx, points, tool, settings = {}) {
  return drawPencilStroke(ctx, points, settings);
}

/**
 * Bakes pencil strokes to canvas
 */
export function bakeNaturalStrokeToCanvas(tool, points, settings = {}) {
  const baseSize = settings.size || 6;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }

  const pad = baseSize * 2 + 8;
  const w = Math.max(2, Math.ceil(maxX - minX + pad * 2));
  const h = Math.max(2, Math.ceil(maxY - minY + pad * 2));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.translate(pad - minX, pad - minY);
  drawPencilStroke(ctx, points, settings);

  return {
    canvas,
    x: minX - pad,
    y: minY - pad
  };
}
