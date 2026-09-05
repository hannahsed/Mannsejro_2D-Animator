// src/js/smartFillEngine.js
import { TILE, compositeLayerRegion, blitCanvasIntoTiles } from './infiniteCanvas.js';
import { hexToRgb } from './colorUtils.js';

/**
 * Parses any color format (hex, rgb, rgba) into [r, g, b, a (0-255)]
 */
function parseColorToRgba(colorStr) {
  if (!colorStr) return [0, 0, 0, 255];
  if (colorStr.startsWith('#')) {
    const rgb = hexToRgb(colorStr);
    return [rgb.r, rgb.g, rgb.b, 255];
  }
  if (colorStr.startsWith('rgb')) {
    const match = colorStr.match(/\d+(\.\d+)?/g);
    if (match) {
      const r = parseInt(match[0], 10);
      const g = parseInt(match[1], 10);
      const b = parseInt(match[2], 10);
      const a = match[3] !== undefined ? Math.round(parseFloat(match[3]) * (parseFloat(match[3]) <= 1 ? 255 : 1)) : 255;
      return [r, g, b, a];
    }
  }
  return [0, 0, 0, 255];
}

/**
 * Calculates color distance in RGBA space
 */
function colorDistance(r1, g1, b1, a1, r2, g2, b2, a2) {
  // If both are mostly transparent, treat as identical
  if (a1 < 10 && a2 < 10) return 0;
  return Math.max(Math.abs(r1 - r2), Math.abs(g1 - g2), Math.abs(b1 - b2), Math.abs(a1 - a2));
}

/**
 * Smart Flood Fill with intelligent line bleed dilation.
 * Fills bounded regions and expands the fill by `bleed` pixels underneath
 * anti-aliased lineart to eliminate white halos.
 *
 * @param {Object} tiles Infinite canvas tile map
 * @param {number} wx World X coordinate
 * @param {number} wy World Y coordinate
 * @param {string} fillColor Target fill color (hex or rgb)
 * @param {Object|number} [options] Options object or numeric tolerance
 * @param {number} [options.tolerance=32] Fill color tolerance (0-255)
 * @param {number} [options.bleed=2] Edge expansion bleed in pixels (default: 2)
 */
export async function floodFillWithBleed(tiles, wx, wy, fillColor, options = {}) {
  const tolerance = typeof options === 'number' ? options : (options.tolerance ?? 32);
  const bleed = typeof options === 'object' && options.bleed !== undefined ? options.bleed : 2;

  // Window size: 2x2 tiles around the click point
  const regionX = Math.floor((wx - TILE) / TILE) * TILE;
  const regionY = Math.floor((wy - TILE) / TILE) * TILE;
  const regionW = TILE * 2;
  const regionH = TILE * 2;

  const regionCanvas = await compositeLayerRegion(tiles, regionX, regionY, regionW, regionH);
  const ctx = regionCanvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, regionW, regionH);
  const data = imgData.data;

  const startX = Math.floor(wx - regionX);
  const startY = Math.floor(wy - regionY);

  if (startX < 0 || startX >= regionW || startY < 0 || startY >= regionH) {
    return;
  }

  const startIdx = (startY * regionW + startX) * 4;
  const sr = data[startIdx];
  const sg = data[startIdx + 1];
  const sb = data[startIdx + 2];
  const sa = data[startIdx + 3];

  const [fr, fg, fb, fa] = parseColorToRgba(fillColor);

  // Already same color
  if (colorDistance(sr, sg, sb, sa, fr, fg, fb, fa) <= 2) {
    return;
  }

  const mask = new Uint8Array(regionW * regionH);
  const stack = [startX, startY];

  // Fast Scanline Flood Fill
  while (stack.length > 0) {
    const cy = stack.pop();
    const cx = stack.pop();

    let x1 = cx;
    while (x1 >= 0) {
      const idx = (cy * regionW + x1) * 4;
      const mIdx = cy * regionW + x1;
      if (mask[mIdx] || colorDistance(data[idx], data[idx + 1], data[idx + 2], data[idx + 3], sr, sg, sb, sa) > tolerance) {
        break;
      }
      x1--;
    }
    x1++;

    let x2 = cx;
    while (x2 < regionW) {
      const idx = (cy * regionW + x2) * 4;
      const mIdx = cy * regionW + x2;
      if (mask[mIdx] || colorDistance(data[idx], data[idx + 1], data[idx + 2], data[idx + 3], sr, sg, sb, sa) > tolerance) {
        break;
      }
      x2++;
    }
    x2--;

    for (let x = x1; x <= x2; x++) {
      mask[cy * regionW + x] = 1;
    }

    // Check row above and row below
    for (const ny of [cy - 1, cy + 1]) {
      if (ny < 0 || ny >= regionH) continue;
      let inSpan = false;
      for (let x = x1; x <= x2; x++) {
        const idx = (ny * regionW + x) * 4;
        const mIdx = ny * regionW + x;
        const matches = !mask[mIdx] && colorDistance(data[idx], data[idx + 1], data[idx + 2], data[idx + 3], sr, sg, sb, sa) <= tolerance;

        if (matches && !inSpan) {
          stack.push(x, ny);
          inSpan = true;
        } else if (!matches && inSpan) {
          inSpan = false;
        }
      }
    }
  }

  // Bleed Dilation (Default 2px expansion under lineart contours)
  let finalMask = mask;
  if (bleed > 0) {
    finalMask = new Uint8Array(mask);
    const r2 = bleed * bleed;

    for (let y = 0; y < regionH; y++) {
      for (let x = 0; x < regionW; x++) {
        if (mask[y * regionW + x] === 1) {
          // Check if this pixel is near a boundary
          let isBoundary = false;
          for (let dy = -1; dy <= 1 && !isBoundary; dy++) {
            for (let dx = -1; dx <= 1 && !isBoundary; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && nx < regionW && ny >= 0 && ny < regionH) {
                if (mask[ny * regionW + nx] === 0) isBoundary = true;
              }
            }
          }

          if (isBoundary) {
            for (let dy = -bleed; dy <= bleed; dy++) {
              for (let dx = -bleed; dx <= bleed; dx++) {
                if (dx * dx + dy * dy <= r2) {
                  const nx = x + dx;
                  const ny = y + dy;
                  if (nx >= 0 && nx < regionW && ny >= 0 && ny < regionH) {
                    finalMask[ny * regionW + nx] = 1;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // Paint the filled & dilated mask onto the canvas data
  for (let i = 0; i < finalMask.length; i++) {
    if (finalMask[i] === 1) {
      const p = i * 4;
      data[p] = fr;
      data[p + 1] = fg;
      data[p + 2] = fb;
      data[p + 3] = fa;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  await blitCanvasIntoTiles(tiles, regionCanvas, regionX, regionY, 'source-over');
}

export const SmartFillEngine = {
  floodFillWithBleed,
};
