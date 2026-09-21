// src/js/viewport/nodeDraw.js
import { state, currentFrame } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { worldToScreen, screenToWorld, getVisibleWorldRect } from './camera.js';
import { requestRender } from '../render/renderEngine.js';
import { saveHistoryState } from '../project/history.js';
import { showToast } from '../ui/toast.js';
import { hexToRgba } from '../colorUtils.js';
import { drawPerspectiveImage } from './perspectiveWarp.js';

export const nodeDrawState = {
  active: false,
  // 4 corner nodes in world coordinates: [0: TL, 1: TR, 2: BR, 3: BL]
  nodes: null,
  draggingNodeIdx: -1,
  draggingEdgeIdx: -1,
  isDraggingBody: false,
  dragStartWorld: null,
  dragNodesSnapshot: null,

  // Perspective parameters
  shapeType: 'quad', // 'quad' | 'rounded-rect' | 'grid' | 'ellipse'
  subdivisions: 3, // 1, 2, 3, 4, 6, 8
  showDiagonals: false, // Internal X diagonals off by default for clean rectangle
  showVanishingRays: false,
  cornerRadius: 16, // Corner radius in world units for rounded rectangle in perspective

  // Live styling cache (synced with toolSettings)
  color: '#f97316',
  strokeColor: '#f97316',
  secondaryColor: '#ffffff',
  fillColor: '#ffffff',
  size: 3,
  strokeWidth: 3,
  opacity: 1,
  shapeMode: 'both', // 'stroke' | 'fill' | 'both'
  strokeDash: 'solid', // 'solid' | 'dashed' | 'dotted'
  isFilled: true,
  hasStroke: true,

  // Image texture mapping support
  textureImage: null, // Holds HTMLImageElement / Video for perspective image fill
  textureName: null,
  textureRefId: null,
};

/**
 * Bilinear interpolation on the 4-corner quad.
 * u in [0, 1] (horizontal), v in [0, 1] (vertical).
 */
export function getBilinearPoint(u, v, nodes) {
  if (!nodes || nodes.length < 4) return { x: 0, y: 0 };
  const [p00, p10, p11, p01] = nodes; // TL, TR, BR, BL
  const x = (1 - u) * (1 - v) * p00.x + u * (1 - v) * p10.x + u * v * p11.x + (1 - u) * v * p01.x;
  const y = (1 - u) * (1 - v) * p00.y + u * (1 - v) * p10.y + u * v * p11.y + (1 - u) * v * p01.y;
  return { x, y };
}

/**
 * Generates an array of 2D world points forming a true perspective-foreshortened
 * rounded rectangle mapped to the 4-node quadrilateral.
 */
export function getPerspectiveRoundedRectPoints(nodes, cornerRadius = 16, arcSteps = 14) {
  if (!nodes || nodes.length < 4) return [];

  const [p00, p10, p11, p01] = nodes; // TL, TR, BR, BL
  const topW = Math.hypot(p10.x - p00.x, p10.y - p00.y);
  const botW = Math.hypot(p11.x - p01.x, p11.y - p01.y);
  const leftH = Math.hypot(p01.x - p00.x, p01.y - p00.y);
  const rightH = Math.hypot(p11.x - p10.x, p11.y - p10.y);
  const avgW = Math.max(1, (topW + botW) / 2);
  const avgH = Math.max(1, (leftH + rightH) / 2);

  const rad = Math.max(2, cornerRadius);
  const rx = Math.min(0.48, Math.max(0.01, rad / avgW));
  const ry = Math.min(0.48, Math.max(0.01, rad / avgH));

  const points = [];

  // 1. Top Edge: (rx, 0) -> (1 - rx, 0)
  points.push(getBilinearPoint(rx, 0, nodes));
  points.push(getBilinearPoint(1 - rx, 0, nodes));

  // 2. Top-Right Corner: -PI/2 -> 0
  for (let i = 1; i <= arcSteps; i++) {
    const th = -Math.PI / 2 + (Math.PI / 2) * (i / arcSteps);
    const u = 1 - rx + rx * Math.cos(th);
    const v = ry + ry * Math.sin(th);
    points.push(getBilinearPoint(u, v, nodes));
  }

  // 3. Right Edge: (1, ry) -> (1, 1 - ry)
  points.push(getBilinearPoint(1, 1 - ry, nodes));

  // 4. Bottom-Right Corner: 0 -> PI/2
  for (let i = 1; i <= arcSteps; i++) {
    const th = (Math.PI / 2) * (i / arcSteps);
    const u = 1 - rx + rx * Math.cos(th);
    const v = 1 - ry + ry * Math.sin(th);
    points.push(getBilinearPoint(u, v, nodes));
  }

  // 5. Bottom Edge: (1 - rx, 1) -> (rx, 1)
  points.push(getBilinearPoint(rx, 1, nodes));

  // 6. Bottom-Left Corner: PI/2 -> PI
  for (let i = 1; i <= arcSteps; i++) {
    const th = Math.PI / 2 + (Math.PI / 2) * (i / arcSteps);
    const u = rx + rx * Math.cos(th);
    const v = 1 - ry + ry * Math.sin(th);
    points.push(getBilinearPoint(u, v, nodes));
  }

  // 7. Left Edge: (0, 1 - ry) -> (0, ry)
  points.push(getBilinearPoint(0, ry, nodes));

  // 8. Top-Left Corner: PI -> 3*PI/2
  for (let i = 1; i <= arcSteps; i++) {
    const th = Math.PI + (Math.PI / 2) * (i / arcSteps);
    const u = rx + rx * Math.cos(th);
    const v = ry + ry * Math.sin(th);
    points.push(getBilinearPoint(u, v, nodes));
  }

  return points;
}

