// src/js/color/seamlessFill.js
import { hexToRgb } from '../colorUtils.js';
import { TILE, tileKey, cameraWorldAABB, blitCanvasIntoTiles, getTileImage } from '../infiniteCanvas.js';
import { drawStroke, drawShape } from '../canvasUtils.js';

export async function executeSeamlessFill(project, frame, activeLayerId, worldX, worldY, settings) {
  const activeLayer = project.layers.find((l) => l.id === activeLayerId);
  if (!activeLayer || activeLayer.locked || !activeLayer.visible) return false;

  const fillColor = settings.color || '#3b82f6';
  const tolerance = settings.fillTolerance ?? 32;
  const bleedPixels = settings.fillBleed ?? 2;
  const closeGapRadius = settings.fillCloseGap ?? 2;
  const sampleMode = settings.fillSampleMode ?? 'all'; // 'all' (visible layers) | 'active'

  // 1. Calculate the true working envelope (Camera Frame + Artwork Bounds)
  const cam = project.camera || { x: project.width / 2, y: project.height / 2, scale: 1, rotation: 0 };
  const camAABB = cameraWorldAABB(cam, project.width, project.height);

  let minX = camAABB.x;
  let minY = camAABB.y;
  let maxX = camAABB.x + camAABB.w;
  let maxY = camAABB.y + camAABB.h;

  // Scan all existing tiles in this frame to ensure shapes outside camera are covered
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

  // Align to full 512px tile boundaries
  const envX = Math.floor(minX / TILE) * TILE;
  const envY = Math.floor(minY / TILE) * TILE;
  const envW = Math.ceil((maxX - envX) / TILE) * TILE;
  const envH = Math.ceil((maxY - envY) / TILE) * TILE;

  // Safety clamp to prevent out-of-memory on extreme coordinates
  const clampedW = Math.min(envW, 4096);
  const clampedH = Math.min(envH, 4096);

  // 2. Build the unified composite sample canvas (Zero Seams)
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = clampedW;
  sampleCanvas.height = clampedH;
  const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

  const layersToSample = sampleMode === 'all'
    ? project.layers.filter((l) => l.visible)
    : [activeLayer];

  for (const layer of layersToSample) {
    const lData = frame.layerData[layer.id];
    if (!lData) continue;
    sampleCtx.save();
    sampleCtx.globalAlpha = layer.opacity ?? 1;

    // 1. Draw tiles
    if (lData.tiles) {
      const x0 = Math.floor(envX / TILE);
      const y0 = Math.floor(envY / TILE);
      const x1 = Math.floor((envX + clampedW) / TILE);
      const y1 = Math.floor((envY + clampedH) / TILE);

      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const key = tileKey(cx, cy);
          if (lData.tiles[key]) {
            const img = await getTileImage(lData.tiles[key]);
            if (img) {
              sampleCtx.drawImage(img, cx * TILE - envX, cy * TILE - envY);
            }
          }
        }
      }
    }

    // 2. Draw vector strokes as solid boundaries for the flood fill
    if (lData.strokes && lData.strokes.length > 0) {
      sampleCtx.save();
      sampleCtx.translate(-envX, -envY);
      for (const stroke of lData.strokes) {
        if (stroke.isShape && stroke.shapeData) {
          drawShape(sampleCtx, stroke.tool, stroke.shapeData.start, stroke.shapeData.end, stroke.settings, stroke.shapeData.shiftKey);
        } else {
          drawStroke(sampleCtx, stroke.points, stroke.tool, stroke.settings);
        }
      }
      sampleCtx.restore();
    }

    sampleCtx.restore();
  }

  // 3. Coordinate check inside sample space
  const localX = Math.round(worldX - envX);
  const localY = Math.round(worldY - envY);

  if (localX < 0 || localX >= clampedW || localY < 0 || localY >= clampedH) {
    return false;
  }

  // If clicked inside camera frame on empty canvas, constrain boundary to camera AABB
  const isInsideCamera =
    worldX >= camAABB.x &&
    worldX <= camAABB.x + camAABB.w &&
    worldY >= camAABB.y &&
    worldY <= camAABB.y + camAABB.h;

  const imgData = sampleCtx.getImageData(0, 0, clampedW, clampedH);
  const data = imgData.data;

  const startIdx = (localY * clampedW + localX) * 4;
  const targetR = data[startIdx];
  const targetG = data[startIdx + 1];
  const targetB = data[startIdx + 2];
  const targetA = data[startIdx + 3];

  const fillRgb = hexToRgb(fillColor);
  const tolThreshold = tolerance * 4;

  const isColorMatch = (pos) =>
    Math.abs(data[pos] - targetR) +
    Math.abs(data[pos + 1] - targetG) +
    Math.abs(data[pos + 2] - targetB) +
    Math.abs(data[pos + 3] - targetA) <= tolThreshold;

  // Don't re-fill if identical
  if (
    Math.abs(targetR - fillRgb.r) < 2 &&
    Math.abs(targetG - fillRgb.g) < 2 &&
    Math.abs(targetB - fillRgb.b) < 2 &&
    targetA === 255
  ) {
    return false;
  }

  // 4. Build obstacle map with Morphological Gap Closing
  const totalPixels = clampedW * clampedH;
  let obstacleMap = new Uint8Array(totalPixels);

  // If clicked inside camera frame, mark pixels outside camera as boundaries
  if (isInsideCamera) {
    const camLeft = Math.round(camAABB.x - envX);
    const camTop = Math.round(camAABB.y - envY);
    const camRight = camLeft + Math.round(camAABB.w);
    const camBottom = camTop + Math.round(camAABB.h);

    for (let y = 0; y < clampedH; y++) {
      const yOffset = y * clampedW;
      const outsideY = y < camTop || y >= camBottom;
      for (let x = 0; x < clampedW; x++) {
        if (outsideY || x < camLeft || x >= camRight) {
          obstacleMap[yOffset + x] = 1;
        } else if (!isColorMatch((yOffset + x) * 4)) {
          obstacleMap[yOffset + x] = 1;
        }
      }
    }
  } else {
    for (let i = 0; i < totalPixels; i++) {
      if (!isColorMatch(i * 4)) {
        obstacleMap[i] = 1;
      }
    }
  }

  const fillStyleMode = settings.fillStyleMode || 'precision';
  const moatWidth = settings.fillMoatWidth ?? 4;

  if (fillStyleMode === 'artistic') {
    // POP-ART MOAT: Dilate obstacles outward without eroding back
    obstacleMap = dilate(obstacleMap, clampedW, clampedH, moatWidth);
  } else if (closeGapRadius > 0) {
    // PRECISION CEL: Dilate obstacles to seal gaps, then erode back to original line size
    const dilated = dilate(obstacleMap, clampedW, clampedH, closeGapRadius);
    obstacleMap = erode(dilated, clampedW, clampedH, closeGapRadius);
  }

  // 5. Scanline Flood Fill (High-speed queue)
  const fillMask = new Uint8Array(totalPixels);
  const queue = [[localX, localY]];
  fillMask[localY * clampedW + localX] = 1;

  while (queue.length > 0) {
    const [currX, currY] = queue.pop();

    let wx = currX;
    while (wx > 0) {
      const nextX = wx - 1;
      const p = currY * clampedW + nextX;
      if (fillMask[p] !== 0 || obstacleMap[p] === 1) break;
      fillMask[p] = 1;
      wx--;
    }

    let ex = currX;
    while (ex < clampedW - 1) {
      const nextX = ex + 1;
      const p = currY * clampedW + nextX;
      if (fillMask[p] !== 0 || obstacleMap[p] === 1) break;
      fillMask[p] = 1;
      ex++;
    }

    for (const ny of [currY - 1, currY + 1]) {
      if (ny < 0 || ny >= clampedH) continue;
      let inRun = false;
      const rowOffset = ny * clampedW;
      for (let x = wx; x <= ex; x++) {
        const p = rowOffset + x;
        const canFill = fillMask[p] === 0 && obstacleMap[p] === 0;
        if (canFill) {
          if (!inRun) {
            queue.push([x, ny]);
            fillMask[p] = 1;
            inRun = true;
          }
        } else {
          inRun = false;
        }
      }
    }
  }

  // 6. Halo Killer Bleed (Dilate color slightly under lineart)
  const finalMask = bleedPixels > 0 ? dilate(fillMask, clampedW, clampedH, bleedPixels) : fillMask;

  // 7. Write to filled canvas
  const fillCanvas = document.createElement('canvas');
  fillCanvas.width = clampedW;
  fillCanvas.height = clampedH;
  const fillCtx = fillCanvas.getContext('2d');
  const fillImg = fillCtx.createImageData(clampedW, clampedH);
  const fData = fillImg.data;

  let paintedCount = 0;
  for (let i = 0; i < totalPixels; i++) {
    if (finalMask[i] === 1) {
      const p = i * 4;
      fData[p] = fillRgb.r;
      fData[p + 1] = fillRgb.g;
      fData[p + 2] = fillRgb.b;
      fData[p + 3] = 255;
      paintedCount++;
    }
  }

  if (paintedCount === 0) return false;

  fillCtx.putImageData(fillImg, 0, 0);

  // 8. Blit back into tiles seamlessly across all affected tile chunks
  const store = frame.layerData[activeLayer.id] || (frame.layerData[activeLayer.id] = { tiles: {} });
  await blitCanvasIntoTiles(store.tiles, fillCanvas, envX, envY, 'source-over');

  return true;
}

function dilate(mask, w, h, radius) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const yOffset = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[yOffset + x] === 1) {
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          const nyOffset = ny * w;
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            if (nx >= 0 && nx < w && dx * dx + dy * dy <= radius * radius) {
              out[nyOffset + nx] = 1;
            }
          }
        }
      }
    }
  }
  return out;
}

function erode(mask, w, h, radius) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const yOffset = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[yOffset + x] === 1) {
        let keep = true;
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) { keep = false; break; }
          const nyOffset = ny * w;
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w || dx * dx + dy * dy > radius * radius) continue;
            if (mask[nyOffset + nx] === 0) {
              keep = false;
              break;
            }
          }
          if (!keep) break;
        }
        if (keep) out[yOffset + x] = 1;
      }
    }
  }
  return out;
}
