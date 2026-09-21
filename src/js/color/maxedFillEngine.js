// src/js/color/maxedFillEngine.js
import { hexToRgb } from '../colorUtils.js';
import { blitCanvasIntoTiles, compositeLayerRegion } from '../infiniteCanvas.js';
import { drawStroke, drawShape, drawPolygonShape } from '../canvasUtils.js';
import { drawNodeQuad } from '../viewport/nodeDraw.js';
import { drawPerspectiveShape } from '../viewport/perspectiveRectangleStudio.js';

function drawLayerStrokesToSample(ctx, strokes, winX, winY) {
  if (!strokes || strokes.length === 0) return;
  ctx.save();
  ctx.translate(-winX, -winY);
  for (const stroke of strokes) {
    if (stroke.isPerspectiveShape) {
      drawPerspectiveShape(ctx, stroke);
    } else if (stroke.isPolygon) {
      drawPolygonShape(ctx, stroke);
    } else if (stroke.isNodeQuad) {
      drawNodeQuad(ctx, stroke);
    } else if (stroke.isShape && stroke.shapeData) {
      drawShape(ctx, stroke.tool, stroke.shapeData.start, stroke.shapeData.end, stroke.settings, stroke.shapeData.shiftKey);
    } else if (stroke.points && stroke.points.length > 0) {
      drawStroke(ctx, stroke.points, stroke.tool || 'pencil', stroke.settings);
    }
  }
  ctx.restore();
}

