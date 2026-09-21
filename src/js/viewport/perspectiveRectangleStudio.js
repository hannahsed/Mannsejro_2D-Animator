// src/js/viewport/perspectiveRectangleStudio.js
import { state, currentFrame } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { worldToScreen, screenToWorld } from './camera.js';
import { requestRender } from '../render/renderEngine.js';
import { saveHistoryState } from '../project/history.js';
import { showToast } from '../ui/toast.js';
import { hexToRgba } from '../colorUtils.js';
import { drawPerspectiveImage } from './perspectiveWarp.js';
import { commandManager, AddStrokeCommand } from '../project/commandManager.js';
import { commitRasterBlit } from '../render/rasterPaint.js';

export const perspectiveStudioState = {
  active: false,
  mode: 'plane',               // 'plane' | 'cube'
  cubeVisibility: 'shaded3',   // 'shaded3' | 'all' | 'cutaway'
  
  // 4 Base Nodes: [0: TL, 1: TR, 2: BR, 3: BL]
  nodes: null,
  topNodes: null,
  
  extrusionHeight: 80,
  showGrid: true,              // Perspective grid toggle
  subdivisions: 3,             // Grid density (e.g. 3x3 tiles)
  showHorizonRays: false,      // Horizon line & vanishing guide rays toggle
  showDiagonals: false,
  
  textureImage: null,
  textureName: null,
  
  draggingHandle: null,
  dragStartPointer: null,
  dragSnapshotNodes: null,
  dragSnapshotTopNodes: null,
  dragSnapshotExtrusion: 80,
  hoveredHandle: null,
};

export function startPerspectiveRectangle(startPt, endPt, mode = 'plane') {
  const minX = Math.min(startPt.x, endPt.x);
  const maxX = Math.max(startPt.x, endPt.x);
  const minY = Math.min(startPt.y, endPt.y);
  const maxY = Math.max(startPt.y, endPt.y);
  const extH = state.toolSettings.cubeExtrusion || 80;

  perspectiveStudioState.active = true;
  perspectiveStudioState.mode = mode;
  perspectiveStudioState.cubeVisibility = state.toolSettings.cubeVisibility || 'shaded3';
  perspectiveStudioState.extrusionHeight = extH;
  perspectiveStudioState.showGrid = true;
  perspectiveStudioState.subdivisions = state.toolSettings.rectSubdivisions || 3;
  perspectiveStudioState.showHorizonRays = false;
  perspectiveStudioState.showDiagonals = state.toolSettings.rectDiagonals || false;
  perspectiveStudioState.textureImage = state.toolSettings.perspectiveImage || null;
  perspectiveStudioState.textureName = state.toolSettings.perspectiveImageName || null;
  perspectiveStudioState.draggingHandle = null;
  perspectiveStudioState.hoveredHandle = null;

  // Exact 90° orthogonal rectangle spawn
  perspectiveStudioState.nodes = [
    { x: minX, y: minY }, // 0: TL
    { x: maxX, y: minY }, // 1: TR
    { x: maxX, y: maxY }, // 2: BR
    { x: minX, y: maxY }, // 3: BL
  ];

  perspectiveStudioState.topNodes = [
    { x: minX, y: minY - extH },
    { x: maxX, y: minY - extH },
    { x: maxX, y: maxY - extH },
    { x: minX, y: maxY - extH },
  ];

  renderFloatingActionBar();
  updateFloatingActionBarPosition();
  requestRender();
}

/**
 * Trajectory Extension:
 * Extends edge along perspective convergence rays.
 * - Top extends toward vanishing point (narrows).
 * - Bottom extends away from vanishing point (opens wider).
 * - Left/Right extend along top & bottom perspective horizon rails.
 */
