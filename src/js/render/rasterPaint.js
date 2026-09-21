// src/js/render/rasterPaint.js
// PIXEL-SPACE TOOLKIT: smear, soften, underpaint blits + lightweight tile undo.
import { tileKey, tileRangeForRect, compositeLayerRegion, blitCanvasIntoTiles } from '../infiniteCanvas.js';
import { commandManager } from '../project/commandManager.js';
import { scheduleAutosave } from '../project/autosave.js';

export class TileRegionDeltaCommand {
  constructor(frame, layerId, before, after) {
    this.frame = frame; this.layerId = layerId; this.before = before; this.after = after;
  }
  _apply(map) {
    const store = this.frame.layerData[this.layerId] || (this.frame.layerData[this.layerId] = { tiles: {}, strokes: [] });
    const tiles = store.tiles || (store.tiles = {});
    for (const k in map) {
      if (map[k] == null) delete tiles[k];
      else tiles[k] = map[k];
    }
  }
  async execute() { this._apply(this.after); }
  async undo() { this._apply(this.before); }
  async redo() { this._apply(this.after); }
}

export function pushAppliedCommand(cmd) {
  commandManager.undoStack.push(cmd);
  if (commandManager.undoStack.length > commandManager.maxDepth) {
    const dropped = commandManager.undoStack.shift();
    if (dropped && typeof dropped.dispose === 'function') dropped.dispose();
  }
  commandManager.clearRedoStack();
  commandManager.notifyUI();
  scheduleAutosave(true);
}

function storeOf(frame, layerId) {
  return frame.layerData[layerId] || (frame.layerData[layerId] = { tiles: {}, strokes: [] });
}
function keysInRange(x, y, w, h) {
  const r = tileRangeForRect(x, y, w, h);
  const out = [];
  for (let cy = r.y0; cy <= r.y1; cy++) for (let cx = r.x0; cx <= r.x1; cx++) out.push(tileKey(cx, cy));
  return out;
}

/** Blit a world-positioned canvas into the layer tiles, recording undo. */
export async function commitRasterBlit(frame, layerId, canvas, wx, wy, op = 'source-over', alpha = 1) {
  const store = storeOf(frame, layerId);
  const tiles = store.tiles || (store.tiles = {});
  const keys = keysInRange(wx, wy, canvas.width, canvas.height);
  const before = {}; keys.forEach((k) => (before[k] = tiles[k] ?? null));
  await blitCanvasIntoTiles(tiles, canvas, wx, wy, op, alpha);
  const after = {}; keys.forEach((k) => (after[k] = tiles[k] ?? null));
  pushAppliedCommand(new TileRegionDeltaCommand(frame, layerId, before, after));
}

/* ------------------------------------------------------------------ */
/* CONTINUOUS RASTER SESSIONS (smear / soften)                         */
/* ------------------------------------------------------------------ */
export class RasterSession {
  constructor(project, frame, layerId, settings) {
    this.project = project; this.frame = frame; this.layerId = layerId; this.settings = settings;
    this.before = {}; this.union = null; this.ready = false; this.last = null;
  }
  _tiles() { return storeOf(this.frame, this.layerId).tiles || (storeOf(this.frame, this.layerId).tiles = {}); }
  _captureBefore(x, y, w, h) {
    const tiles = this._tiles();
    for (const k of keysInRange(x, y, w, h)) if (!(k in this.before)) this.before[k] = tiles[k] ?? null;
    if (!this.union) this.union = { x, y, w, h };
    else {
      const x2 = Math.min(this.union.x, x), y2 = Math.min(this.union.y, y);
      const xe = Math.max(this.union.x + this.union.w, x + w), ye = Math.max(this.union.y + this.union.h, y + h);
      this.union = { x: x2, y: y2, w: xe - x2, h: ye - y2 };
    }
  }
  async start() { this.ready = true; }
  async move() {}
  async finish() {
    if (!this.union || Object.keys(this.before).length === 0) return;
    const tiles = this._tiles();
    const after = {};
    for (const k of keysInRange(this.union.x, this.union.y, this.union.w, this.union.h)) {
      after[k] = tiles[k] ?? null;
      if (!(k in this.before)) this.before[k] = null;
    }
    pushAppliedCommand(new TileRegionDeltaCommand(this.frame, this.layerId, this.before, after));
  }
}

