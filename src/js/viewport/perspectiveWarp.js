// src/js/viewport/perspectiveWarp.js

/**
 * Renders an image distorted across 4 arbitrary corner points (TL, TR, BR, BL) in world space.
 * Uses adaptive triangular mesh subdivision for smooth perspective texture mapping.
 */
export function drawPerspectiveImage(ctx, img, corners, subdivisions = 10) {
  if (!img || !corners || corners.length !== 4) return;

  const [p00, p10, p11, p01] = corners; // TL, TR, BR, BL
  const imgW = img.naturalWidth || img.videoWidth || img.width;
  const imgH = img.naturalHeight || img.videoHeight || img.height;
  if (!imgW || !imgH) return;

  // Bilinear interpolation for destination coordinate (u, v) in [0, 1]
  const getDestPoint = (u, v) => {
    const x = (1 - u) * (1 - v) * p00.x + u * (1 - v) * p10.x + u * v * p11.x + (1 - u) * v * p01.x;
    const y = (1 - u) * (1 - v) * p00.y + u * (1 - v) * p10.y + u * v * p11.y + (1 - u) * v * p01.y;
    return { x, y };
  };

  const step = 1 / subdivisions;

  for (let i = 0; i < subdivisions; i++) {
    const u0 = i * step;
    const u1 = (i + 1) * step;
    const su0 = u0 * imgW;
    const su1 = u1 * imgW;

    for (let j = 0; j < subdivisions; j++) {
      const v0 = j * step;
      const v1 = (j + 1) * step;
      const sv0 = v0 * imgH;
      const sv1 = v1 * imgH;

      const d00 = getDestPoint(u0, v0);
      const d10 = getDestPoint(u1, v0);
      const d11 = getDestPoint(u1, v1);
      const d01 = getDestPoint(u0, v1);

      // Render upper-left triangle (d00, d10, d01)
      renderTriangleSlice(ctx, img, d00, d10, d01, su0, sv0, su1, sv0, su0, sv1);

      // Render lower-right triangle (d10, d11, d01)
      renderTriangleSlice(ctx, img, d10, d11, d01, su1, sv0, su1, sv1, su0, sv1);
    }
  }
}

function renderTriangleSlice(ctx, img, d0, d1, d2, s0x, s0y, s1x, s1y, s2x, s2y) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();

  // Compute 2D affine transform matrix from source triangle to destination triangle
  const denom = (s0x * (s1y - s2y) - s1x * (s0y - s2y) + s2x * (s0y - s1y));
  if (Math.abs(denom) < 0.0001) {
    ctx.restore();
    return;
  }

  const m11 = - (s0y * (d1.x - d2.x) - s1y * (d0.x - d2.x) + s2y * (d0.x - d1.x)) / denom;
  const m12 = (s0y * (d1.y - d2.y) - s1y * (d0.y - d2.y) + s2y * (d0.y - d1.y)) / denom;
  const m21 = (s0x * (d1.x - d2.x) - s1x * (d0.x - d2.x) + s2x * (d0.x - d1.x)) / denom;
  const m22 = - (s0x * (d1.y - d2.y) - s1x * (d0.y - d2.y) + s2x * (d0.y - d1.y)) / denom;
  const dx = (s0x * (s1y * d2.x - s2y * d1.x) - s0y * (s1x * d2.x - s2x * d1.x) + (s1x * s2y - s2x * s1y) * d0.x) / denom;
  const dy = (s0x * (s1y * d2.y - s2y * d1.y) - s0y * (s1x * d2.y - s2x * d1.y) + (s1x * s2y - s2x * s1y) * d0.y) / denom;

  ctx.transform(m11, m12, m21, m22, dx, dy);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}