export function extendPerspectiveTrajectory(side, deltaFactor = 0.15) {
  if (!perspectiveStudioState.nodes) return;
  const nodes = perspectiveStudioState.nodes;
  const [p0, p1, p2, p3] = nodes;

  if (side === 'top') {
    // Left rail: p3 -> p0; Right rail: p2 -> p1
    const vL = { x: p0.x - p3.x, y: p0.y - p3.y };
    const vR = { x: p1.x - p2.x, y: p1.y - p2.y };
    p0.x += vL.x * deltaFactor;
    p0.y += vL.y * deltaFactor;
    p1.x += vR.x * deltaFactor;
    p1.y += vR.y * deltaFactor;
  } else if (side === 'bottom') {
    // Left rail: p0 -> p3; Right rail: p1 -> p2
    const vL = { x: p3.x - p0.x, y: p3.y - p0.y };
    const vR = { x: p2.x - p1.x, y: p2.y - p1.y };
    p3.x += vL.x * deltaFactor;
    p3.y += vL.y * deltaFactor;
    p2.x += vR.x * deltaFactor;
    p2.y += vR.y * deltaFactor;
  } else if (side === 'left') {
    // Top rail: p1 -> p0; Bottom rail: p2 -> p3
    const vT = { x: p0.x - p1.x, y: p0.y - p1.y };
    const vB = { x: p3.x - p2.x, y: p3.y - p2.y };
    p0.x += vT.x * deltaFactor;
    p0.y += vT.y * deltaFactor;
    p3.x += vB.x * deltaFactor;
    p3.y += vB.y * deltaFactor;
  } else if (side === 'right') {
    // Top rail: p0 -> p1; Bottom rail: p3 -> p2
    const vT = { x: p1.x - p0.x, y: p1.y - p0.y };
    const vB = { x: p2.x - p3.x, y: p2.y - p3.y };
    p1.x += vT.x * deltaFactor;
    p1.y += vT.y * deltaFactor;
    p2.x += vB.x * deltaFactor;
    p2.y += vB.y * deltaFactor;
  }

  // Synchronize 3D cube top nodes
  if (perspectiveStudioState.topNodes) {
    const extH = perspectiveStudioState.extrusionHeight || 80;
    for (let i = 0; i < 4; i++) {
      perspectiveStudioState.topNodes[i] = {
        x: nodes[i].x,
        y: nodes[i].y - extH,
      };
    }
  }

  updateFloatingActionBarPosition();
  requestRender();
}

/**
 * Vanishing point calculation between line (pA->pB) and (pC->pD)
 */
export function getVanishingPoint(pA, pB, pC, pD) {
  const d1x = pB.x - pA.x;
  const d1y = pB.y - pA.y;
  const d2x = pD.x - pC.x;
  const d2y = pD.y - pC.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-5) return null; // Parallel
  const t = ((pC.x - pA.x) * d2y - (pC.y - pA.y) * d2x) / denom;
  return { x: pA.x + t * d1x, y: pA.y + t * d1y };
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function isPointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function signedPolygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return area / 2;
}

export function evaluateBilinearPoint(nodes, u, v) {
  if (!nodes || nodes.length !== 4) return { x: 0, y: 0 };
  const [p00, p10, p11, p01] = nodes;
  return {
    x: (1 - u) * (1 - v) * p00.x + u * (1 - v) * p10.x + u * v * p11.x + (1 - u) * v * p01.x,
    y: (1 - u) * (1 - v) * p00.y + u * (1 - v) * p10.y + u * v * p11.y + (1 - u) * v * p01.y,
  };
}

export const evaluateProjectivePoint = (nodes, u, v) => evaluateBilinearPoint(nodes, u, v);

export const computePerspectiveCenter = (nodes) => {
  if (!nodes || nodes.length < 4) return { x: 0, y: 0 };
  const [p0, p1, p2, p3] = nodes;
  const d1x = p2.x - p0.x;
  const d1y = p2.y - p0.y;
  const d2x = p3.x - p1.x;
  const d2y = p3.y - p1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) > 1e-5) {
    const t = ((p1.x - p0.x) * d2y - (p1.y - p0.y) * d2x) / denom;
    return { x: p0.x + t * d1x, y: p0.y + t * d1y };
  }
  return {
    x: (p0.x + p1.x + p2.x + p3.x) / 4,
    y: (p0.y + p1.y + p2.y + p3.y) / 4,
  };
};

/**
 * Hit Tester: Coordinates translated to container space to eliminate offset
 */
export function hitTestPerspectiveHandle(clientX, clientY) {
  if (!perspectiveStudioState.active || !perspectiveStudioState.nodes) return null;
  const container = elements.canvasContainer || document.getElementById('studio-canvas-container');
  if (!container) return null;

  const rect = container.getBoundingClientRect();
  const screenX = clientX - rect.left;
  const screenY = clientY - rect.top;

  const nodes = perspectiveStudioState.nodes;
  const topNodes = perspectiveStudioState.topNodes || nodes.map(p => ({ x: p.x, y: p.y - 80 }));
  const isBox = perspectiveStudioState.mode === 'cube';

  const scrNodes = nodes.map(p => worldToScreen(p.x, p.y));
  const scrTopNodes = topNodes.map(p => worldToScreen(p.x, p.y));

  // Extrusion Arrow Handle
  if (isBox) {
    const topCenterWorld = {
      x: (topNodes[0].x + topNodes[1].x + topNodes[2].x + topNodes[3].x) / 4,
      y: (topNodes[0].y + topNodes[1].y + topNodes[2].y + topNodes[3].y) / 4,
    };
    const scrTopCenter = worldToScreen(topCenterWorld.x, topCenterWorld.y);
    if (Math.hypot(screenX - scrTopCenter.x, screenY - scrTopCenter.y) <= 16) {
      return { type: 'extrude' };
    }
  }

  // 3D Top Corner Nodes
  if (isBox) {
    for (let i = 0; i < 4; i++) {
      if (Math.hypot(screenX - scrTopNodes[i].x, screenY - scrTopNodes[i].y) <= 16) {
        return { type: 'top-node', index: i };
      }
    }
  }

  // Base Corner Nodes
  for (let i = 0; i < 4; i++) {
    if (Math.hypot(screenX - scrNodes[i].x, screenY - scrNodes[i].y) <= 16) {
      return { type: 'node', index: i };
    }
  }

  // Edge Segments
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    if (distToSegment(screenX, screenY, scrNodes[i].x, scrNodes[i].y, scrNodes[next].x, scrNodes[next].y) <= 14) {
      return { type: 'edge', index: i };
    }
  }

  // Body
  if (isBox && isPointInPoly(screenX, screenY, scrTopNodes)) return { type: 'body' };
  if (isPointInPoly(screenX, screenY, scrNodes)) return { type: 'body' };

  return null;
}