/** Classic finger-paint smudge: carry pixels forward along the drag. */
export class SmearSession extends RasterSession {
  async start(wx, wy) {
    const size = this.settings.size || 30;
    this.r = Math.max(2, size / 2);
    this.strength = Math.max(0.05, Math.min(1, this.settings.smearStrength ?? 0.65));
    this.spacing = Math.max(1.5, this.r * 0.25);
    // radial falloff mask
    const f = document.createElement('canvas');
    f.width = f.height = Math.ceil(this.r * 2);
    const fx = f.getContext('2d');
    const g = fx.createRadialGradient(this.r, this.r, 0, this.r, this.r, this.r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    fx.fillStyle = g; fx.fillRect(0, 0, f.width, f.height);
    this.falloff = f;
    // initial carry = sample under the brush
    const d = Math.ceil(this.r) * 2;
    this.carry = await compositeLayerRegion(this._tiles(), wx - this.r, wy - this.r, d, d);
    this.last = { x: wx, y: wy };
    this.ready = true;
  }
  async move(wx, wy) {
    if (!this.ready || !this.last) return;
    if (Math.hypot(wx - this.last.x, wy - this.last.y) < this.spacing) return;
    this.last = { x: wx, y: wy };
    const tiles = this._tiles();
    const pad = Math.ceil(this.r) + 4;
    const rx = wx - pad, ry = wy - pad, rw = pad * 2, rh = pad * 2;
    this._captureBefore(rx, ry, rw, rh);
    const region = await compositeLayerRegion(tiles, rx, ry, rw, rh);
    const rc = region.getContext('2d');
    // stamp the carried pixels with falloff
    const stamp = document.createElement('canvas');
    stamp.width = this.carry.width; stamp.height = this.carry.height;
    const sc = stamp.getContext('2d');
    sc.drawImage(this.carry, 0, 0);
    sc.globalCompositeOperation = 'destination-in';
    sc.drawImage(this.falloff, 0, 0, stamp.width, stamp.height);
    rc.save();
    rc.globalAlpha = this.strength;
    rc.drawImage(stamp, pad - this.r, pad - this.r);
    rc.restore();
    await blitCanvasIntoTiles(tiles, region, rx, ry, 'source-over');
    // re-sample carry and mix for continuity
    const d = Math.ceil(this.r) * 2;
    const sample = document.createElement('canvas');
    sample.width = sample.height = d;
    sample.getContext('2d').drawImage(region, pad - this.r, pad - this.r, d, d, 0, 0, d, d);
    const cc = this.carry.getContext('2d');
    cc.save(); cc.globalAlpha = this.strength; cc.drawImage(sample, 0, 0); cc.restore();
  }
}

/** Local box-blur brush: draw it hard, soften it later. */
export class BlurSession extends RasterSession {
  async start(wx, wy) {
    const size = this.settings.size || 30;
    this.r = Math.max(2, size / 2);
    this.strength = Math.max(0.05, Math.min(1, this.settings.blurStrength ?? 0.5));
    this.radius = Math.max(1, Math.round(this.r * 0.3));
    this.spacing = Math.max(2, this.r * 0.4);
    this.last = { x: wx, y: wy };
    this.ready = true;
    await this.move(wx, wy, true);
  }
  async move(wx, wy, force = false) {
    if (!this.ready) return;
    if (!force && this.last && Math.hypot(wx - this.last.x, wy - this.last.y) < this.spacing) return;
    this.last = { x: wx, y: wy };
    const tiles = this._tiles();
    const pad = Math.ceil(this.r) + this.radius + 2;
    const rx = wx - pad, ry = wy - pad, rw = pad * 2, rh = pad * 2;
    this._captureBefore(rx, ry, rw, rh);
    const region = await compositeLayerRegion(tiles, rx, ry, rw, rh);
    const rc = region.getContext('2d', { willReadFrequently: true });
    const img = rc.getImageData(0, 0, rw, rh);
    boxBlurImageData(img, this.radius);
    const blurred = document.createElement('canvas');
    blurred.width = rw; blurred.height = rh;
    blurred.getContext('2d').putImageData(img, 0, 0);
    rc.save(); rc.globalAlpha = this.strength; rc.drawImage(blurred, 0, 0); rc.restore();
    await blitCanvasIntoTiles(tiles, region, rx, ry, 'source-over');
  }
}

function boxBlurImageData(img, radius) {
  if (radius < 1) return;
  const w = img.width, h = img.height, d = img.data;
  const tmp = new Uint8ClampedArray(d.length);
  const iarr = 1 / (2 * radius + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    let r = 0, g = 0, b = 0, a = 0;
    for (let x = -radius; x <= radius; x++) {
      const xi = Math.min(w - 1, Math.max(0, x)) * 4 + row;
      r += d[xi]; g += d[xi + 1]; b += d[xi + 2]; a += d[xi + 3];
    }
    for (let x = 0; x < w; x++) {
      const o = row + x * 4;
      tmp[o] = r * iarr; tmp[o + 1] = g * iarr; tmp[o + 2] = b * iarr; tmp[o + 3] = a * iarr;
      const addI = Math.min(w - 1, x + radius + 1) * 4 + row;
      const subI = Math.max(0, x - radius) * 4 + row;
      r += d[addI] - d[subI]; g += d[addI + 1] - d[subI + 1];
      b += d[addI + 2] - d[subI + 2]; a += d[addI + 3] - d[subI + 3];
    }
  }
  for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let y = -radius; y <= radius; y++) {
      const yi = (Math.min(h - 1, Math.max(0, y)) * w + x) * 4;
      r += tmp[yi]; g += tmp[yi + 1]; b += tmp[yi + 2]; a += tmp[yi + 3];
    }
    for (let y = 0; y < h; y++) {
      const o = (y * w + x) * 4;
      d[o] = r * iarr; d[o + 1] = g * iarr; d[o + 2] = b * iarr; d[o + 3] = a * iarr;
      const addI = (Math.min(h - 1, y + radius + 1) * w + x) * 4;
      const subI = (Math.max(0, y - radius) * w + x) * 4;
      r += tmp[addI] - tmp[subI]; g += tmp[addI + 1] - tmp[subI + 1];
      b += tmp[addI + 2] - tmp[subI + 2]; a += tmp[addI + 3] - tmp[subI + 3];
    }
  }
}
