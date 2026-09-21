// src/js/export/ffmpegExporter.js
/**
 * PRODUCTION FFMPEG EXPORT ENGINE
 * Frame-exact rendering with two-pass palette optimization and audio muxing.
 */

import { renderCameraView, exportVideo, exportAnimatedGif } from '../exportEngine.js';
import { audioEngine } from '../audio/audioEngine.js';
import { showToast } from '../ui/toast.js';

let ffmpegInstance = null;

/**
 * Lazy-loads the FFmpeg WebAssembly core only when the user requests an export.
 */
async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;

  showToast('Initializing FFmpeg Engine…');

  try {
    // Attempt dynamic import of @ffmpeg/ffmpeg
    const ffmpegModule = await import('https://unpkg.com/@ffmpeg/ffmpeg@0.12.7/dist/esm/index.js').catch(() => null);
    
    if (ffmpegModule && ffmpegModule.createFFmpeg) {
      ffmpegInstance = ffmpegModule.createFFmpeg({
        log: false,
        corePath: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js'
      });
      await ffmpegInstance.load();
      return ffmpegInstance;
    } else if (ffmpegModule && ffmpegModule.FFmpeg) {
      // @ffmpeg/ffmpeg v0.12+ modern class-based API
      const ffmpeg = new ffmpegModule.FFmpeg();
      await ffmpeg.load({
        coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
        wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm'
      });
      // Adapter wrapper to uniform FS and run methods
      ffmpegInstance = {
        FS: (op, ...args) => {
          if (op === 'writeFile') return ffmpeg.writeFile(args[0], args[1]);
          if (op === 'readFile') return ffmpeg.readFile(args[0]);
          if (op === 'unlink') return ffmpeg.deleteFile(args[0]);
        },
        run: async (...args) => {
          return await ffmpeg.exec(args);
        }
      };
      return ffmpegInstance;
    }
  } catch (err) {
    console.warn('FFmpeg Wasm CDN initialization notice:', err);
  }

  return null;
}

/**
 * Exports frame-exact H.264 MP4 with synchronized audio track.
 */
export async function exportProductionMP4(project, onProgress) {
  const fps = project.fps || 24;
  const totalFrames = project.frames.length;

  let ffmpeg = null;
  try {
    ffmpeg = await getFFmpeg();
  } catch (e) {
    console.warn('WASM FFmpeg not available, falling back to WebM/MP4 encoder', e);
  }

  if (!ffmpeg) {
    showToast('FFmpeg Wasm initializing fallback: Rendering High-Definition Video…');
    await exportVideo(project, onProgress);
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = project.width;
  canvas.height = project.height;
  const ctx = canvas.getContext('2d');

  // 1. Render all frames to discrete JPEG buffers
  for (let i = 0; i < totalFrames; i++) {
    await renderCameraView(project, project.frames[i], ctx, project.width, project.height);

    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.95));
    const arrayBuffer = await blob.arrayBuffer();
    const fileName = `frame_${String(i).padStart(5, '0')}.jpg`;

    await ffmpeg.FS('writeFile', fileName, new Uint8Array(arrayBuffer));

    if (onProgress) {
      onProgress(Math.round(((i + 1) / totalFrames) * 60)); // First 60% is frame rendering
    }
  }

  // 2. Export Audio Buffer to WAV if track is loaded
  let hasAudio = false;
  if (audioEngine.audioBuffer) {
    const wavBytes = audioBufferToWav(audioEngine.audioBuffer);
    await ffmpeg.FS('writeFile', 'audio.wav', wavBytes);
    hasAudio = true;
  }

  // 3. Run FFmpeg H.264 Encoder
  const outputName = 'output.mp4';
  const args = [
    '-r', String(fps),
    '-i', 'frame_%05d.jpg'
  ];

  if (hasAudio) {
    args.push('-i', 'audio.wav', '-c:a', 'aac', '-b:a', '192k', '-shortest');
  }

  args.push(
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    '-crf', '18', // High visual quality
    outputName
  );

  try {
    await ffmpeg.run(...args);
    if (onProgress) onProgress(95);

    const data = await ffmpeg.FS('readFile', outputName);
    downloadBlob(new Blob([data.buffer || data], { type: 'video/mp4' }), `${cleanName(project.name)}.mp4`);

    // Cleanup virtual filesystem
    for (let i = 0; i < totalFrames; i++) {
      try { await ffmpeg.FS('unlink', `frame_${String(i).padStart(5, '0')}.jpg`); } catch (e) {}
    }
    if (hasAudio) {
      try { await ffmpeg.FS('unlink', 'audio.wav'); } catch (e) {}
    }
    try { await ffmpeg.FS('unlink', outputName); } catch (e) {}

    if (onProgress) onProgress(100);
    showToast('Export Complete: MP4 (H.264)');
  } catch (encErr) {
    console.warn('FFmpeg run error, fallback to client-side video encoder', encErr);
    await exportVideo(project, onProgress);
  }
}

