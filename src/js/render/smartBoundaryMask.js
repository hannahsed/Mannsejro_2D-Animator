// src/js/render/smartBoundaryMask.js
import { TILE, tileKey, cameraWorldAABB, getTileImage } from '../infiniteCanvas.js';
import { drawStroke, drawShape } from '../canvasUtils.js';

export class SmartBoundaryMaskEngine {
  /**
   * Generates a dynamic clipping mask on pointer-down based on where the stroke starts.
   * - Started Inside: Confines paint to the interior of the shape.
   * - Started Outside: Confines paint to the exterior background, protecting the interior.
   */
  static async createStrokeMask(project, frame, startWorldX, startWorldY, settings) {
    const sensitivity = settings?.lineartSensitivity ?? 35; // Contrast threshold for lines
    const lineMargin = settings?.lineartMargin ?? 1.5;      // "Stay behind line" retreat in px

    const pw = project?.width || 1920;
    const ph = project?.height || 1080;
    const cam = project?.camera || { x: pw / 2, y: ph / 2, scale: 1, rotation: 0 };
    const camAABB = cameraWorldAABB(cam, pw, ph);

    // Working envelope: Camera frame + generous padding
    const envX = Math.floor(camAABB.x / 64) * 64;
    const envY = Math.floor(camAABB.y / 64) * 64;
    const envW = Math.max(64, Math.ceil(camAABB.w / 64) * 64);
    const envH = Math.max(64, Math.ceil(camAABB.h / 64) * 64);

    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = envW;
    sampleCanvas.height = envH;
    const sCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

    // 1. Composite all visible lineart layers to find outline barriers
    const visibleLayers = project?.layers ? project.layers.filter((l) => l.visible) : [];
    for (const layer of visibleLayers) {
      const lData = frame.layerData ? frame.layerData[layer.id] : null;
      if (!lData) continue;

      sCtx.save();
      sCtx.globalAlpha = layer.opacity ?? 1;

      // Draw raster tiles
      if (lData.tiles) {
        const x0 = Math.floor(envX / TILE);
        const y0 = Math.floor(envY / TILE);
        const x1 = Math.floor((envX + envW) / TILE);
        const y1 = Math.floor((envY + envH) / TILE);
        for (let cy = y0; cy <= y1; cy++) {
          for (let cx = x0; cx <= x1; cx++) {
            const key = tileKey(cx, cy);
            if (lData.tiles[key]) {
              const img = await getTileImage(lData.tiles[key]);
              if (img) sCtx.drawImage(img, cx * TILE - envX, cy * TILE - envY);
            }
          }
        }
      }

      // Draw vector strokes
      if (lData.strokes && lData.strokes.length > 0) {
        sCtx.save();
        sCtx.translate(-envX, -envY);
        for (const stroke of lData.strokes) {
          if (stroke.isShape && stroke.shapeData) {
            drawShape(sCtx, stroke.tool, stroke.shapeData.start, stroke.shapeData.end, stroke.settings, stroke.shapeData.shiftKey);
          } else {
            drawStroke(sCtx, stroke.points, stroke.tool, stroke.settings);
          }
        }
        sCtx.restore();
      }

      sCtx.restore();
    }

    const localStartX = Math.round(startWorldX - envX);
    const localStartY = Math.round(startWorldY - envY);

    if (localStartX < 0 || localStartX >= envW || localStartY < 0 || localStartY >= envH) {
      return null;
    }

    const imgData = sCtx.getImageData(0, 0, envW, envH);
    const data = imgData.data;
    const totalPixels = envW * envH;

    // 2. Identify obstacle pixels (lines with dark color or noticeable alpha)
    const obstacleMap = new Uint8Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      const p = i * 4;
      const alpha = data[p + 3];
      const brightness = (data[p] + data[p + 1] + data[p + 2]) / 3;
      // Mark as lineart obstacle if opaque and relatively dark
      if (alpha > 40 && brightness < (255 - sensitivity * 1.8)) {
        obstacleMap[i] = 1;
      }
    }

    // 3. Morphological close on lines (bridges tiny 2px gaps in sketchy lineart)
    const closedObstacles = this.dilate(obstacleMap, envW, envH, 1.5);

    // 4. Flood fill from touch point to build confinement silhouette
    const regionMask = new Uint8Array(totalPixels);
    const queue = [[localStartX, localStartY]];
    regionMask[localStartY * envW + localStartX] = 1;

    while (queue.length > 0) {
      const [cx, cy] = queue.pop();

      // Scan West
      let wx = cx;
      while (wx > 0) {
        const nx = wx - 1;
        const p = cy * envW + nx;
        if (regionMask[p] === 1 || closedObstacles[p] === 1) break;
        regionMask[p] = 1;
        wx--;
      }

      // Scan East
      let ex = cx;
      while (ex < envW - 1) {
        const nx = ex + 1;
        const p = cy * envW + nx;
        if (regionMask[p] === 1 || closedObstacles[p] === 1) break;
        regionMask[p] = 1;
        ex++;
      }

      // Inspect North and South rows
      for (const ny of [cy - 1, cy + 1]) {
        if (ny < 0 || ny >= envH) continue;
        let inRun = false;
        const rowOffset = ny * envW;
        for (let x = wx; x <= ex; x++) {
          const p = rowOffset + x;
          const open = regionMask[p] === 0 && closedObstacles[p] === 0;
          if (open) {
            if (!inRun) {
              queue.push([x, ny]);
              regionMask[p] = 1;
              inRun = true;
            }
          } else {
            inRun = false;
          }
        }
      }
    }

    // 5. "Stay Behind Line": Inset/erode the mask slightly so highlights don't cover black ink
    const finalMask = lineMargin > 0 ? this.erode(regionMask, envW, envH, Math.round(lineMargin)) : regionMask;

    // 6. Bake into a fast Alpha Mask Canvas
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = envW;
    maskCanvas.height = envH;
    const mCtx = maskCanvas.getContext('2d');
    const mImgData = mCtx.createImageData(envW, envH);
    const mData = mImgData.data;

    for (let i = 0; i < totalPixels; i++) {
      if (finalMask[i] === 1) {
        const p = i * 4;
        mData[p + 3] = 255; // White opaque mask
      }
    }
    mCtx.putImageData(mImgData, 0, 0);

    return {
      maskCanvas,
      envX,
      envY,
      envW,
      envH,
    };
  }

  static dilate(mask, w, h, radius) {
    const out = new Uint8Array(w * h);
    const r = Math.ceil(radius);
    for (let y = 0; y < h; y++) {
      const yOffset = y * w;
      for (let x = 0; x < w; x++) {
        if (mask[yOffset + x] === 1) {
          for (let dy = -r; dy <= r; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= h) continue;
            const nyOffset = ny * w;
            for (let dx = -r; dx <= r; dx++) {
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

  static erode(mask, w, h, radius) {
    const out = new Uint8Array(w * h);
    const r = Math.ceil(radius);
    for (let y = 0; y < h; y++) {
      const yOffset = y * w;
      for (let x = 0; x < w; x++) {
        if (mask[yOffset + x] === 1) {
          let keep = true;
          for (let dy = -r; dy <= r; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= h) { keep = false; break; }
            const nyOffset = ny * w;
            for (let dx = -r; dx <= r; dx++) {
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
