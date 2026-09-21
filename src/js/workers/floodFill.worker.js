// src/js/workers/floodFill.worker.js
/**
 * DEDICATED OFF-THREAD FLOOD FILL WORKER
 * Executes scanline flood fills and morphological operations
 * using zero-copy Transferable ArrayBuffers.
 */

self.onmessage = function (e) {
  const {
    pixelBuffer,
    width,
    height,
    startX,
    startY,
    fillColor,
    tolerance,
    closeGapRadius,
    bleedPixels,
    isArtisticMoat,
    moatWidth
  } = e.data;

  // Zero-copy view of incoming pixel data
  const data = new Uint8ClampedArray(pixelBuffer);
  const totalPixels = width * height;

  const startIdx = (startY * width + startX) * 4;
  const targetR = data[startIdx];
  const targetG = data[startIdx + 1];
  const targetB = data[startIdx + 2];
  const targetA = data[startIdx + 3];

  const tolThreshold = (tolerance ?? 32) * 4;

  const matchesTarget = (p) => {
    return (
      Math.abs(data[p] - targetR) +
      Math.abs(data[p + 1] - targetG) +
      Math.abs(data[p + 2] - targetB) +
      Math.abs(data[p + 3] - targetA) <= tolThreshold
    );
  };

  // 1. Build obstacle boundaries
  let obstacleMap = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    if (!matchesTarget(i * 4)) {
      obstacleMap[i] = 1;
    }
  }

  // 2. Morphological Operations
  if (isArtisticMoat) {
    obstacleMap = dilate(obstacleMap, width, height, moatWidth || 4);
  } else if (closeGapRadius > 0) {
    const dilated = dilate(obstacleMap, width, height, closeGapRadius);
    obstacleMap = erode(dilated, width, height, closeGapRadius);
  }

  // 3. Scanline Flood Fill
  const fillMask = new Uint8Array(totalPixels);
  const queue = [[startX, startY]];
  fillMask[startY * width + startX] = 1;

  while (queue.length > 0) {
    const [cx, cy] = queue.pop();

    let wx = cx;
    while (wx > 0) {
      const nx = wx - 1;
      const p = cy * width + nx;
      if (fillMask[p] !== 0 || obstacleMap[p] === 1) break;
      fillMask[p] = 1;
      wx--;
    }

    let ex = cx;
    while (ex < width - 1) {
      const nx = ex + 1;
      const p = cy * width + nx;
      if (fillMask[p] !== 0 || obstacleMap[p] === 1) break;
      fillMask[p] = 1;
      ex++;
    }

    for (const ny of [cy - 1, cy + 1]) {
      if (ny < 0 || ny >= height) continue;
      let inRun = false;
      const rowOffset = ny * width;
      for (let x = wx; x <= ex; x++) {
        const p = rowOffset + x;
        const open = fillMask[p] === 0 && obstacleMap[p] === 0;
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

  // 4. Bleed / Dilation
  let finalMask = fillMask;
  if (!isArtisticMoat && bleedPixels > 0) {
    finalMask = dilate(fillMask, width, height, bleedPixels);
  }

  // Transfer the completed mask buffer back via Transferable Objects
  self.postMessage(
    {
      maskBuffer: finalMask.buffer,
      width,
      height
    },
    [finalMask.buffer]
  );
};

function dilate(mask, w, h, radius) {
  const out = new Uint8Array(w * h);
  const r = Math.ceil(radius);
  for (let y = 0; y < h; y++) {
    const yOff = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[yOff + x] === 1) {
        for (let dy = -r; dy <= r; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          const nyOff = ny * w;
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx;
            if (nx >= 0 && nx < w && dx * dx + dy * dy <= r * r) {
              out[nyOff + nx] = 1;
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
  const r = Math.ceil(radius);
  for (let y = 0; y < h; y++) {
    const yOff = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[yOff + x] === 1) {
        let keep = true;
        for (let dy = -r; dy <= r; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) { keep = false; break; }
          const nyOff = ny * w;
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w || dx * dx + dy * dy > r * r) continue;
            if (mask[nyOff + nx] === 0) {
              keep = false;
              break;
            }
          }
          if (!keep) break;
        }
        if (keep) out[yOff + x] = 1;
      }
    }
  }
  return out;
}
