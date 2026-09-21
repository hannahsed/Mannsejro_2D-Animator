// Starter templates now emit tile-based (infinite) projects.
import { tilesFromCanvas, copyTiles } from './infiniteCanvas.js';

export async function createBouncingBallProject() {
  const width = 800, height = 600, fps = 12;

  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = width;
  bgCanvas.height = height;
  const bgCtx = bgCanvas.getContext('2d');
  if (bgCtx) {
    bgCtx.strokeStyle = '#94a3b8';
    bgCtx.lineWidth = 4;
    bgCtx.beginPath();
    bgCtx.moveTo(80, 480);
    bgCtx.lineTo(720, 480);
    bgCtx.stroke();
    bgCtx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    bgCtx.setLineDash([4, 4]);
    bgCtx.beginPath();
    bgCtx.moveTo(80, 160);
    bgCtx.lineTo(720, 160);
    bgCtx.stroke();
    bgCtx.setLineDash([]);
  }
  const bgTiles = await tilesFromCanvas(bgCanvas, 0, 0);

  const ballKeyframes = [
    { x: 140, y: 160, rx: 32, ry: 32, rot: 0, tag: 'Key (Apex)' },
    { x: 180, y: 220, rx: 30, ry: 34, rot: 15, tag: 'Inbetween' },
    { x: 230, y: 310, rx: 26, ry: 40, rot: 30, tag: 'Breakdown' },
    { x: 280, y: 440, rx: 22, ry: 46, rot: 40, tag: 'Inbetween' },
    { x: 340, y: 480, rx: 50, ry: 18, rot: 0, tag: 'Key (Squash)' },
    { x: 400, y: 440, rx: 22, ry: 46, rot: -40, tag: 'Breakdown' },
    { x: 450, y: 320, rx: 26, ry: 38, rot: -30, tag: 'Inbetween' },
    { x: 500, y: 230, rx: 30, ry: 34, rot: -15, tag: 'Inbetween' },
    { x: 540, y: 190, rx: 32, ry: 32, rot: 0, tag: 'Key (2nd Apex)' },
    { x: 580, y: 250, rx: 28, ry: 36, rot: 25, tag: 'Inbetween' },
    { x: 630, y: 400, rx: 24, ry: 44, rot: 35, tag: 'Breakdown' },
    { x: 670, y: 480, rx: 46, ry: 20, rot: 0, tag: 'Key (Rest)' },
  ];

  const frames = [];
  for (let index = 0; index < ballKeyframes.length; index++) {
    const kf = ballKeyframes[index];
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = width;
    frameCanvas.height = height;
    const ctx = frameCanvas.getContext('2d');
    if (ctx) {
      const shadowDist = 480 - kf.y;
      const shadowAlpha = Math.max(0.15, 0.6 - shadowDist / 500);
      const shadowScale = Math.max(0.4, 1 - shadowDist / 600);
      ctx.save();
      ctx.fillStyle = `rgba(30, 41, 59, ${shadowAlpha})`;
      ctx.beginPath();
      ctx.ellipse(kf.x, 480, kf.rx * shadowScale * 1.1, 8 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(kf.x, kf.y);
      ctx.rotate((kf.rot * Math.PI) / 180);
      const grad = ctx.createRadialGradient(-kf.rx * 0.3, -kf.ry * 0.3, 4, 0, 0, Math.max(kf.rx, kf.ry) * 1.1);
      grad.addColorStop(0, '#60a5fa');
      grad.addColorStop(0.7, '#2563eb');
      grad.addColorStop(1, '#1d4ed8');
      ctx.fillStyle = grad;
      ctx.strokeStyle = '#1e3a8a';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, kf.rx, kf.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.ellipse(-kf.rx * 0.35, -kf.ry * 0.35, kf.rx * 0.3, kf.ry * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const ballTiles = await tilesFromCanvas(frameCanvas, 0, 0);
    frames.push({
      id: `frame_${index + 1}`,
      duration: 1,
      tag: kf.tag,
      layerData: {
        layer_bg: { tiles: copyTiles(bgTiles) },
        layer_ball: { tiles: ballTiles },
      },
    });
  }

  return {
    id: `project_bouncing_ball_${Date.now()}`,
    name: 'MannSejro Bouncing Ball Demo',
    width, height, fps,
    backgroundColor: '#ffffff',
    camera: { x: width / 2, y: height / 2, rotation: 0, scale: 1, locked: false },
    layers: [
      { id: 'layer_bg', name: 'Background / Ground', visible: true, locked: true, persistent: true, opacity: 0.8, blendMode: 'source-over', clippingMask: false, alphaLocked: false, colorTag: null },
      { id: 'layer_ball', name: 'Animation / Ball', visible: true, locked: false, persistent: false, opacity: 1, blendMode: 'source-over', clippingMask: false, alphaLocked: false, colorTag: null },
    ],
    frames,
    referenceMedia: [],
  };
}

export function createBlankProject(name = 'HD Widescreen 16:9', width = 1280, height = 720, fps = 24) {
  const layer1Id = `layer_${Date.now()}`;
  return {
    id: `proj_${Date.now()}`,
    name, width, height, fps,
    backgroundColor: '#ffffff',
    camera: { x: width / 2, y: height / 2, rotation: 0, scale: 1, locked: false },
    layers: [
      { id: layer1Id, name: 'Layer 1', visible: true, locked: false, opacity: 1, blendMode: 'source-over', clippingMask: false, alphaLocked: false, colorTag: null },
    ],
    frames: [
      { id: `frame_${Date.now()}`, duration: 1, layerData: { [layer1Id]: { tiles: {} } } },
    ],
    referenceMedia: [],
  };
}
