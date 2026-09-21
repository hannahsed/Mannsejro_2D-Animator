// Chunked infinite-canvas engine.
// The world is unbounded. Art is stored as fixed-size tiles per (frame, layer).
// Only non-empty tiles are stored, so memory scales with content, not canvas size.

import { floodFill } from './colorUtils.js';

export const TILE = 512;

export function tileKey(cx, cy) {
  return cx + ',' + cy;
}

export function parseTileKey(key) {
  const [cx, cy] = key.split(',').map(Number);
  return { cx, cy };
}

export function tileRangeForRect(x, y, w, h) {
  return {
    x0: Math.floor(x / TILE),
    y0: Math.floor(y / TILE),
    x1: Math.floor((x + w) / TILE),
    y1: Math.floor((y + h) / TILE),
  };
}

// Axis-aligned world bounding box of a rotated camera capture region.
export function cameraWorldAABB(camera, pw, ph) {
  const hw = (pw * (camera.scale || 1)) / 2;
  const hh = (ph * (camera.scale || 1)) / 2;
  const cos = Math.abs(Math.cos(camera.rotation || 0));
  const sin = Math.abs(Math.sin(camera.rotation || 0));
  const ex = hw * cos + hh * sin;
  const ey = hw * sin + hh * cos;
  return { x: camera.x - ex, y: camera.y - ey, w: ex * 2, h: ey * 2 };
}

// ---- Decoded-tile image cache (keyed by dataURL or ImageBitmap) ----
const imgCache = new Map();
const IMG_CACHE_MAX = 500;

export function getTileImage(source) {
  if (!source) return Promise.resolve(null);
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    return Promise.resolve(source);
  }
  if (source instanceof HTMLImageElement || source instanceof HTMLCanvasElement || (typeof OffscreenCanvas !== 'undefined' && source instanceof OffscreenCanvas)) {
    return Promise.resolve(source);
  }
  if (typeof source !== 'string') return Promise.resolve(null);
  if (imgCache.has(source)) return Promise.resolve(imgCache.get(source));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (imgCache.size >= IMG_CACHE_MAX) {
        const first = imgCache.keys().next().value;
        imgCache.delete(first);
      }
      imgCache.set(source, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = source;
  });
}

// Draw every tile that intersects a world rect into `ctx` (ctx already in world space).
export async function drawTilesInWorldRect(ctx, tilesMap, rect) {
  if (!tilesMap) return;
  const { x0, y0, x1, y1 } = tileRangeForRect(rect.x, rect.y, rect.w, rect.h);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const img = await getTileImage(tilesMap[tileKey(cx, cy)]);
      if (img) ctx.drawImage(img, cx * TILE, cy * TILE);
    }
  }
}

// Write a world-positioned source canvas into every tile it overlaps. `op` is a
// globalCompositeOperation ('source-over' for ink, 'destination-out' for eraser,
// 'multiply' for marker). Mutates `tiles`.
export async function blitCanvasIntoTiles(tiles, src, srcX, srcY, op = 'source-over', alpha = 1) {
  const { x0, y0, x1, y1 } = tileRangeForRect(srcX, srcY, src.width, src.height);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const key = tileKey(cx, cy);
      const c = document.createElement('canvas');
      c.width = TILE;
      c.height = TILE;
      const tctx = c.getContext('2d');
      const existing = tiles[key];
      if (existing) {
        const img = await getTileImage(existing);
        if (img) tctx.drawImage(img, 0, 0);
      }
      tctx.save();
      tctx.globalCompositeOperation = op;
      tctx.globalAlpha = alpha;
      tctx.drawImage(src, srcX - cx * TILE, srcY - cy * TILE);
      tctx.restore();
      
      // ZERO FLICKER: Store the canvas directly in cache before generating string
      const dataUrl = c.toDataURL('image/png');
      imgCache.set(dataUrl, c);
      tiles[key] = dataUrl;
    }
  }
}

// Composite one layer's tiles over a world rect into a 1:1 canvas (for fill sampling).
export async function compositeLayerRegion(tiles, x, y, w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d');
  if (!tiles) return c;
  const { x0, y0, x1, y1 } = tileRangeForRect(x, y, w, h);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const img = await getTileImage(tiles[tileKey(cx, cy)]);
      if (img) ctx.drawImage(img, cx * TILE - x, cy * TILE - y);
    }
  }
  return c;
}

// Local-window flood fill on a tiled layer (window = 2×2 tiles around the point).
export async function floodFillTiles(tiles, wx, wy, fillColorHex, tolerance, fillFn) {
  const x = Math.floor((wx - TILE) / TILE) * TILE;
  const y = Math.floor((wy - TILE) / TILE) * TILE;
  const w = TILE * 2;
  const h = TILE * 2;
  const region = await compositeLayerRegion(tiles, x, y, w, h);
  const rctx = region.getContext('2d');
  fillFn(rctx, Math.round(wx - x), Math.round(wy - y), fillColorHex, tolerance);
  await blitCanvasIntoTiles(tiles, region, x, y, 'source-over');
}

// Build a fresh tile map from a full canvas placed at a world position.
export async function tilesFromCanvas(src, worldX, worldY) {
  const tiles = {};
  await blitCanvasIntoTiles(tiles, src, worldX, worldY, 'source-over');
  return tiles;
}

export function copyTiles(tiles) {
  const out = {};
  if (tiles) for (const k in tiles) out[k] = tiles[k];
  return out;
}

export async function floodFillWorld(tiles, wx, wy, fillColorHex, tolerance = 32) {
  return floodFillTiles(tiles, wx, wy, fillColorHex, tolerance, floodFill);
}