/**
 * Computes the true projective perspective center using the intersection of the two diagonals.
 */
export function getQuadCenter(nodes) {
  if (!nodes || nodes.length < 4) return { x: 0, y: 0 };
  const [p0, p1, p2, p3] = nodes; // TL, TR, BR, BL
  const d1x = p2.x - p0.x;
  const d1y = p2.y - p0.y;
  const d2x = p3.x - p1.x;
  const d2y = p3.y - p1.y;
  const denom = d1x * d2y - d1y * d2x;

  if (Math.abs(denom) > 1e-5) {
    const t = ((p1.x - p0.x) * d2y - (p1.y - p0.y) * d2x) / denom;
    if (t >= 0 && t <= 1) {
      return { x: p0.x + t * d1x, y: p0.y + t * d1y };
    }
  }

  // Fallback to geometric centroid
  return {
    x: (p0.x + p1.x + p2.x + p3.x) / 4,
    y: (p0.y + p1.y + p2.y + p3.y) / 4,
  };
}

/**
 * Computes the 4 edge midpoints: [0: Top, 1: Right, 2: Bottom, 3: Left]
 */
export function getQuadEdgeMidpoints(nodes) {
  if (!nodes || nodes.length < 4) return [];
  return [
    { x: (nodes[0].x + nodes[1].x) / 2, y: (nodes[0].y + nodes[1].y) / 2 }, // Top
    { x: (nodes[1].x + nodes[2].x) / 2, y: (nodes[1].y + nodes[2].y) / 2 }, // Right
    { x: (nodes[2].x + nodes[3].x) / 2, y: (nodes[2].y + nodes[3].y) / 2 }, // Bottom
    { x: (nodes[3].x + nodes[0].x) / 2, y: (nodes[3].y + nodes[0].y) / 2 }, // Left
  ];
}

/**
 * Checks whether a world coordinate (wx, wy) falls inside the 4-corner quad.
 */