/**
 * Two-Pass Palette-Optimized Animated GIF
 * Eliminates color banding and dithering noise.
 */
export async function exportProductionGIF(project, onProgress) {
  let ffmpeg = null;
  try {
    ffmpeg = await getFFmpeg();
  } catch (e) {
    console.warn('WASM FFmpeg not available for GIF, falling back to standard GIF encoder', e);
  }

  if (!ffmpeg) {
    showToast('Rendering High-Quality Animated GIF…');
    await exportAnimatedGif(project, onProgress);
    return;
  }

  const fps = Math.min(project.fps || 24, 30); // Cap GIF fps to 30 for performance
  const totalFrames = project.frames.length;

  const canvas = document.createElement('canvas');
  canvas.width = project.width;
  canvas.height = project.height;
  const ctx = canvas.getContext('2d');

  for (let i = 0; i < totalFrames; i++) {
    await renderCameraView(project, project.frames[i], ctx, project.width, project.height);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    const arrayBuffer = await blob.arrayBuffer();
    await ffmpeg.FS('writeFile', `f_${String(i).padStart(5, '0')}.png`, new Uint8Array(arrayBuffer));

    if (onProgress) onProgress(Math.round(((i + 1) / totalFrames) * 50));
  }

  try {
    // Two-Pass Palettegen: creates a custom 256-color palette optimized for the scene
    await ffmpeg.run(
      '-r', String(fps),
      '-i', 'f_%05d.png',
      '-vf', `fps=${fps},scale=${project.width}:-1:flags=lanczos,palettegen=stats_mode=diff`,
      'palette.png'
    );

    await ffmpeg.run(
      '-r', String(fps),
      '-i', 'f_%05d.png',
      '-i', 'palette.png',
      '-lavfi', `fps=${fps} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
      'output.gif'
    );

    const data = await ffmpeg.FS('readFile', 'output.gif');
    downloadBlob(new Blob([data.buffer || data], { type: 'image/gif' }), `${cleanName(project.name)}.gif`);

    // Cleanup
    for (let i = 0; i < totalFrames; i++) {
      try { await ffmpeg.FS('unlink', `f_${String(i).padStart(5, '0')}.png`); } catch (e) {}
    }
    try { await ffmpeg.FS('unlink', 'palette.png'); } catch (e) {}
    try { await ffmpeg.FS('unlink', 'output.gif'); } catch (e) {}

    if (onProgress) onProgress(100);
    showToast('Export Complete: High-Quality GIF');
  } catch (gifErr) {
    console.warn('FFmpeg GIF error, using built-in GIF encoder', gifErr);
    await exportAnimatedGif(project, onProgress);
  }
}

/**
 * Printable Storyboard Contact Sheet (Grid with timecodes and frame numbers)
 */
export async function exportStoryboardSheet(project) {
  const cols = 4;
  const rows = Math.ceil(project.frames.length / cols);
  const cellW = 320;
  const cellH = 180;
  const pad = 24;
  const footerH = 36;

  const totalW = cols * cellW + (cols + 1) * pad;
  const totalH = rows * (cellH + footerH) + (rows + 1) * pad + 60; // Extra for header

  const canvas = document.createElement('canvas');
  canvas.width = totalW;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, totalW, totalH);

  // Header Title
  ctx.fillStyle = '#f4f4f5';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`STORYBOARD SHEET: ${project.name}`, pad, 42);

  ctx.fillStyle = '#a1a1aa';
  ctx.font = '14px monospace';
  ctx.fillText(`${project.frames.length} Frames | ${project.fps} FPS | ${project.width}x${project.height}px`, totalW - 400, 42);

  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = project.width;
  frameCanvas.height = project.height;
  const fCtx = frameCanvas.getContext('2d');

  for (let i = 0; i < project.frames.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const x = pad + col * (cellW + pad);
    const y = 70 + row * (cellH + footerH + pad);

    await renderCameraView(project, project.frames[i], fCtx, project.width, project.height);

    // Frame thumbnail
    ctx.drawImage(frameCanvas, x, y, cellW, cellH);

    // Frame border
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, cellW, cellH);

    // Footer label
    ctx.fillStyle = '#18181b';
    ctx.fillRect(x, y + cellH, cellW, footerH);

    ctx.fillStyle = '#f97316';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`F#${i + 1}`, x + 8, y + cellH + 22);

    const timecode = (i / (project.fps || 24)).toFixed(2);
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '11px monospace';
    ctx.fillText(`${timecode}s`, x + 54, y + cellH + 22);
  }

  downloadBlob(await new Promise((res) => canvas.toBlob(res, 'image/png')), `${cleanName(project.name)}_storyboard.png`);
  showToast('Exported Storyboard Sheet');
}

// Helpers
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function cleanName(n) {
  return (n || 'project').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const data = buffer.getChannelData(0);
  const dataSize = data.length * bytesPerSample;
  const wav = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wav);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(wav);
}
