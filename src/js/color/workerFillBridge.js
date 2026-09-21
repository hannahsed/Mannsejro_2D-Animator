// src/js/color/workerFillBridge.js
/**
 * MAIN-THREAD FILL BRIDGE
 * Communicates with floodFill.worker.js via Transferable ArrayBuffers.
 */

import { TILE, tileKey, cameraWorldAABB, blitCanvasIntoTiles, getTileImage } from '../infiniteCanvas.js';
import { getBinaryTile, buildTileKey } from '../storage/binaryTileStore.js';
import { hexToRgb } from '../colorUtils.js';
import { commandManager, TileDeltaCommand } from '../project/commandManager.js';
import { drawStroke, drawShape } from '../canvasUtils.js';
import { drawNodeQuad } from '../viewport/nodeDraw.js';
import { drawPerspectiveShape } from '../viewport/perspectiveRectangleStudio.js';

let fillWorker = null;

function getWorker() {
  if (!fillWorker) {
    fillWorker = new Worker(new URL('../workers/floodFill.worker.js', import.meta.url), { type: 'module' });
  }
  return fillWorker;
}

export async function executeWorkerFill(project, frame, activeLayerId, worldX, worldY, settings = {}) {
  const activeLayer = project.layers.find((l) => l.id === activeLayerId);
  if (!activeLayer || activeLayer.locked || !activeLayer.visible) return false;

  const cam = project.camera || { x: project.width / 2, y: project.height / 2, scale: 1, rotation: 0 };
  const camAABB = cameraWorldAABB(cam, project.width, project.height);

  let minX = camAABB.x;
  let minY = camAABB.y;
  let maxX = camAABB.x + camAABB.w;
  let maxY = camAABB.y + camAABB.h;

  // Scan existing tiles to envelope surrounding artwork
  for (const layer of project.layers) {
    const tiles = frame.layerData[layer.id]?.tiles;
    if (!tiles) continue;
    for (const key of Object.keys(tiles)) {
      const [cx, cy] = key.split(',').map(Number);
      minX = Math.min(minX, cx * TILE);
      minY = Math.min(minY, cy * TILE);
      maxX = Math.max(maxX, (cx + 1) * TILE);
      maxY = Math.max(maxY, (cy + 1) * TILE);
    }
  }

  // Include the click point
  minX = Math.min(minX, worldX);
  minY = Math.min(minY, worldY);
  maxX = Math.max(maxX, worldX + 1);
  maxY = Math.max(maxY, worldY + 1);

  // Compute bounding box aligned to 512px tile boundaries
  const envX = Math.floor(minX / TILE) * TILE;
  const envY = Math.floor(minY / TILE) * TILE;
  const rawW = Math.ceil((maxX - envX) / TILE) * TILE;
  const rawH = Math.ceil((maxY - envY) / TILE) * TILE;

  const envW = Math.min(rawW, 4096);
  const envH = Math.min(rawH, 4096);

  // Composite working region
  const offscreen = document.createElement('canvas');
  offscreen.width = envW;
  offscreen.height = envH;
  const octx = offscreen.getContext('2d', { willReadFrequently: true });

  const sampleMode = settings.fillSampleMode ?? 'all';
  const layersToSample = sampleMode === 'all'
    ? project.layers.filter((l) => l.visible)
    : [activeLayer];

  for (const layer of layersToSample) {
    const lData = frame.layerData[layer.id];
    if (!lData) continue;

    octx.save();
    octx.globalAlpha = layer.opacity ?? 1;

    // 1. Draw tiles
    if (lData.tiles) {
      const x0 = Math.floor(envX / TILE);
      const y0 = Math.floor(envY / TILE);
      const x1 = Math.floor((envX + envW) / TILE);
      const y1 = Math.floor((envY + envH) / TILE);

      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const coords = tileKey(cx, cy);
          if (lData.tiles[coords]) {
            const compKey = buildTileKey(project.id, frame.id, layer.id, coords);
            let bitmap = await getBinaryTile(compKey);
            if (!bitmap && typeof lData.tiles[coords] === 'string') {
              bitmap = await getTileImage(lData.tiles[coords]);
            }
            if (bitmap) {
              octx.drawImage(bitmap, cx * TILE - envX, cy * TILE - envY);
            }
          }
        }
      }
    }

    // 2. Draw vector strokes as solid boundaries
    if (lData.strokes && lData.strokes.length > 0) {
      octx.save();
      octx.translate(-envX, -envY);
      for (const stroke of lData.strokes) {
        if (stroke.isPerspectiveShape) {
          drawPerspectiveShape(octx, stroke);
        } else if (stroke.isNodeQuad) {
          drawNodeQuad(octx, stroke);
        } else if (stroke.isShape && stroke.shapeData) {
          drawShape(octx, stroke.tool, stroke.shapeData.start, stroke.shapeData.end, stroke.settings, stroke.shapeData.shiftKey);
        } else {
          drawStroke(octx, stroke.points, stroke.tool, stroke.settings);
        }
      }
      octx.restore();
    }

    octx.restore();
  }

  const localX = Math.round(worldX - envX);
  const localY = Math.round(worldY - envY);

  if (localX < 0 || localX >= envW || localY < 0 || localY >= envH) return false;

  const imgData = octx.getImageData(0, 0, envW, envH);

  // Snapshot before-state of affected tiles for undo
  const tileDeltas = {};
  const x0 = Math.floor(envX / TILE);
  const y0 = Math.floor(envY / TILE);
  const x1 = Math.floor((envX + envW) / TILE);
  const y1 = Math.floor((envY + envH) / TILE);

  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const coords = tileKey(cx, cy);
      const compKey = buildTileKey(project.id, frame.id, activeLayer.id, coords);
      const existing = await getBinaryTile(compKey);
      tileDeltas[coords] = { before: existing, after: null };
    }
  }

  const worker = getWorker();

  // Execute fill off the main thread with zero-copy buffer transfer
  const workerResult = await new Promise((resolve) => {
    worker.onmessage = (e) => resolve(e.data);
    worker.postMessage(
      {
        pixelBuffer: imgData.data.buffer,
        width: envW,
        height: envH,
        startX: localX,
        startY: localY,
        fillColor: settings.color || '#3b82f6',
        tolerance: settings.fillTolerance ?? 32,
        closeGapRadius: settings.fillCloseGap ?? 2,
        bleedPixels: settings.fillBleed ?? 2,
        isArtisticMoat: settings.fillStyleMode === 'artistic',
        moatWidth: settings.fillMoatWidth ?? 4
      },
      [imgData.data.buffer] // Zero-copy transfer
    );
  });

  if (!workerResult || !workerResult.maskBuffer) return false;

  const mask = new Uint8Array(workerResult.maskBuffer);
  const rgb = hexToRgb(settings.color || '#3b82f6');

  // Rasterize result onto an offscreen canvas
  const fillCanvas = document.createElement('canvas');
  fillCanvas.width = envW;
  fillCanvas.height = envH;
  const fCtx = fillCanvas.getContext('2d');
  const outImg = fCtx.createImageData(envW, envH);
  const outData = outImg.data;

  let painted = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 1) {
      const p = i * 4;
      outData[p] = rgb.r;
      outData[p + 1] = rgb.g;
      outData[p + 2] = rgb.b;
      outData[p + 3] = 255;
      painted++;
    }
  }

  if (painted === 0) return false;

  fCtx.putImageData(outImg, 0, 0);

  // Commit updated tiles
  const store = frame.layerData[activeLayer.id] || (frame.layerData[activeLayer.id] = { tiles: {}, strokes: [] });
  if (!store.tiles) store.tiles = {};
  await blitCanvasIntoTiles(store.tiles, fillCanvas, envX, envY, 'source-over');

  // Record after-state for delta undo
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const coords = tileKey(cx, cy);
      const compKey = buildTileKey(project.id, frame.id, activeLayer.id, coords);
      tileDeltas[coords].after = await getBinaryTile(compKey);
    }
  }

  // Push lightweight delta command to undo manager
  await commandManager.execute(new TileDeltaCommand(frame.id, activeLayer.id, tileDeltas));

  return true;
}
