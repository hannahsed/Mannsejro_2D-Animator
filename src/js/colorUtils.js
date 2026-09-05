// Color utilities & flood fill algorithm in pure JavaScript

export function hexToRgba(hex, alpha = 1) {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((char) => char + char).join('');
  }
  const num = parseInt(c, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function hexToRgb(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((char) => char + char).join('');
  }
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbaToHex(r, g, b) {
  return (
    '#' +
    [r, g, b]
      .map((x) => {
        const hex = Math.round(x).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      })
      .join('')
  );
}

// Canvas Flood Fill
export function floodFill(ctx, startX, startY, fillColorHex, tolerance = 32) {
  startX = Math.round(startX);
  startY = Math.round(startY);
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;

  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const startPos = (startY * width + startX) * 4;
  const targetR = data[startPos];
  const targetG = data[startPos + 1];
  const targetB = data[startPos + 2];
  const targetA = data[startPos + 3];

  const fillRgb = hexToRgb(fillColorHex);
  const fillR = fillRgb.r;
  const fillG = fillRgb.g;
  const fillB = fillRgb.b;
  const fillA = 255;

  // If clicking on the exact same color, nothing to do
  if (
    Math.abs(targetR - fillR) < 2 &&
    Math.abs(targetG - fillG) < 2 &&
    Math.abs(targetB - fillB) < 2 &&
    Math.abs(targetA - fillA) < 2
  ) {
    return;
  }

  function colorMatch(pos) {
    const r = data[pos];
    const g = data[pos + 1];
    const b = data[pos + 2];
    const a = data[pos + 3];

    const diff =
      Math.abs(r - targetR) +
      Math.abs(g - targetG) +
      Math.abs(b - targetB) +
      Math.abs(a - targetA);

    return diff <= tolerance * 4;
  }

  const pixelStack = [[startX, startY]];
  const visited = new Uint8Array(width * height);

  while (pixelStack.length > 0) {
    const newPos = pixelStack.pop();
    if (!newPos) continue;
    let x = newPos[0];
    let y = newPos[1];

    let pixelPos = (y * width + x) * 4;

    while (y >= 0 && colorMatch(pixelPos)) {
      y--;
      pixelPos -= width * 4;
    }

    pixelPos += width * 4;
    y++;

    let reachLeft = false;
    let reachRight = false;

    while (y < height && colorMatch(pixelPos)) {
      const idx = y * width + x;
      if (visited[idx]) {
        y++;
        pixelPos += width * 4;
        continue;
      }

      visited[idx] = 1;
      data[pixelPos] = fillR;
      data[pixelPos + 1] = fillG;
      data[pixelPos + 2] = fillB;
      data[pixelPos + 3] = fillA;

      if (x > 0) {
        if (colorMatch(pixelPos - 4)) {
          if (!reachLeft) {
            pixelStack.push([x - 1, y]);
            reachLeft = true;
          }
        } else if (reachLeft) {
          reachLeft = false;
        }
      }

      if (x < width - 1) {
        if (colorMatch(pixelPos + 4)) {
          if (!reachRight) {
            pixelStack.push([x + 1, y]);
            reachRight = true;
          }
        } else if (reachRight) {
          reachRight = false;
        }
      }

      y++;
      pixelPos += width * 4;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}