export class MaxedFillEngine {
  /**
   * Dual-Mode Smart Fill:
   * - 'precision': True Morphological Closing (Dilate -> Erode) + Bleed (No gaps, no halos)
   * - 'artistic': Sticker Cutout / Pop-Art Moat (Floats with a deliberate white buffer)
   */
  static async executeSmartFill(project, frame, activeLayerId, worldX, worldY, settings) {
    const activeLayer = project.layers.find((l) => l.id === activeLayerId);
    if (!activeLayer || activeLayer.locked || !activeLayer.visible) return false;

    const fillStyleMode = settings.fillStyleMode || 'precision'; // 'precision' | 'artistic'
    const fillColor = settings.color || '#f97316';
    const tolerance = settings.fillTolerance ?? 32;
    const closeGapRadius = settings.fillCloseGap ?? 3; // 1 to 6px gap bridge
    const bleedPixels = settings.fillBleed ?? 2;       // Slide under lineart
    const moatWidth = settings.fillMoatWidth ?? 4;     // Pop-art moat distance
    const sampleMode = settings.fillSampleMode ?? 'all';

    // 1. Build an expanded 1536x1536 window (3x3 tiles) around click point
    const windowSize = 1536;
    const winX = Math.floor((worldX - windowSize / 2) / 64) * 64;
    const winY = Math.floor((worldY - windowSize / 2) / 64) * 64;

    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = windowSize;
    sampleCanvas.height = windowSize;
    const sampleCtx = sampleCanvas.getContext('2d');

    // 2. Composite sample source (Tiles + Vector Strokes)
    if (sampleMode === 'all') {
      for (const layer of project.layers) {
        if (!layer.visible) continue;
        const tiles = frame.layerData[layer.id]?.tiles;
        if (tiles && Object.keys(tiles).length > 0) {
          const region = await compositeLayerRegion(tiles, winX, winY, windowSize, windowSize);
          sampleCtx.save();
          sampleCtx.globalAlpha = layer.opacity ?? 1;
          sampleCtx.drawImage(region, 0, 0);
          sampleCtx.restore();
        }
        const strokes = frame.layerData[layer.id]?.strokes;
        if (strokes && strokes.length > 0) {
          sampleCtx.save();
          sampleCtx.globalAlpha = layer.opacity ?? 1;
          drawLayerStrokesToSample(sampleCtx, strokes, winX, winY);
          sampleCtx.restore();
        }
      }
    } else {
      const tiles = frame.layerData[activeLayer.id]?.tiles;
      if (tiles && Object.keys(tiles).length > 0) {
        const region = await compositeLayerRegion(tiles, winX, winY, windowSize, windowSize);
        sampleCtx.drawImage(region, 0, 0);
      }
      const strokes = frame.layerData[activeLayer.id]?.strokes;
      if (strokes && strokes.length > 0) {
        drawLayerStrokesToSample(sampleCtx, strokes, winX, winY);
      }
    }

    const localX = Math.round(worldX - winX);
    const localY = Math.round(worldY - winY);

    if (localX < 0 || localX >= windowSize || localY < 0 || localY >= windowSize) return false;

    const imgData = sampleCtx.getImageData(0, 0, windowSize, windowSize);
    const data = imgData.data;

    const startIndex = (localY * windowSize + localX) * 4;
    const targetR = data[startIndex];
    const targetG = data[startIndex + 1];
    const targetB = data[startIndex + 2];
    const targetA = data[startIndex + 3];

    const fillRgb = hexToRgb(fillColor);
    const tolDiff = tolerance * 4;

    const isTargetColor = (p) =>
      Math.abs(data[p] - targetR) +
      Math.abs(data[p + 1] - targetG) +
      Math.abs(data[p + 2] - targetB) +
      Math.abs(data[p + 3] - targetA) <= tolDiff;

    if (
      Math.abs(targetR - fillRgb.r) < 2 &&
      Math.abs(targetG - fillRgb.g) < 2 &&
      Math.abs(targetB - fillRgb.b) < 2 &&
      targetA === 255
    ) {
      return false;
    }

    const totalPixels = windowSize * windowSize;
    let obstacleMap = null;

    // ========================================================
    // 3. OBSTACLE GENERATION & GAP CLOSING
    // ========================================================
    if (fillStyleMode === 'artistic') {
      // ARTISTIC MOAT: Dilate lines outward by moatWidth without eroding back.
      // This creates the intentional sticker cutout buffer.
      obstacleMap = new Uint8Array(totalPixels);
      for (let i = 0; i < totalPixels; i++) {
        if (!isTargetColor(i * 4)) obstacleMap[i] = 1;
      }
      obstacleMap = this.dilateBinary(obstacleMap, windowSize, windowSize, moatWidth);
    } else {
      // PRECISION CEL: Full Morphological Closing (Dilate -> Erode).
      // Bridges gaps without fattening lines or creating a moat.
      if (closeGapRadius > 0) {
        let rawObstacles = new Uint8Array(totalPixels);
        for (let i = 0; i < totalPixels; i++) {
          if (!isTargetColor(i * 4)) rawObstacles[i] = 1;
        }
        const dilated = this.dilateBinary(rawObstacles, windowSize, windowSize, closeGapRadius);
        obstacleMap = this.erodeBinary(dilated, windowSize, windowSize, closeGapRadius);
      }
    }

    // ========================================================
    // 4. SCANLINE FLOOD FILL
    // ========================================================
    const fillMask = new Uint8Array(totalPixels);
    const queue = [[localX, localY]];
    fillMask[localY * windowSize + localX] = 1;

    while (queue.length > 0) {
      const [currX, currY] = queue.pop();

      let wx = currX;
      while (wx > 0) {
        const nextX = wx - 1;
        const p = currY * windowSize + nextX;
        if (fillMask[p] !== 0) break;
        if (obstacleMap ? obstacleMap[p] === 1 : !isTargetColor(p * 4)) break;
        fillMask[p] = 1;
        wx--;
      }

      let ex = currX;
      while (ex < windowSize - 1) {
        const nextX = ex + 1;
        const p = currY * windowSize + nextX;
        if (fillMask[p] !== 0) break;
        if (obstacleMap ? obstacleMap[p] === 1 : !isTargetColor(p * 4)) break;
        fillMask[p] = 1;
        ex++;
      }

      for (const ny of [currY - 1, currY + 1]) {
        if (ny < 0 || ny >= windowSize) continue;
        let inRun = false;
        for (let x = wx; x <= ex; x++) {
          const p = ny * windowSize + x;
          const open = fillMask[p] === 0 && (obstacleMap ? obstacleMap[p] === 0 : isTargetColor(p * 4));
          if (open) {
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

    // ========================================================
    // 5. HALO KILLER BLEED (Only active in Precision Mode)
    // ========================================================
    let finalMask = fillMask;
    if (fillStyleMode === 'precision' && bleedPixels > 0) {
      finalMask = this.dilateBinary(fillMask, windowSize, windowSize, bleedPixels);
    }

    // ========================================================
    // 6. BLIT RESULT
    // ========================================================
    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = windowSize;
    resultCanvas.height = windowSize;
    const rCtx = resultCanvas.getContext('2d');
    const resultImg = rCtx.createImageData(windowSize, windowSize);
    const rData = resultImg.data;

    for (let i = 0; i < totalPixels; i++) {
      if (finalMask[i] === 1) {
        const p = i * 4;
        rData[p] = fillRgb.r;
        rData[p + 1] = fillRgb.g;
        rData[p + 2] = fillRgb.b;
        rData[p + 3] = 255;
      }
    }
    rCtx.putImageData(resultImg, 0, 0);

    const store = frame.layerData[activeLayer.id] || (frame.layerData[activeLayer.id] = { tiles: {} });
    await blitCanvasIntoTiles(store.tiles, resultCanvas, winX, winY, 'source-over');

    return true;
  }

  static dilateBinary(mask, w, h, radius) {
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

  static erodeBinary(mask, w, h, radius) {
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
}