export function handlePerspectiveDrag(currentWorld, e) {
  const handle = perspectiveStudioState.draggingHandle;
  if (!handle || !perspectiveStudioState.dragSnapshotNodes) return;

  const snap = perspectiveStudioState.dragSnapshotNodes;
  const snapTop = perspectiveStudioState.dragSnapshotTopNodes || snap.map(p => ({ x: p.x, y: p.y - 80 }));
  const startPt = perspectiveStudioState.dragStartPointer;

  let dx = currentWorld.x - startPt.x;
  let dy = currentWorld.y - startPt.y;

  if (e?.shiftKey && handle.type.includes('node')) {
    if (Math.abs(dx) > Math.abs(dy)) dy = 0;
    else dx = 0;
  }

  if (handle.type === 'extrude') {
    const newExt = Math.max(10, perspectiveStudioState.dragSnapshotExtrusion - dy);
    perspectiveStudioState.extrusionHeight = newExt;
    for (let i = 0; i < 4; i++) {
      perspectiveStudioState.topNodes[i] = {
        x: perspectiveStudioState.nodes[i].x,
        y: perspectiveStudioState.nodes[i].y - newExt,
      };
    }
    updateFloatingActionBarPosition();
    requestRender();
    return;
  }

  if (handle.type === 'node') {
    const idx = handle.index;
    perspectiveStudioState.nodes[idx] = { x: snap[idx].x + dx, y: snap[idx].y + dy };
    if (perspectiveStudioState.mode === 'cube' && perspectiveStudioState.topNodes) {
      perspectiveStudioState.topNodes[idx] = { x: snapTop[idx].x + dx, y: snapTop[idx].y + dy };
    }

    if (e?.altKey) {
      const oppIdx = (idx === 0) ? 1 : (idx === 1) ? 0 : (idx === 2) ? 3 : 2;
      perspectiveStudioState.nodes[oppIdx] = { x: snap[oppIdx].x - dx, y: snap[oppIdx].y + dy };
      if (perspectiveStudioState.mode === 'cube' && perspectiveStudioState.topNodes) {
        perspectiveStudioState.topNodes[oppIdx] = { x: snapTop[oppIdx].x - dx, y: snapTop[oppIdx].y + dy };
      }
    }
    updateFloatingActionBarPosition();
    requestRender();
    return;
  }

  if (handle.type === 'top-node') {
    const idx = handle.index;
    perspectiveStudioState.topNodes[idx] = { x: snapTop[idx].x + dx, y: snapTop[idx].y + dy };
    updateFloatingActionBarPosition();
    requestRender();
    return;
  }

  if (handle.type === 'edge') {
    const i1 = handle.index;
    const i2 = (handle.index + 1) % 4;
    perspectiveStudioState.nodes[i1] = { x: snap[i1].x + dx, y: snap[i1].y + dy };
    perspectiveStudioState.nodes[i2] = { x: snap[i2].x + dx, y: snap[i2].y + dy };
    if (perspectiveStudioState.mode === 'cube' && perspectiveStudioState.topNodes) {
      perspectiveStudioState.topNodes[i1] = { x: snapTop[i1].x + dx, y: snapTop[i1].y + dy };
      perspectiveStudioState.topNodes[i2] = { x: snapTop[i2].x + dx, y: snapTop[i2].y + dy };
    }
    updateFloatingActionBarPosition();
    requestRender();
    return;
  }

  if (handle.type === 'body') {
    for (let i = 0; i < 4; i++) {
      perspectiveStudioState.nodes[i] = { x: snap[i].x + dx, y: snap[i].y + dy };
      if (perspectiveStudioState.topNodes) {
        perspectiveStudioState.topNodes[i] = { x: snapTop[i].x + dx, y: snapTop[i].y + dy };
      }
    }
    updateFloatingActionBarPosition();
    requestRender();
  }
}