export function isPointInQuad(wx, wy, nodes) {
  if (!nodes || nodes.length < 4) return false;
  let inside = false;
  for (let i = 0, j = nodes.length - 1; i < nodes.length; j = i++) {
    const xi = nodes[i].x, yi = nodes[i].y;
    const xj = nodes[j].x, yj = nodes[j].y;
    const intersect = ((yi > wy) !== (yj > wy)) && (wx < ((xj - xi) * (wy - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Finds the vanishing point intersection of two lines: (p0 -> p1) and (p3 -> p2).
 */
export function getVanishingPoint(p0, p1, p3, p2) {
  const d1x = p1.x - p0.x;
  const d1y = p1.y - p0.y;
  const d2x = p2.x - p3.x;
  const d2y = p2.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-5) return null; // Lines are parallel

  const t = ((p3.x - p0.x) * d2y - (p3.y - p0.y) * d2x) / denom;
  return { x: p0.x + t * d1x, y: p0.y + t * d1y };
}

/**
 * Syncs the active nodeDraw styling parameters from global state.toolSettings.
 */
export function syncNodeDrawWithToolSettings() {
  if (!nodeDrawState.active) return;
  const ts = state.toolSettings;
  nodeDrawState.color = ts.color || '#f97316';
  nodeDrawState.secondaryColor = ts.secondaryColor || '#ffffff';
  nodeDrawState.size = ts.size || 3;
  nodeDrawState.opacity = ts.opacity !== undefined ? ts.opacity : 1;
  nodeDrawState.shapeMode = ts.shapeMode || 'both';
  nodeDrawState.strokeDash = ts.strokeDash || 'solid';
  nodeDrawState.cornerRadius = ts.cornerRadius || 16;

  if (nodeDrawState.shapeMode === 'both') {
    nodeDrawState.fillColor = ts.secondaryColor || '#ffffff';
  } else if (nodeDrawState.shapeMode === 'fill') {
    nodeDrawState.fillColor = ts.color || '#f97316';
  } else {
    nodeDrawState.fillColor = 'transparent';
  }

  requestRender();
}

/**
 * Initializes a 4-node perspective quad pre-filled with an imported image
 */
export function startNodeQuadWithImage(refItem) {
  const domEl = document.querySelector(`[data-ref-id="${refItem.id}"]`);
  const mediaEl = domEl?.querySelector('img, video');
  if (!mediaEl) {
    showToast('Image element not found on canvas');
    return;
  }

  const w = refItem.width * (refItem.scale || 1);
  const h = refItem.height * (refItem.scale || 1);

  nodeDrawState.active = true;
  nodeDrawState.textureImage = mediaEl;
  nodeDrawState.textureName = refItem.name;
  nodeDrawState.textureRefId = refItem.id;
  nodeDrawState.isFilled = true;
  nodeDrawState.hasStroke = true;
  nodeDrawState.color = '#f97316';
  nodeDrawState.strokeColor = '#f97316';
  nodeDrawState.size = 2;
  nodeDrawState.strokeWidth = 2;

  // Use the image's corners if already warped, or place in center view
  if (refItem.corners && refItem.corners.length === 4) {
    nodeDrawState.nodes = refItem.corners.map((p) => ({ ...p }));
  } else {
    nodeDrawState.nodes = [
      { x: refItem.x - w / 2, y: refItem.y - h / 2 },
      { x: refItem.x + w / 2, y: refItem.y - h / 2 },
      { x: refItem.x + w / 2, y: refItem.y + h / 2 },
      { x: refItem.x - w / 2, y: refItem.y + h / 2 },
    ];
  }

  // Switch to shape tool
  state.currentTool = 'shape';
  state.toolSettings.nodeDraw = true;

  renderNodeOverlay();
  requestRender();
  showToast(`Filled quad with "${refItem.name}" — Drag corners to warp in perspective`);
}

/**
 * Initializes a 4-node perspective quad between startPt and endPt.
 */
export function startNodeQuad(startPt, endPt) {
  nodeDrawState.active = true;
  const preset = state.toolSettings.shapePreset;
  if (preset === 'rounded-rect') {
    nodeDrawState.shapeType = 'rounded-rect';
  } else if (preset === 'ellipse') {
    nodeDrawState.shapeType = 'ellipse';
  } else if (preset === 'rectangle') {
    nodeDrawState.shapeType = 'quad';
  }
  syncNodeDrawWithToolSettings();

  const minX = Math.min(startPt.x, endPt.x);
  const maxX = Math.max(startPt.x, endPt.x);
  const minY = Math.min(startPt.y, endPt.y);
  const maxY = Math.max(startPt.y, endPt.y);

  // TRUE 90° RECTANGLE (No 12% inward slant):
  nodeDrawState.nodes = [
    { x: minX, y: minY }, // 0: Top-Left (TL)
    { x: maxX, y: minY }, // 1: Top-Right (TR)
    { x: maxX, y: maxY }, // 2: Bottom-Right (BR)
    { x: minX, y: maxY }, // 3: Bottom-Left (BL)
  ];

  renderNodeOverlay();
  requestRender();
  showToast('Perspective Quad active: Drag corners, slide edges, or move body. Press Enter to Commit.');
}

/**
 * Spawns a perspective quad centered in the current camera viewport.
 */
export function spawnCenteredNodeQuad() {
  const vis = getVisibleWorldRect();
  const cx = vis.x + vis.w / 2;
  const cy = vis.y + vis.h / 2;
  const qw = Math.min(vis.w * 0.45, 420);
  const qh = Math.min(vis.h * 0.35, 260);

  startNodeQuad(
    { x: cx - qw / 2, y: cy - qh / 2 },
    { x: cx + qw / 2, y: cy + qh / 2 }
  );
}

/**
 * Resets the 4 nodes into an aligned flat rectangle.
 */
export function resetQuadToRectangle() {
  if (!nodeDrawState.nodes) return;
  const nodes = nodeDrawState.nodes;
  const minX = Math.min(...nodes.map(p => p.x));
  const maxX = Math.max(...nodes.map(p => p.x));
  const minY = Math.min(...nodes.map(p => p.y));
  const maxY = Math.max(...nodes.map(p => p.y));

  nodeDrawState.nodes = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];

  updateNodeOverlayPositions();
  requestRender();
}

/**
 * Commits the perspective quad as a permanent vector stroke to the active layer.
 */
export function commitNodeQuad() {
  if (!nodeDrawState.active || !nodeDrawState.nodes) return;

  const frame = currentFrame();
  if (!frame) return;

  const store = frame.layerData[state.activeLayerId] || (frame.layerData[state.activeLayerId] = { tiles: {}, strokes: [] });
  if (!store.strokes) store.strokes = [];

  store.strokes.push({
    id: `node_quad_${Date.now()}`,
    tool: 'shape',
    isNodeQuad: true,
    nodes: nodeDrawState.nodes.map(p => ({ ...p })),
    textureImage: nodeDrawState.textureImage,
    textureName: nodeDrawState.textureName,
    textureRefId: nodeDrawState.textureRefId,
    settings: {
      shapeType: nodeDrawState.shapeType,
      subdivisions: nodeDrawState.subdivisions,
      showDiagonals: nodeDrawState.showDiagonals,
      cornerRadius: nodeDrawState.cornerRadius,
      color: nodeDrawState.color,
      secondaryColor: nodeDrawState.secondaryColor,
      fillColor: nodeDrawState.fillColor,
      size: nodeDrawState.size,
      opacity: nodeDrawState.opacity,
      shapeMode: nodeDrawState.shapeMode,
      strokeDash: nodeDrawState.strokeDash,
      isFilled: nodeDrawState.isFilled,
      hasStroke: nodeDrawState.hasStroke,
    },
  });

  cancelNodeQuad();
  state.isDrawing = false;
  state.dragStartPoint = null;
  state.lastPointerWorld = null;
  requestRender();
  saveHistoryState();
  showToast('Committed perspective shape to active layer!');
}

/**
 * Cancels the current perspective session without saving.
 */
export function cancelNodeQuad() {
  nodeDrawState.active = false;
  nodeDrawState.nodes = null;
  nodeDrawState.draggingNodeIdx = -1;
  nodeDrawState.draggingEdgeIdx = -1;
  nodeDrawState.isDraggingBody = false;
  nodeDrawState.textureImage = null;
  nodeDrawState.textureName = null;
  nodeDrawState.textureRefId = null;
  removeNodeOverlay();
  requestRender();
}

/**
 * Draws a committed or preview 4-node perspective shape on a 2D canvas context.
 */
export function drawNodeQuad(ctx, stroke) {
  const nodes = stroke.nodes || nodeDrawState.nodes;
  if (!nodes || nodes.length !== 4) return;

  const st = stroke.settings || {
    shapeType: nodeDrawState.shapeType,
    subdivisions: nodeDrawState.subdivisions,
    showDiagonals: nodeDrawState.showDiagonals,
    color: nodeDrawState.color,
    secondaryColor: nodeDrawState.secondaryColor,
    fillColor: nodeDrawState.fillColor,
    size: nodeDrawState.size,
    opacity: nodeDrawState.opacity,
    shapeMode: nodeDrawState.shapeMode,
    strokeDash: nodeDrawState.strokeDash,
    isFilled: nodeDrawState.isFilled,
    hasStroke: nodeDrawState.hasStroke,
  };

  let texture = stroke.textureImage || (stroke === nodeDrawState || !stroke.id ? nodeDrawState.textureImage : null);
  if (!texture && stroke.textureRefId) {
    const domEl = document.querySelector(`[data-ref-id="${stroke.textureRefId}"]`);
    texture = domEl?.querySelector('img, video');
  }

  const color = st.color || stroke.strokeColor || '#f97316';
  const size = Math.max(0.5, st.size || stroke.strokeWidth || 3);
  const opacity = st.opacity !== undefined ? st.opacity : 1;
  const shapeMode = st.shapeMode || 'both';
  const shapeType = st.shapeType || 'quad';
  const subdivisions = st.subdivisions || 1;
  const showDiagonals = Boolean(st.showDiagonals);

  let fillColor = st.fillColor;
  if (!fillColor || fillColor === 'transparent') {
    fillColor = shapeMode === 'both' ? (st.secondaryColor || '#ffffff') : color;
  }

  ctx.save();

  // Set line dash pattern
  if (st.strokeDash === 'dashed') {
    ctx.setLineDash([size * 3, size * 2]);
  } else if (st.strokeDash === 'dotted') {
    ctx.setLineDash([size, size * 1.5]);
  } else {
    ctx.setLineDash([]);
  }

  // 1. FILL WITH IMAGE IN PERSPECTIVE (Bilinear triangular warp)
  if (texture) {
    ctx.save();
    ctx.globalAlpha = opacity;
    drawPerspectiveImage(ctx, texture, nodes, 10);
    ctx.restore();
  } else if (shapeType === 'ellipse') {
    // True projective / bilinear parametric ellipse
    const steps = 72;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * Math.PI * 2;
      const u = (1 + Math.cos(theta)) / 2;
      const v = (1 + Math.sin(theta)) / 2;
      const pt = getBilinearPoint(u, v, nodes);
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();

    if (shapeMode !== 'stroke' && st.isFilled !== false) {
      ctx.fillStyle = hexToRgba(fillColor, opacity * 0.85);
      ctx.fill();
    }
    if (shapeMode !== 'fill' && st.hasStroke !== false) {
      ctx.strokeStyle = hexToRgba(color, opacity);
      ctx.lineWidth = size;
      ctx.stroke();
    }
  } else if (shapeType === 'rounded-rect' || shapeType === 'roundrect' || shapeType === 'rounded') {
    // True projective / bilinear parametric rounded rectangle with corner foreshortening
    const cornerRad = st.cornerRadius ?? nodeDrawState.cornerRadius ?? 16;
    const pts = getPerspectiveRoundedRectPoints(nodes, cornerRad, 14);
    if (pts.length > 0) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.closePath();

      if (shapeMode !== 'stroke' && st.isFilled !== false) {
        ctx.fillStyle = hexToRgba(fillColor, opacity * 0.85);
        ctx.fill();
      }
      if (shapeMode !== 'fill' && st.hasStroke !== false) {
        ctx.strokeStyle = hexToRgba(color, opacity);
        ctx.lineWidth = size;
        ctx.stroke();
      }
    }
  } else {
    // Quadrilateral perimeter
    ctx.beginPath();
    ctx.moveTo(nodes[0].x, nodes[0].y);
    ctx.lineTo(nodes[1].x, nodes[1].y);
    ctx.lineTo(nodes[2].x, nodes[2].y);
    ctx.lineTo(nodes[3].x, nodes[3].y);
    ctx.closePath();

    if (shapeMode !== 'stroke' && st.isFilled !== false) {
      ctx.fillStyle = hexToRgba(fillColor, opacity * 0.85);
      ctx.fill();
    }
    if (shapeMode !== 'fill' && st.hasStroke !== false) {
      ctx.strokeStyle = hexToRgba(color, opacity);
      ctx.lineWidth = size;
      ctx.stroke();
    }

    // Perspective grid subdivisions (floor tiles, wall grid, ceiling panels)
    if (shapeType === 'grid' && subdivisions > 1) {
      ctx.save();
      ctx.strokeStyle = hexToRgba(color, opacity * 0.7);
      ctx.lineWidth = Math.max(0.5, size * 0.65);

      // Horizontal lines receding into perspective
      for (let i = 1; i < subdivisions; i++) {
        const v = i / subdivisions;
        const pLeft = getBilinearPoint(0, v, nodes);
        const pRight = getBilinearPoint(1, v, nodes);
        ctx.beginPath();
        ctx.moveTo(pLeft.x, pLeft.y);
        ctx.lineTo(pRight.x, pRight.y);
        ctx.stroke();
      }

      // Vertical converging lines
      for (let i = 1; i < subdivisions; i++) {
        const u = i / subdivisions;
        const pTop = getBilinearPoint(u, 0, nodes);
        const pBottom = getBilinearPoint(u, 1, nodes);
        ctx.beginPath();
        ctx.moveTo(pTop.x, pTop.y);
        ctx.lineTo(pBottom.x, pBottom.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Stroke outline around textured quad
  if (texture && shapeMode !== 'fill' && st.hasStroke !== false) {
    ctx.beginPath();
    ctx.moveTo(nodes[0].x, nodes[0].y);
    ctx.lineTo(nodes[1].x, nodes[1].y);
    ctx.lineTo(nodes[2].x, nodes[2].y);
    ctx.lineTo(nodes[3].x, nodes[3].y);
    ctx.closePath();
    ctx.strokeStyle = hexToRgba(color, opacity);
    ctx.lineWidth = size;
    ctx.stroke();
  }

  // Perspective Diagonals ('X' cross) to show 3D center
  if (showDiagonals) {
    ctx.save();
    ctx.strokeStyle = hexToRgba(color, opacity * 0.5);
    ctx.lineWidth = Math.max(0.5, size * 0.5);
    ctx.setLineDash([size * 2, size * 2]);

    // Diagonals
    ctx.beginPath();
    ctx.moveTo(nodes[0].x, nodes[0].y);
    ctx.lineTo(nodes[2].x, nodes[2].y);
    ctx.moveTo(nodes[1].x, nodes[1].y);
    ctx.lineTo(nodes[3].x, nodes[3].y);
    ctx.stroke();

    // Center point indicator
    const center = getQuadCenter(nodes);
    ctx.setLineDash([]);
    ctx.fillStyle = hexToRgba(color, opacity);
    ctx.beginPath();
    ctx.arc(center.x, center.y, Math.max(2, size * 0.8), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Draws the active perspective quad during editing with high-contrast guides,
 * vanishing lines, and center crosshairs directly on the viewport canvas.
 */
export function drawActiveNodeQuad(ctx) {
  if (!nodeDrawState.active || !nodeDrawState.nodes) return;
  const nodes = nodeDrawState.nodes;

  // 1. Draw the actual shape preview (including texture if set)
  drawNodeQuad(ctx, {
    nodes,
    textureImage: nodeDrawState.textureImage,
    textureName: nodeDrawState.textureName,
    settings: {
      shapeType: nodeDrawState.shapeType,
      subdivisions: nodeDrawState.subdivisions,
      showDiagonals: nodeDrawState.showDiagonals,
      cornerRadius: nodeDrawState.cornerRadius,
      color: nodeDrawState.color,
      secondaryColor: nodeDrawState.secondaryColor,
      fillColor: nodeDrawState.fillColor,
      size: nodeDrawState.size,
      opacity: nodeDrawState.opacity,
      shapeMode: nodeDrawState.shapeMode,
      strokeDash: nodeDrawState.strokeDash,
      isFilled: nodeDrawState.isFilled,
      hasStroke: nodeDrawState.hasStroke,
    },
  });

  // 2. High-contrast perimeter wireframe overlay (visible on any background)
  ctx.save();
  const zoom = state.zoom || 1;
  const lineW = 1.5 / zoom;

  // White base line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = lineW * 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(nodes[0].x, nodes[0].y);
  ctx.lineTo(nodes[1].x, nodes[1].y);
  ctx.lineTo(nodes[2].x, nodes[2].y);
  ctx.lineTo(nodes[3].x, nodes[3].y);
  ctx.closePath();
  ctx.stroke();

  // Orange dashed overlay
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = lineW;
  ctx.setLineDash([6 / zoom, 4 / zoom]);
  ctx.stroke();

  // 3. Vanishing Guide Rays (Optional)
  if (nodeDrawState.showVanishingRays) {
    const vpH = getVanishingPoint(nodes[0], nodes[1], nodes[3], nodes[2]); // Horizontal
    const vpV = getVanishingPoint(nodes[0], nodes[3], nodes[1], nodes[2]); // Vertical

    ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)'; // Cyan guide
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([4 / zoom, 4 / zoom]);

    if (vpH && Math.hypot(vpH.x - nodes[0].x, vpH.y - nodes[0].y) < 8000) {
      ctx.beginPath();
      ctx.moveTo(nodes[0].x, nodes[0].y);
      ctx.lineTo(vpH.x, vpH.y);
      ctx.moveTo(nodes[3].x, nodes[3].y);
      ctx.lineTo(vpH.x, vpH.y);
      ctx.stroke();
    }

    if (vpV && Math.hypot(vpV.x - nodes[0].x, vpV.y - nodes[0].y) < 8000) {
      ctx.beginPath();
      ctx.moveTo(nodes[0].x, nodes[0].y);
      ctx.lineTo(vpV.x, vpV.y);
      ctx.moveTo(nodes[1].x, nodes[1].y);
      ctx.lineTo(vpV.x, vpV.y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * Creates or refreshes the HTML interaction overlay with 4 corner pins,
 * 4 edge midpoint sliders, a draggable body area, and a floating toolbar.
 */
export function renderNodeOverlay() {
  let overlay = document.getElementById('node-draw-overlay');
  if (!overlay && elements.canvasContainer) {
    overlay = document.createElement('div');
    overlay.id = 'node-draw-overlay';
    overlay.className = 'absolute inset-0 z-40 pointer-events-none select-none overflow-hidden';
    elements.canvasContainer.appendChild(overlay);
  }

  if (!nodeDrawState.active || !nodeDrawState.nodes) {
    if (overlay) overlay.remove();
    return;
  }

  overlay.innerHTML = `
    <!-- SVG layer for quad body dragging -->
    <svg id="node-draw-svg" class="absolute inset-0 w-full h-full pointer-events-none">
      <polygon id="node-draw-svg-body" points="" class="cursor-move pointer-events-auto transition-opacity" 
               fill="rgba(249, 115, 22, 0.08)" stroke="rgba(249, 115, 22, 0.35)" stroke-dasharray="4,4" />
    </svg>

    <!-- 4 Corner Draggable Handles (TL, TR, BR, BL) -->
    ${[0, 1, 2, 3].map(idx => {
      const labels = ['TL', 'TR', 'BR', 'BL'];
      return `
        <div id="node-handle-${idx}" data-node-idx="${idx}" class="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-grab group">
          <div class="relative w-6 h-6 flex items-center justify-center">
            <div class="w-4 h-4 rounded-full bg-gradient-to-tr from-orange-600 to-amber-500 border-2 border-white shadow-md group-hover:scale-125 transition-transform"></div>
            <span class="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-mono font-bold bg-zinc-900/90 text-zinc-200 border border-zinc-700/80 px-1 py-0.2 rounded shadow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
              ${labels[idx]}
            </span>
          </div>
        </div>
      `;
    }).join('')}

    <!-- 4 Edge Midpoint Handles for sliding whole edges -->
    ${[0, 1, 2, 3].map(idx => {
      const cursors = ['cursor-ns-resize', 'cursor-ew-resize', 'cursor-ns-resize', 'cursor-ew-resize'];
      return `
        <div id="node-edge-${idx}" data-edge-idx="${idx}" class="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto ${cursors[idx]} group">
          <div class="w-3 h-3 rotate-45 rounded-[2px] bg-zinc-900 border-2 border-amber-400 shadow group-hover:scale-125 group-hover:bg-amber-400 transition-transform"></div>
        </div>
      `;
    }).join('')}

    <!-- Floating Perspective Action Bar -->
    <div id="node-draw-toolbar" class="absolute pointer-events-auto bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-2 flex items-center gap-2 shadow-2xl text-xs z-50">
      <button id="btn-node-commit" title="Commit Shape to Active Layer (Enter)" class="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition flex items-center gap-1.5 shadow-md hover:shadow-blue-600/30 cursor-pointer">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
        <span>Commit</span>
        <kbd class="text-[9px] opacity-75 font-mono bg-blue-800/80 px-1 rounded">Enter</kbd>
      </button>

      <div class="h-4 w-px bg-slate-700/80"></div>

      <!-- Shape Selector & Internal Elements -->
      <div class="flex bg-slate-800/80 p-0.5 rounded-xl border border-slate-700/50">
        <button id="btn-shape-quad" title="Plain Perspective Rectangle (Clean perimeter with no internal grid or X)" class="px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${nodeDrawState.shapeType === 'quad' && !nodeDrawState.showDiagonals ? 'bg-orange-500 text-white shadow-xs font-bold' : 'text-slate-400 hover:text-slate-200'}">
          Clean Rect
        </button>
        <button id="btn-shape-rounded" title="Perspective Rounded Rectangle" class="px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${nodeDrawState.shapeType === 'rounded-rect' ? 'bg-orange-500 text-white shadow-xs font-bold' : 'text-slate-400 hover:text-slate-200'}">
          Rounded
        </button>
        <button id="btn-shape-grid" title="Perspective Grid (Floor / Wall Subdivisions)" class="px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${nodeDrawState.shapeType === 'grid' ? 'bg-orange-500 text-white shadow-xs font-bold' : 'text-slate-400 hover:text-slate-200'}">
          Grid
        </button>
        <button id="btn-shape-ellipse" title="Perspective Ellipse / Circle" class="px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${nodeDrawState.shapeType === 'ellipse' ? 'bg-orange-500 text-white shadow-xs font-bold' : 'text-slate-400 hover:text-slate-200'}">
          Ellipse
        </button>
      </div>

      <!-- Diagonals Cross Toggle (X) -->
      <button id="btn-toggle-diagonals" title="Toggle Internal Center Cross (X Diagonals)" class="px-2.5 py-1 rounded-lg text-xs font-medium border transition cursor-pointer flex items-center gap-1.5 ${nodeDrawState.showDiagonals ? 'bg-orange-500/20 border-orange-500 text-orange-300 font-bold shadow-xs' : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'}">
        <span>X Diagonals</span>
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>

      <!-- Corner Radius stepper (Rounded mode) -->
      <div id="node-radius-stepper" class="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-xl border border-slate-700/50 ${nodeDrawState.shapeType === 'rounded-rect' ? '' : 'hidden'}">
        <span class="text-[10px] text-slate-400 font-medium">Radius:</span>
        <button id="btn-rad-dec" class="w-4 h-4 flex items-center justify-center rounded text-slate-300 hover:bg-slate-700 cursor-pointer font-bold">-</button>
        <span id="label-node-radius" class="font-mono text-orange-400 font-bold min-w-[20px] text-center">${nodeDrawState.cornerRadius || 16}px</span>
        <button id="btn-rad-inc" class="w-4 h-4 flex items-center justify-center rounded text-slate-300 hover:bg-slate-700 cursor-pointer font-bold">+</button>
      </div>

      <!-- Subdivisions stepper (Grid mode) -->
      <div id="node-grid-stepper" class="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-xl border border-slate-700/50 ${nodeDrawState.shapeType === 'grid' ? '' : 'hidden'}">
        <span class="text-[10px] text-slate-400 font-medium">Tiles:</span>
        <button id="btn-grid-dec" class="w-4 h-4 flex items-center justify-center rounded text-slate-300 hover:bg-slate-700 cursor-pointer font-bold">-</button>
        <span id="label-grid-count" class="font-mono text-orange-400 font-bold min-w-[20px] text-center">${nodeDrawState.subdivisions}x${nodeDrawState.subdivisions}</span>
        <button id="btn-grid-inc" class="w-4 h-4 flex items-center justify-center rounded text-slate-300 hover:bg-slate-700 cursor-pointer font-bold">+</button>
      </div>

      <!-- Reset Rect -->
      <button id="btn-node-reset" title="Square back to 90° Rectangle" class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition text-xs cursor-pointer">
        Reset Rect
      </button>

      <div class="h-4 w-px bg-slate-700/80"></div>

      <!-- Cancel -->
      <button id="btn-node-cancel" title="Cancel (Esc)" class="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-orange-400 transition cursor-pointer">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>

      ${nodeDrawState.textureName ? `
        <div class="h-4 w-px bg-slate-700/80"></div>
        <div class="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-orange-950/80 border border-orange-500/80 text-orange-300 font-mono text-[11px] font-bold">
          <svg class="w-3.5 h-3.5 shrink-0 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          <span class="max-w-[120px] truncate" title="${nodeDrawState.textureName}">${nodeDrawState.textureName}</span>
        </div>
      ` : ''}
    </div>
  `;

  setupOverlayEvents(overlay);
  updateNodeOverlayPositions();
}

/**
 * Attaches interactive drag listeners to corner handles, edge midpoints, SVG body, and toolbar.
 */
function setupOverlayEvents(overlay) {
  // 1. Corner Handles Drag
  overlay.querySelectorAll('[data-node-idx]').forEach(el => {
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const idx = parseInt(el.dataset.nodeIdx, 10);
      nodeDrawState.draggingNodeIdx = idx;
      el.classList.add('cursor-grabbing');

      const onMove = (me) => {
        const curWorld = screenToWorld(me.clientX, me.clientY);
        nodeDrawState.nodes[idx].x = curWorld.x;
        nodeDrawState.nodes[idx].y = curWorld.y;
        updateNodeOverlayPositions();
        requestRender();
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        nodeDrawState.draggingNodeIdx = -1;
        el.classList.remove('cursor-grabbing');
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });

  // 2. Edge Midpoints Drag (translates two adjacent corners together)
  overlay.querySelectorAll('[data-edge-idx]').forEach(el => {
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const edgeIdx = parseInt(el.dataset.edgeIdx, 10);
      nodeDrawState.draggingEdgeIdx = edgeIdx;

      // Adjacent nodes for edge 0 (Top): 0 & 1
      // Edge 1 (Right): 1 & 2
      // Edge 2 (Bottom): 2 & 3
      // Edge 3 (Left): 3 & 0
      const nodeA = edgeIdx;
      const nodeB = (edgeIdx + 1) % 4;

      const startWorld = screenToWorld(e.clientX, e.clientY);
      const snapA = { ...nodeDrawState.nodes[nodeA] };
      const snapB = { ...nodeDrawState.nodes[nodeB] };

      const onMove = (me) => {
        const curWorld = screenToWorld(me.clientX, me.clientY);
        const dx = curWorld.x - startWorld.x;
        const dy = curWorld.y - startWorld.y;
        nodeDrawState.nodes[nodeA].x = snapA.x + dx;
        nodeDrawState.nodes[nodeA].y = snapA.y + dy;
        nodeDrawState.nodes[nodeB].x = snapB.x + dx;
        nodeDrawState.nodes[nodeB].y = snapB.y + dy;
        updateNodeOverlayPositions();
        requestRender();
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        nodeDrawState.draggingEdgeIdx = -1;
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });

  // 3. SVG Body Drag (translates the entire quad in world coordinates)
  const svgBody = document.getElementById('node-draw-svg-body');
  if (svgBody) {
    svgBody.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      nodeDrawState.isDraggingBody = true;
      const startWorld = screenToWorld(e.clientX, e.clientY);
      const snapshots = nodeDrawState.nodes.map(n => ({ ...n }));

      const onMove = (me) => {
        const curWorld = screenToWorld(me.clientX, me.clientY);
        const dx = curWorld.x - startWorld.x;
        const dy = curWorld.y - startWorld.y;
        for (let i = 0; i < 4; i++) {
          nodeDrawState.nodes[i].x = snapshots[i].x + dx;
          nodeDrawState.nodes[i].y = snapshots[i].y + dy;
        }
        updateNodeOverlayPositions();
        requestRender();
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        nodeDrawState.isDraggingBody = false;
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  // 4. Toolbar Action Buttons
  document.getElementById('btn-node-commit')?.addEventListener('click', commitNodeQuad);
  document.getElementById('btn-node-cancel')?.addEventListener('click', cancelNodeQuad);
  document.getElementById('btn-node-reset')?.addEventListener('click', resetQuadToRectangle);

  function syncSidePanelCheckboxes() {
    const diagCheck = document.getElementById('toggle-node-diagonals');
    if (diagCheck) diagCheck.checked = Boolean(nodeDrawState.showDiagonals);
    const gridCheck = document.getElementById('toggle-node-grid');
    if (gridCheck) gridCheck.checked = nodeDrawState.shapeType === 'grid';

    // Sync shape preset buttons in sidepanel
    document.querySelectorAll('[data-shape-preset]').forEach(btn => {
      const p = btn.dataset.shapePreset;
      const isMatch = (p === 'rounded-rect' && nodeDrawState.shapeType === 'rounded-rect') ||
                      (p === 'ellipse' && nodeDrawState.shapeType === 'ellipse') ||
                      (p === 'rectangle' && (nodeDrawState.shapeType === 'quad' || nodeDrawState.shapeType === 'grid'));
      btn.classList.toggle('active', isMatch);
      btn.classList.toggle('bg-orange-500/20', isMatch);
      btn.classList.toggle('border-orange-500', isMatch);
    });
  }

  // Shape switches
  document.getElementById('btn-shape-quad')?.addEventListener('click', () => {
    nodeDrawState.shapeType = 'quad';
    nodeDrawState.showDiagonals = false;
    state.toolSettings.shapePreset = 'rectangle';
    syncSidePanelCheckboxes();
    renderNodeOverlay();
    requestRender();
  });
  document.getElementById('btn-shape-rounded')?.addEventListener('click', () => {
    nodeDrawState.shapeType = 'rounded-rect';
    state.toolSettings.shapePreset = 'rounded-rect';
    syncSidePanelCheckboxes();
    renderNodeOverlay();
    requestRender();
  });
  document.getElementById('btn-shape-grid')?.addEventListener('click', () => {
    nodeDrawState.shapeType = 'grid';
    state.toolSettings.shapePreset = 'rectangle';
    syncSidePanelCheckboxes();
    renderNodeOverlay();
    requestRender();
  });
  document.getElementById('btn-shape-ellipse')?.addEventListener('click', () => {
    nodeDrawState.shapeType = 'ellipse';
    state.toolSettings.shapePreset = 'ellipse';
    syncSidePanelCheckboxes();
    renderNodeOverlay();
    requestRender();
  });

  // Corner radius stepper
  document.getElementById('btn-rad-inc')?.addEventListener('click', () => {
    nodeDrawState.cornerRadius = Math.min(60, (nodeDrawState.cornerRadius || 16) + 4);
    state.toolSettings.cornerRadius = nodeDrawState.cornerRadius;
    const lbl = document.getElementById('label-node-radius');
    if (lbl) lbl.textContent = `${nodeDrawState.cornerRadius}px`;
    const sideLbl = document.getElementById('label-corner-radius');
    if (sideLbl) sideLbl.textContent = `${nodeDrawState.cornerRadius}px`;
    const sideSlider = document.getElementById('slider-corner-radius');
    if (sideSlider) sideSlider.value = nodeDrawState.cornerRadius;
    requestRender();
  });
  document.getElementById('btn-rad-dec')?.addEventListener('click', () => {
    nodeDrawState.cornerRadius = Math.max(2, (nodeDrawState.cornerRadius || 16) - 4);
    state.toolSettings.cornerRadius = nodeDrawState.cornerRadius;
    const lbl = document.getElementById('label-node-radius');
    if (lbl) lbl.textContent = `${nodeDrawState.cornerRadius}px`;
    const sideLbl = document.getElementById('label-corner-radius');
    if (sideLbl) sideLbl.textContent = `${nodeDrawState.cornerRadius}px`;
    const sideSlider = document.getElementById('slider-corner-radius');
    if (sideSlider) sideSlider.value = nodeDrawState.cornerRadius;
    requestRender();
  });

  // Grid subdivisions stepper
  document.getElementById('btn-grid-inc')?.addEventListener('click', () => {
    nodeDrawState.subdivisions = Math.min(8, nodeDrawState.subdivisions + 1);
    const lbl = document.getElementById('label-grid-count');
    if (lbl) lbl.textContent = `${nodeDrawState.subdivisions}x${nodeDrawState.subdivisions}`;
    requestRender();
  });
  document.getElementById('btn-grid-dec')?.addEventListener('click', () => {
    nodeDrawState.subdivisions = Math.max(2, nodeDrawState.subdivisions - 1);
    const lbl = document.getElementById('label-grid-count');
    if (lbl) lbl.textContent = `${nodeDrawState.subdivisions}x${nodeDrawState.subdivisions}`;
    requestRender();
  });

  // Diagonals toggle
  document.getElementById('btn-toggle-diagonals')?.addEventListener('click', () => {
    nodeDrawState.showDiagonals = !nodeDrawState.showDiagonals;
    syncSidePanelCheckboxes();
    renderNodeOverlay();
    requestRender();
  });
}

/**
 * Updates positions of all handles, polygon body, and toolbar to match world coordinates.
 * Called automatically every frame in renderViewport() to guarantee zero-lag sync during camera pan/zoom.
 */
export function updateNodeOverlayPositions() {
  if (!nodeDrawState.active || !nodeDrawState.nodes) return;
  const overlay = document.getElementById('node-draw-overlay');
  if (!overlay) return;

  const scrNodes = nodeDrawState.nodes.map(n => worldToScreen(n.x, n.y));

  // 1. Update 4 corner handles
  scrNodes.forEach((scr, idx) => {
    const el = document.getElementById(`node-handle-${idx}`);
    if (el) {
      el.style.left = `${scr.x}px`;
      el.style.top = `${scr.y}px`;
    }
  });

  // 2. Update 4 edge midpoint handles
  const midpoints = getQuadEdgeMidpoints(nodeDrawState.nodes).map(m => worldToScreen(m.x, m.y));
  midpoints.forEach((scr, idx) => {
    const el = document.getElementById(`node-edge-${idx}`);
    if (el) {
      el.style.left = `${scr.x}px`;
      el.style.top = `${scr.y}px`;
    }
  });

  // 3. Update SVG polygon body points
  const svgBody = document.getElementById('node-draw-svg-body');
  if (svgBody) {
    const ptsString = scrNodes.map(p => `${p.x},${p.y}`).join(' ');
    svgBody.setAttribute('points', ptsString);
  }

  // 4. Update Floating Action Toolbar position
  const tb = document.getElementById('node-draw-toolbar');
  if (tb && elements.canvasContainer) {
    const containerRect = elements.canvasContainer.getBoundingClientRect();
    // Position toolbar just below the lowest corner (or above the highest if near bottom)
    const maxY = Math.max(...scrNodes.map(p => p.y));
    const minX = Math.min(...scrNodes.map(p => p.x));
    const maxX = Math.max(...scrNodes.map(p => p.x));
    const centerX = (minX + maxX) / 2;

    const tbWidth = tb.offsetWidth || 340;
    const tbHeight = tb.offsetHeight || 44;

    let targetLeft = centerX - tbWidth / 2;
    let targetTop = maxY + 24;

    // Boundary clamping to prevent clipping off screen
    targetLeft = Math.max(12, Math.min(containerRect.width - tbWidth - 12, targetLeft));
    if (targetTop + tbHeight > containerRect.height - 12) {
      const minY = Math.min(...scrNodes.map(p => p.y));
      targetTop = Math.max(12, minY - tbHeight - 20);
    }

    tb.style.left = `${targetLeft}px`;
    tb.style.top = `${targetTop}px`;
  }
}

export function removeNodeOverlay() {
  document.getElementById('node-draw-overlay')?.remove();
}
