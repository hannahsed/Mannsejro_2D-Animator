// Exports render exactly what the CAMERA sees, composited from infinite tiles.
import JSZip from 'jszip';
import { drawTilesInWorldRect, cameraWorldAABB } from './infiniteCanvas.js';

export function sanitizeFilename(name) {
  return (name || 'project').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

// Composite one frame's camera view into destCtx at destW×destH with clipping mask support
export async function renderCameraView(project, frame, destCtx, destW, destH) {
  const cam = project.camera || { x: project.width / 2, y: project.height / 2, rotation: 0, scale: 1 };
  const sx = destW / project.width;
  const sy = destH / project.height;
  destCtx.save();
  destCtx.scale(sx, sy);
  destCtx.fillStyle = project.backgroundColor || '#ffffff';
  destCtx.fillRect(0, 0, project.width, project.height);
  destCtx.translate(project.width / 2, project.height / 2);
  destCtx.rotate(-(cam.rotation || 0));
  const s = 1 / (cam.scale || 1);
  destCtx.scale(s, s);
  destCtx.translate(-cam.x, -cam.y);
  const aabb = cameraWorldAABB(cam, project.width, project.height);

  const layers = project.layers;
  let i = 0;
  while (i < layers.length) {
    const baseLayer = layers[i];
    if (!baseLayer.visible) {
      i++;
      continue;
    }

    const clippedGroup = [];
    let j = i + 1;
    while (j < layers.length && layers[j].clippingMask) {
      if (layers[j].visible) clippedGroup.push(layers[j]);
      j++;
    }

    if (clippedGroup.length === 0) {
      destCtx.save();
      destCtx.globalAlpha = baseLayer.opacity !== undefined ? baseLayer.opacity : 1;
      destCtx.globalCompositeOperation = baseLayer.blendMode || 'source-over';
      await drawTilesInWorldRect(destCtx, frame.layerData[baseLayer.id]?.tiles, aabb);
      destCtx.restore();
    } else {
      // Offscreen canvas for base + clipped chain
      const buf = document.createElement('canvas');
      buf.width = destCtx.canvas.width;
      buf.height = destCtx.canvas.height;
      const bctx = buf.getContext('2d');
      bctx.setTransform(destCtx.getTransform());

      bctx.save();
      bctx.globalAlpha = 1;
      bctx.globalCompositeOperation = 'source-over';
      await drawTilesInWorldRect(bctx, frame.layerData[baseLayer.id]?.tiles, aabb);
      bctx.restore();

      for (const child of clippedGroup) {
        bctx.save();
        bctx.globalCompositeOperation = 'source-atop';
        bctx.globalAlpha = child.opacity !== undefined ? child.opacity : 1;
        await drawTilesInWorldRect(bctx, frame.layerData[child.id]?.tiles, aabb);
        bctx.restore();
      }

      destCtx.save();
      destCtx.setTransform(1, 0, 0, 1, 0, 0);
      destCtx.globalAlpha = baseLayer.opacity !== undefined ? baseLayer.opacity : 1;
      destCtx.globalCompositeOperation = baseLayer.blendMode || 'source-over';
      destCtx.drawImage(buf, 0, 0);
      destCtx.restore();
    }

    i = j;
  }

  destCtx.restore();
}

export async function exportCurrentFrameAsPng(project, frame, filename = 'frame.png') {
  const canvas = document.createElement('canvas');
  canvas.width = project.width;
  canvas.height = project.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  await renderCameraView(project, frame, ctx, project.width, project.height);
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export async function exportSpritesheet(project, cols = 4) {
  const totalFrames = project.frames.length;
  const rows = Math.ceil(totalFrames / cols);
  const canvas = document.createElement('canvas');
  canvas.width = project.width * cols;
  canvas.height = project.height * rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cell = document.createElement('canvas');
  cell.width = project.width;
  cell.height = project.height;
  const cellCtx = cell.getContext('2d');
  for (let i = 0; i < totalFrames; i++) {
    await renderCameraView(project, project.frames[i], cellCtx, project.width, project.height);
    ctx.drawImage(cell, (i % cols) * project.width, Math.floor(i / cols) * project.height);
  }
  const link = document.createElement('a');
  link.download = `${project.name.toLowerCase().replace(/\s+/g, '_')}_spritesheet.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export async function exportPngSequenceZip(project, onProgress) {
  const zip = new JSZip();
  const folder = zip.folder('frames');
  const canvas = document.createElement('canvas');
  canvas.width = project.width;
  canvas.height = project.height;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < project.frames.length; i++) {
    if (ctx) {
      await renderCameraView(project, project.frames[i], ctx, project.width, project.height);
      const b64 = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
      folder?.file(`frame_${String(i + 1).padStart(4, '0')}.png`, b64, { base64: true });
    }
    if (onProgress) onProgress(Math.round(((i + 1) / project.frames.length) * 50));
  }
  const content = await zip.generateAsync({ type: 'blob' }, (m) => {
    if (onProgress) onProgress(50 + Math.round(m.percent / 2));
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(content);
  link.download = `${project.name.toLowerCase().replace(/\s+/g, '_')}_sequence.zip`;
  link.click();
}

export async function exportVideo(project, onProgress) {
  const canvas = document.createElement('canvas');
  canvas.width = project.width;
  canvas.height = project.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const stream = canvas.captureStream(project.fps);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  const done = new Promise((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${project.name.toLowerCase().replace(/\s+/g, '_')}.webm`;
      link.click();
      resolve();
    };
  });
  recorder.start();
  const totalLoops = 2;
  const totalSteps = project.frames.length * totalLoops;
  let step = 0;
  for (let loop = 0; loop < totalLoops; loop++) {
    for (let i = 0; i < project.frames.length; i++) {
      await renderCameraView(project, project.frames[i], ctx, project.width, project.height);
      step++;
      if (onProgress) onProgress(Math.round((step / totalSteps) * 100));
      await new Promise((res) => setTimeout(res, 1000 / project.fps));
    }
  }
  recorder.stop();
  await done;
}

export async function exportAnimatedGif(project, onProgress) {
  await exportVideo(project, onProgress);
}