export function resetPerspectiveToFlat() {
  if (!perspectiveStudioState.nodes) return;
  const nodes = perspectiveStudioState.nodes;
  const minX = Math.min(...nodes.map(p => p.x));
  const maxX = Math.max(...nodes.map(p => p.x));
  const minY = Math.min(...nodes.map(p => p.y));
  const maxY = Math.max(...nodes.map(p => p.y));
  const extH = perspectiveStudioState.extrusionHeight || 80;

  perspectiveStudioState.nodes = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];

  perspectiveStudioState.topNodes = [
    { x: minX, y: minY - extH },
    { x: maxX, y: minY - extH },
    { x: maxX, y: maxY - extH },
    { x: minX, y: maxY - extH },
  ];

  updateFloatingActionBarPosition();
  requestRender();
  showToast('Reset to 90° Rectangle');
}

export const resetTo90Degrees = resetPerspectiveToFlat;

export function computeInteriorAngles(nodes) {
  if (!nodes || nodes.length < 4) return [90, 90, 90, 90];
  const angles = [];
  for (let i = 0; i < 4; i++) {
    const prev = nodes[(i + 3) % 4];
    const curr = nodes[i];
    const next = nodes[(i + 1) % 4];
    const v1 = { x: prev.x - curr.x, y: prev.y - curr.y };
    const v2 = { x: next.x - curr.x, y: next.y - curr.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.hypot(v1.x, v1.y);
    const mag2 = Math.hypot(v2.x, v2.y);
    if (mag1 === 0 || mag2 === 0) {
      angles.push(90);
      continue;
    }
    const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    const deg = Math.round((Math.acos(cosTheta) * 180) / Math.PI);
    angles.push(deg);
  }
  return angles;
}

export function rotatePerspectiveQuad(angleDeg) {
  if (!perspectiveStudioState.nodes) return;
  const nodes = perspectiveStudioState.nodes;
  const center = computePerspectiveCenter(nodes);
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  for (let i = 0; i < 4; i++) {
    const dx = nodes[i].x - center.x;
    const dy = nodes[i].y - center.y;
    nodes[i].x = center.x + dx * cos - dy * sin;
    nodes[i].y = center.y + dx * sin + dy * cos;
    if (perspectiveStudioState.topNodes) {
      perspectiveStudioState.topNodes[i].x = center.x + dx * cos - dy * sin;
      perspectiveStudioState.topNodes[i].y = (center.y + dx * sin + dy * cos) - (perspectiveStudioState.extrusionHeight || 80);
    }
  }
  updateFloatingActionBarPosition();
  requestRender();
}

/**
 * Renders handles, horizon line, vanishing rays, and internal perspective grid
 */
export function renderPerspectiveHandles(ctx) {
  if (!perspectiveStudioState.active || !perspectiveStudioState.nodes) return;
  const nodes = perspectiveStudioState.nodes;
  const topNodes = perspectiveStudioState.topNodes || nodes.map(p => ({ x: p.x, y: p.y - 80 }));
  const isBox = perspectiveStudioState.mode === 'cube';
  const hov = perspectiveStudioState.hoveredHandle;

  const scrNodes = nodes.map(p => worldToScreen(p.x, p.y));
  const scrTopNodes = topNodes.map(p => worldToScreen(p.x, p.y));

  ctx.save();

  // 1. Horizon Line & Vanishing Rays Guides
  if (perspectiveStudioState.showHorizonRays) {
    const vpTop = getVanishingPoint(nodes[3], nodes[0], nodes[2], nodes[1]);   // Depth / vertical vanishing point
    const vpSide = getVanishingPoint(nodes[0], nodes[1], nodes[3], nodes[2]);  // Side / horizontal vanishing point

    ctx.save();
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.55)'; // Cyan horizon
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);

    if (vpSide) {
      const scrVp = worldToScreen(vpSide.x, vpSide.y);
      // Draw horizon line through side vanishing point
      ctx.beginPath();
      ctx.moveTo(0, scrVp.y);
      ctx.lineTo(ctx.canvas.width, scrVp.y);
      ctx.stroke();

      // Rays to all 4 corners
      scrNodes.forEach(sn => {
        ctx.beginPath();
        ctx.moveTo(scrVp.x, scrVp.y);
        ctx.lineTo(sn.x, sn.y);
        ctx.stroke();
      });
    }

    if (vpTop) {
      const scrVp = worldToScreen(vpTop.x, vpTop.y);
      scrNodes.forEach(sn => {
        ctx.beginPath();
        ctx.moveTo(scrVp.x, scrVp.y);
        ctx.lineTo(sn.x, sn.y);
        ctx.stroke();
      });
    }
    ctx.restore();
  }

  // 2. Highlight Hovered Edge
  if (hov && hov.type && hov.type.includes('edge')) {
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    const next = (hov.index + 1) % 4;
    ctx.moveTo(scrNodes[hov.index].x, scrNodes[hov.index].y);
    ctx.lineTo(scrNodes[next].x, scrNodes[next].y);
    ctx.stroke();
    ctx.restore();
  }

  // 3. Base 4 Corner Handles
  scrNodes.forEach((sn, idx) => {
    const isHovered = hov && hov.type === 'node' && hov.index === idx;
    ctx.save();
    ctx.fillStyle = isHovered ? '#ffedd5' : '#f97316';
    ctx.strokeStyle = isHovered ? '#f97316' : '#ffffff';
    ctx.lineWidth = isHovered ? 3.5 : 2.5;
    ctx.shadowColor = 'rgba(249, 115, 22, 0.6)';
    ctx.shadowBlur = isHovered ? 12 : 4;
    ctx.beginPath();
    ctx.arc(sn.x, sn.y, isHovered ? 8.5 : 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });

  // 4. 3D Cube Top Handles & Extrusion Arrow
  if (isBox) {
    scrTopNodes.forEach((stn, idx) => {
      const isHovered = hov && hov.type === 'top-node' && hov.index === idx;
      ctx.save();
      ctx.fillStyle = isHovered ? '#e0f2fe' : '#0284c7';
      ctx.strokeStyle = isHovered ? '#38bdf8' : '#ffffff';
      ctx.lineWidth = isHovered ? 3.5 : 2.5;
      ctx.beginPath();
      ctx.arc(stn.x, stn.y, isHovered ? 8.5 : 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    const topCenterWorld = {
      x: (topNodes[0].x + topNodes[1].x + topNodes[2].x + topNodes[3].x) / 4,
      y: (topNodes[0].y + topNodes[1].y + topNodes[2].y + topNodes[3].y) / 4,
    };
    const scrTopCenter = worldToScreen(topCenterWorld.x, topCenterWorld.y);
    const centerWorld = {
      x: (nodes[0].x + nodes[1].x + nodes[2].x + nodes[3].x) / 4,
      y: (nodes[0].y + nodes[1].y + nodes[2].y + nodes[3].y) / 4,
    };
    const scrCenter = worldToScreen(centerWorld.x, centerWorld.y);

    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(scrCenter.x, scrCenter.y);
    ctx.lineTo(scrTopCenter.x, scrTopCenter.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = hov?.type === 'extrude' ? '#38bdf8' : '#0284c7';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(scrTopCenter.x, scrTopCenter.y, hov?.type === 'extrude' ? 9 : 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
  updateFloatingActionBarPosition();
}

/**
 * Single-Action Shape Commit
 */
export async function commitPerspectiveShape() {
  if (!perspectiveStudioState.active || !perspectiveStudioState.nodes) return;
  const frame = currentFrame();
  if (!frame) return;

  const isPixelSpace = state.engineMode === 'pixel' || state.currentTool === 'pixel-shape';

  if (isPixelSpace) {
    // Pixel Space: Bake directly to canvas tiles
    const allPoints = [
      ...perspectiveStudioState.nodes,
      ...(perspectiveStudioState.topNodes || [])
    ];
    const minX = Math.min(...allPoints.map(p => p.x));
    const maxX = Math.max(...allPoints.map(p => p.x));
    const minY = Math.min(...allPoints.map(p => p.y));
    const maxY = Math.max(...allPoints.map(p => p.y));
    const pad = Math.max(12, (state.toolSettings.size || 3) * 2 + 16);

    const rx = Math.floor(minX - pad);
    const ry = Math.floor(minY - pad);
    const rw = Math.max(2, Math.ceil(maxX - minX + pad * 2));
    const rh = Math.max(2, Math.ceil(maxY - minY + pad * 2));

    const canvas = document.createElement('canvas');
    canvas.width = rw;
    canvas.height = rh;
    const ctx = canvas.getContext('2d');
    ctx.translate(-rx, -ry);

    drawPerspectiveShape(ctx, perspectiveStudioState);

    await commitRasterBlit(frame, state.activeLayerId, canvas, rx, ry, 'source-over', 1.0);
    cancelPerspectiveStudio();
    requestRender();
    showToast('Baked Perspective Shape into Pixel Canvas!');
    return;
  }

  // Vector Space: Record single AddStrokeCommand
  const strokeData = {
    id: `persp_rect_${Date.now()}`,
    tool: 'shape',
    isPerspectiveShape: true,
    mode: perspectiveStudioState.mode,
    cubeVisibility: perspectiveStudioState.cubeVisibility,
    nodes: perspectiveStudioState.nodes.map(p => ({ ...p })),
    topNodes: perspectiveStudioState.topNodes ? perspectiveStudioState.topNodes.map(p => ({ ...p })) : null,
    extrusionHeight: perspectiveStudioState.extrusionHeight,
    showGrid: perspectiveStudioState.showGrid,
    subdivisions: perspectiveStudioState.subdivisions,
    showDiagonals: perspectiveStudioState.showDiagonals,
    textureImage: perspectiveStudioState.textureImage,
    textureName: perspectiveStudioState.textureName,
    settings: { ...state.toolSettings },
  };

  await commandManager.execute(
    new AddStrokeCommand(frame.id, state.activeLayerId, strokeData)
  );

  cancelPerspectiveStudio();
  requestRender();
  showToast('Committed Perspective Shape (1-Step Undo with Ctrl+Z)');
}

export function cancelPerspectiveStudio() {
  perspectiveStudioState.active = false;
  perspectiveStudioState.nodes = null;
  perspectiveStudioState.topNodes = null;
  perspectiveStudioState.draggingHandle = null;
  perspectiveStudioState.hoveredHandle = null;
  removeFloatingActionBar();
  requestRender();
}

/**
 * Draws shape geometry with perspective grid
 */
export function drawPerspectiveShape(ctx, shape) {
  const nodes = shape.nodes;
  if (!nodes || nodes.length !== 4) return;

  const st = shape.settings || state.toolSettings;
  const strokeColor = st.color || '#1e293b';
  const fillColor = st.shapeMode === 'both' ? (st.secondaryColor || '#ffffff') : strokeColor;
  const strokeWidth = st.size || 2;
  const opacity = st.opacity !== undefined ? st.opacity : 1.0;
  const isFilled = st.shapeMode === 'fill' || st.shapeMode === 'both';
  const hasStroke = st.shapeMode === 'stroke' || st.shapeMode === 'both';
  const isBox = shape.mode === 'cube';

  const extH = shape.extrusionHeight || 80;
  const topNodes = shape.topNodes || nodes.map(p => ({ x: p.x, y: p.y - extH }));
  const cubeVis = shape.cubeVisibility || 'shaded3';

  ctx.save();

  // 1. 2D QUAD PLANE
  if (!isBox) {
    if (shape.textureImage) {
      ctx.save();
      ctx.globalAlpha = opacity;
      drawPerspectiveImage(ctx, shape.textureImage, nodes, 10);
      ctx.restore();
    } else if (isFilled) {
      ctx.fillStyle = hexToRgba(fillColor, opacity * 0.9);
      ctx.beginPath();
      ctx.moveTo(nodes[0].x, nodes[0].y);
      ctx.lineTo(nodes[1].x, nodes[1].y);
      ctx.lineTo(nodes[2].x, nodes[2].y);
      ctx.lineTo(nodes[3].x, nodes[3].y);
      ctx.closePath();
      ctx.fill();
    }

    // Perspective Grid (Converging floor/wall tiles)
    if (shape.showGrid !== false && (shape.subdivisions || 1) > 1) {
      const subs = shape.subdivisions || 3;
      ctx.save();
      ctx.strokeStyle = hexToRgba(strokeColor, opacity * 0.45);
      ctx.lineWidth = Math.max(0.5, strokeWidth * 0.55);
      ctx.setLineDash([3, 2]);

      // Depth perspective lines
      for (let i = 1; i < subs; i++) {
        const u = i / subs;
        const pT = evaluateBilinearPoint(nodes, u, 0);
        const pB = evaluateBilinearPoint(nodes, u, 1);
        ctx.beginPath(); ctx.moveTo(pT.x, pT.y); ctx.lineTo(pB.x, pB.y); ctx.stroke();
      }
      // Transversal perspective lines
      for (let j = 1; j < subs; j++) {
        const v = j / subs;
        const pL = evaluateBilinearPoint(nodes, 0, v);
        const pR = evaluateBilinearPoint(nodes, 1, v);
        ctx.beginPath(); ctx.moveTo(pL.x, pL.y); ctx.lineTo(pR.x, pR.y); ctx.stroke();
      }
      ctx.restore();
    }

    if (hasStroke) {
      ctx.strokeStyle = hexToRgba(strokeColor, opacity);
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(nodes[0].x, nodes[0].y);
      ctx.lineTo(nodes[1].x, nodes[1].y);
      ctx.lineTo(nodes[2].x, nodes[2].y);
      ctx.lineTo(nodes[3].x, nodes[3].y);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  // 2. 3D CUBE
  const faces = [
    { name: 'bottom', pts: [nodes[3], nodes[2], nodes[1], nodes[0]], tint: 0.5 },
    { name: 'top',    pts: [topNodes[0], topNodes[1], topNodes[2], topNodes[3]], tint: 1.0 },
    { name: 'front',  pts: [nodes[3], nodes[2], topNodes[2], topNodes[3]], tint: 0.75 },
    { name: 'right',  pts: [nodes[2], nodes[1], topNodes[1], topNodes[2]], tint: 0.60 },
    { name: 'back',   pts: [nodes[1], nodes[0], topNodes[0], topNodes[1]], tint: 0.45 },
    { name: 'left',   pts: [nodes[0], nodes[3], topNodes[3], topNodes[0]], tint: 0.85 },
  ];

  faces.forEach(f => {
    f.area = signedPolygonArea(f.pts);
    f.isVisible = f.area > 0;
  });

  if (cubeVis === 'shaded3') {
    faces.filter(f => f.isVisible).forEach(face => {
      if (isFilled) {
        ctx.fillStyle = hexToRgba(fillColor, opacity * face.tint);
        ctx.beginPath();
        ctx.moveTo(face.pts[0].x, face.pts[0].y);
        for (let i = 1; i < face.pts.length; i++) ctx.lineTo(face.pts[i].x, face.pts[i].y);
        ctx.closePath();
        ctx.fill();
      }
      if (hasStroke) {
        ctx.strokeStyle = hexToRgba(strokeColor, opacity);
        ctx.lineWidth = strokeWidth;
        ctx.beginPath();
        ctx.moveTo(face.pts[0].x, face.pts[0].y);
        for (let i = 1; i < face.pts.length; i++) ctx.lineTo(face.pts[i].x, face.pts[i].y);
        ctx.closePath();
        ctx.stroke();
      }
    });
  }

  ctx.restore();
}

/**
 * Sleek Micro-Action HUD:
 * - Direct single-click commit
 * - Interactive smart trajectory extenders (Top/Bottom/Left/Right)
 * - Grid and Horizon toggles
 */
function renderFloatingActionBar() {
  let tb = document.getElementById('persp-floating-bar');
  if (!tb && (elements.canvasContainer || document.getElementById('studio-canvas-container'))) {
    const container = elements.canvasContainer || document.getElementById('studio-canvas-container');
    tb = document.createElement('div');
    tb.id = 'persp-floating-bar';
    tb.className = 'absolute z-50 bg-slate-950/95 backdrop-blur-md border border-slate-700/80 rounded-full py-1 px-2 flex items-center gap-1.5 shadow-2xl select-none pointer-events-auto ring-1 ring-white/10 transition-[opacity,transform] duration-75';
    container.appendChild(tb);

    // CRITICAL: Stop event bubbling to eliminate pointer capture double-click bug
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evt => {
      tb.addEventListener(evt, (e) => e.stopPropagation());
    });
  }
  if (!tb) return;

  const showGrid = perspectiveStudioState.showGrid;
  const showRays = perspectiveStudioState.showHorizonRays;

  tb.innerHTML = `
    <!-- Fast 1-Click Commit Button -->
    <button id="btn-persp-commit" title="Commit Shape (Enter)" class="h-6 px-3 rounded-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold text-[11px] flex items-center gap-1 shadow-sm transition cursor-pointer">
      <svg class="w-3.5 h-3.5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
      <span>Commit</span>
    </button>

    <div class="h-4 w-px bg-slate-800"></div>

    <!-- Perspective Grid Toggle -->
    <button id="btn-persp-toggle-grid" title="Toggle Perspective Grid inside Quad" class="h-6 px-2 rounded-full text-[10px] font-semibold border transition cursor-pointer flex items-center gap-1 ${
      showGrid ? 'bg-orange-500/20 text-orange-300 border-orange-500/60' : 'bg-slate-900 text-slate-400 border-slate-700'
    }">
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16M6 4v16M12 4v16M18 4v16"/></svg>
      <span>Grid</span>
    </button>

    <!-- Horizon Line & Rays Toggle -->
    <button id="btn-persp-toggle-rays" title="Toggle Horizon Line & Vanishing Rays" class="h-6 px-2 rounded-full text-[10px] font-semibold border transition cursor-pointer flex items-center gap-1 ${
      showRays ? 'bg-sky-500/20 text-sky-300 border-sky-500/60' : 'bg-slate-900 text-slate-400 border-slate-700'
    }">
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2 12h3m14 0h3M12 2v3m0 14v3"/></svg>
      <span>Horizon</span>
    </button>

    <div class="h-4 w-px bg-slate-800"></div>

    <!-- Smart Trajectory Extenders -->
    <div class="flex items-center gap-0.5 bg-slate-900/90 p-0.5 rounded-full border border-slate-800" title="Smart Perspective Extenders (Extends along trajectory)">
      <button id="btn-ext-top" title="Extend Top (Narrows into distance)" class="w-5 h-5 rounded-full hover:bg-slate-800 text-[10px] font-mono font-bold text-slate-300 hover:text-orange-400">▲</button>
      <button id="btn-ext-bottom" title="Extend Bottom (Opens wider)" class="w-5 h-5 rounded-full hover:bg-slate-800 text-[10px] font-mono font-bold text-slate-300 hover:text-orange-400">▼</button>
      <button id="btn-ext-left" title="Extend Left along perspective" class="w-5 h-5 rounded-full hover:bg-slate-800 text-[10px] font-mono font-bold text-slate-300 hover:text-orange-400">◄</button>
      <button id="btn-ext-right" title="Extend Right along perspective" class="w-5 h-5 rounded-full hover:bg-slate-800 text-[10px] font-mono font-bold text-slate-300 hover:text-orange-400">►</button>
    </div>

    <!-- Reset 90° Flat -->
    <button id="btn-persp-flat" title="Reset to Flat 90° Rectangle" class="w-6 h-6 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition active:scale-95 cursor-pointer">
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
    </button>

    <!-- Discard / Cancel -->
    <button id="btn-persp-cancel" title="Discard (Esc)" class="w-6 h-6 rounded-full bg-slate-900 hover:bg-rose-950/80 hover:text-rose-300 text-slate-400 flex items-center justify-center transition active:scale-95 cursor-pointer">
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>
  `;

  // Instant 1-Click Listeners
  tb.querySelector('#btn-persp-commit')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    commitPerspectiveShape();
  });

  tb.querySelector('#btn-persp-toggle-grid')?.addEventListener('click', (e) => {
    e.stopPropagation();
    perspectiveStudioState.showGrid = !perspectiveStudioState.showGrid;
    renderFloatingActionBar();
    requestRender();
  });

  tb.querySelector('#btn-persp-toggle-rays')?.addEventListener('click', (e) => {
    e.stopPropagation();
    perspectiveStudioState.showHorizonRays = !perspectiveStudioState.showHorizonRays;
    renderFloatingActionBar();
    requestRender();
  });

  tb.querySelector('#btn-ext-top')?.addEventListener('click', (e) => {
    e.stopPropagation();
    extendPerspectiveTrajectory('top', 0.15);
  });
  tb.querySelector('#btn-ext-bottom')?.addEventListener('click', (e) => {
    e.stopPropagation();
    extendPerspectiveTrajectory('bottom', 0.15);
  });
  tb.querySelector('#btn-ext-left')?.addEventListener('click', (e) => {
    e.stopPropagation();
    extendPerspectiveTrajectory('left', 0.15);
  });
  tb.querySelector('#btn-ext-right')?.addEventListener('click', (e) => {
    e.stopPropagation();
    extendPerspectiveTrajectory('right', 0.15);
  });

  tb.querySelector('#btn-persp-flat')?.addEventListener('click', (e) => {
    e.stopPropagation();
    resetPerspectiveToFlat();
  });

  tb.querySelector('#btn-persp-cancel')?.addEventListener('click', (e) => {
    e.stopPropagation();
    cancelPerspectiveStudio();
  });
}

export function updateFloatingActionBarPosition() {
  const tb = document.getElementById('persp-floating-bar');
  if (!tb || !perspectiveStudioState.active || !perspectiveStudioState.nodes) return;
  const container = elements.canvasContainer || document.getElementById('studio-canvas-container');
  if (!container) return;

  const allPoints = [
    ...perspectiveStudioState.nodes,
    ...(perspectiveStudioState.topNodes || [])
  ];

  const scrPoints = allPoints.map(p => worldToScreen(p.x, p.y));
  const maxY = Math.max(...scrPoints.map(p => p.y));
  const minY = Math.min(...scrPoints.map(p => p.y));
  const minX = Math.min(...scrPoints.map(p => p.x));
  const maxX = Math.max(...scrPoints.map(p => p.x));
  const centerX = (minX + maxX) / 2;

  const containerRect = container.getBoundingClientRect();
  const tbW = tb.offsetWidth || 230;
  const tbH = tb.offsetHeight || 30;

  let targetX = centerX;
  let targetY = maxY + 14;

  if (targetY + tbH > containerRect.height - 20) {
    targetY = Math.max(12, minY - tbH - 12);
  }

  const halfW = tbW / 2;
  if (targetX - halfW < 12) targetX = halfW + 12;
  else if (targetX + halfW > containerRect.width - 12) targetX = containerRect.width - halfW - 12;

  tb.style.left = `${targetX}px`;
  tb.style.top = `${targetY}px`;
  tb.style.transform = 'translate(-50%, 0)';
}

function removeFloatingActionBar() {
  document.getElementById('persp-floating-bar')?.remove();
}

/**
 * Hard Reset: Completely purges any active perspective session,
 * killing any ghost cubes across new projects or frame changes.
 */
export function hardResetPerspectiveStudio() {
  perspectiveStudioState.active = false;
  perspectiveStudioState.nodes = null;
  perspectiveStudioState.topNodes = null;
  perspectiveStudioState.draggingHandle = null;
  perspectiveStudioState.hoveredHandle = null;
  removeFloatingActionBar();
  requestRender();
}

