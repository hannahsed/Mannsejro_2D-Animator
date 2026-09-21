// src/js/viewport/polygonStudio.js
import { state, currentFrame } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { worldToScreen, screenToWorld } from './camera.js';
import { requestRender } from '../render/renderEngine.js';
import { saveHistoryState } from '../project/history.js';
import { showToast } from '../ui/toast.js';
import { hexToRgba } from '../colorUtils.js';
import { commandManager, AddStrokeCommand } from '../project/commandManager.js';
import { commitRasterBlit } from '../render/rasterPaint.js';

export const polygonStudioState = {
  active: false,
  nodes: [], // Array<{x: number, y: number}>
  mouseWorld: null,
  hoveredStartNode: false,
};

export function startPolygonStudio(startWorldPt) {
  polygonStudioState.active = true;
  polygonStudioState.nodes = [{ x: startWorldPt.x, y: startWorldPt.y }];
  polygonStudioState.mouseWorld = { x: startWorldPt.x, y: startWorldPt.y };
  polygonStudioState.hoveredStartNode = false;
  renderPolygonHUD();
  updatePolygonHUDPosition();
  requestRender();
}

export function addPolygonVertex(worldPt) {
  if (!polygonStudioState.active) {
    startPolygonStudio(worldPt);
    return;
  }

  const nodes = polygonStudioState.nodes;
  // If clicked within 14px of first node and we have at least 3 vertices, close and commit
  if (nodes.length >= 3) {
    const p0Screen = worldToScreen(nodes[0].x, nodes[0].y);
    const clickScreen = worldToScreen(worldPt.x, worldPt.y);
    if (Math.hypot(clickScreen.x - p0Screen.x, clickScreen.y - p0Screen.y) <= 14) {
      closeAndCommitPolygon();
      return;
    }
  }

  // Prevent duplicate consecutive points
  const last = nodes[nodes.length - 1];
  if (Math.hypot(worldPt.x - last.x, worldPt.y - last.y) > 0.8) {
    nodes.push({ x: worldPt.x, y: worldPt.y });
    renderPolygonHUD();
    updatePolygonHUDPosition();
    requestRender();
  }
}

export function updatePolygonCursor(worldPt) {
  if (!polygonStudioState.active) return;
  polygonStudioState.mouseWorld = { x: worldPt.x, y: worldPt.y };
  
  // Check if hovering near origin node
  if (polygonStudioState.nodes.length >= 3) {
    const p0 = polygonStudioState.nodes[0];
    const p0Screen = worldToScreen(p0.x, p0.y);
    const curScreen = worldToScreen(worldPt.x, worldPt.y);
    polygonStudioState.hoveredStartNode = Math.hypot(curScreen.x - p0Screen.x, curScreen.y - p0Screen.y) <= 14;
  } else {
    polygonStudioState.hoveredStartNode = false;
  }

  updatePolygonHUDPosition();
  requestRender();
}

export function popLastPolygonVertex() {
  if (!polygonStudioState.active || polygonStudioState.nodes.length === 0) return;
  polygonStudioState.nodes.pop();
  if (polygonStudioState.nodes.length === 0) {
    cancelPolygonStudio();
  } else {
    renderPolygonHUD();
    updatePolygonHUDPosition();
    requestRender();
    showToast('Removed last vertex');
  }
}

export async function closeAndCommitPolygon() {
  if (!polygonStudioState.active || polygonStudioState.nodes.length < 3) {
    showToast('A polygon requires at least 3 vertices');
    return;
  }

  const frame = currentFrame();
  if (!frame) return;

  const pts = polygonStudioState.nodes.map(p => ({ ...p }));
  const isPixelSpace = state.engineMode === 'pixel' || state.currentTool === 'pixel-shape';
  const st = state.toolSettings;
  const strokeWidth = st.size || 2;
  const strokeColor = st.color || '#1e293b';
  const fillColor = st.shapeMode === 'both' ? (st.secondaryColor || '#ffffff') : strokeColor;
  const opacity = st.opacity !== undefined ? st.opacity : 1.0;
  const isFilled = st.shapeMode === 'fill' || st.shapeMode === 'both';
  const hasStroke = st.shapeMode === 'stroke' || st.shapeMode === 'both';

  if (isPixelSpace) {
    const minX = Math.min(...pts.map(p => p.x));
    const maxX = Math.max(...pts.map(p => p.x));
    const minY = Math.min(...pts.map(p => p.y));
    const maxY = Math.max(...pts.map(p => p.y));
    const pad = Math.max(10, strokeWidth * 2 + 12);

    const rx = Math.floor(minX - pad);
    const ry = Math.floor(minY - pad);
    const rw = Math.max(2, Math.ceil(maxX - minX + pad * 2));
    const rh = Math.max(2, Math.ceil(maxY - minY + pad * 2));

    const canvas = document.createElement('canvas');
    canvas.width = rw;
    canvas.height = rh;
    const ctx = canvas.getContext('2d');
    ctx.translate(-rx, -ry);

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();

    if (isFilled) {
      ctx.fillStyle = hexToRgba(fillColor, opacity);
      ctx.fill();
    }
    if (hasStroke) {
      ctx.strokeStyle = hexToRgba(strokeColor, opacity);
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    await commitRasterBlit(frame, state.activeLayerId, canvas, rx, ry, 'source-over', 1.0);
    cancelPolygonStudio();
    requestRender();
    showToast(`Baked Polygon (${pts.length} points) onto canvas`);
    return;
  }

  const strokeData = {
    id: `poly_${Date.now()}`,
    tool: 'shape',
    isShape: true,
    isPolygon: true,
    shapeType: 'polygon',
    points: pts,
    settings: { ...state.toolSettings, shapeType: 'polygon' },
  };

  await commandManager.execute(
    new AddStrokeCommand(frame.id, state.activeLayerId, strokeData)
  );

  cancelPolygonStudio();
  requestRender();
  showToast(`Committed Vector Polygon (${pts.length} points)`);
}

export function cancelPolygonStudio() {
  polygonStudioState.active = false;
  polygonStudioState.nodes = [];
  polygonStudioState.mouseWorld = null;
  polygonStudioState.hoveredStartNode = false;
  document.getElementById('polygon-floating-bar')?.remove();
  requestRender();
}

/**
 * Draws a committed polygon onto canvas
 */
export function drawPolygonShape(ctx, stroke) {
  const pts = stroke.points;
  if (!pts || pts.length < 3) return;

  const st = stroke.settings || state.toolSettings;
  const strokeColor = st.color || '#1e293b';
  const fillColor = st.shapeMode === 'both' ? (st.secondaryColor || '#ffffff') : strokeColor;
  const strokeWidth = st.size || 2;
  const opacity = st.opacity !== undefined ? st.opacity : 1.0;
  const isFilled = st.shapeMode === 'fill' || st.shapeMode === 'both';
  const hasStroke = st.shapeMode === 'stroke' || st.shapeMode === 'both';

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (st.strokeDash === 'dashed') ctx.setLineDash([strokeWidth * 3, strokeWidth * 2]);
  else if (st.strokeDash === 'dotted') ctx.setLineDash([strokeWidth, strokeWidth * 1.5]);
  else ctx.setLineDash([]);

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();

  if (isFilled) {
    ctx.fillStyle = hexToRgba(fillColor, opacity);
    ctx.fill();
  }
  if (hasStroke) {
    ctx.strokeStyle = hexToRgba(strokeColor, opacity);
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Renders in-progress polygon, vertices, and rubber-band line
 */
export function renderActivePolygonOverlay(ctx) {
  if (!polygonStudioState.active || polygonStudioState.nodes.length === 0) return;

  const nodes = polygonStudioState.nodes;
  const cur = polygonStudioState.mouseWorld;
  const zoom = state.zoom || 1;

  ctx.save();

  // 1. Semi-transparent fill preview if >= 2 points
  if (nodes.length >= 2 && cur) {
    ctx.fillStyle = hexToRgba(state.toolSettings.secondaryColor || '#f97316', 0.15);
    ctx.beginPath();
    ctx.moveTo(nodes[0].x, nodes[0].y);
    for (let i = 1; i < nodes.length; i++) ctx.lineTo(nodes[i].x, nodes[i].y);
    ctx.lineTo(cur.x, cur.y);
    ctx.closePath();
    ctx.fill();
  }

  // 2. Connected perimeter lines
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 2 / zoom;
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(nodes[0].x, nodes[0].y);
  for (let i = 1; i < nodes.length; i++) ctx.lineTo(nodes[i].x, nodes[i].y);
  ctx.stroke();

  // 3. Dynamic rubber-band line to cursor
  if (cur) {
    ctx.setLineDash([4 / zoom, 4 / zoom]);
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.85)';
    ctx.beginPath();
    ctx.moveTo(nodes[nodes.length - 1].x, nodes[nodes.length - 1].y);
    ctx.lineTo(cur.x, cur.y);
    ctx.stroke();

    // Closing indicator back to origin
    if (nodes.length >= 3) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.beginPath();
      ctx.moveTo(cur.x, cur.y);
      ctx.lineTo(nodes[0].x, nodes[0].y);
      ctx.stroke();
    }
  }

  // 4. Render vertex points (Handles)
  nodes.forEach((node, i) => {
    const scr = worldToScreen(node.x, node.y);
    const isFirst = i === 0;
    const isHovered = isFirst && polygonStudioState.hoveredStartNode;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    ctx.fillStyle = isFirst ? (isHovered ? '#38bdf8' : '#10b981') : '#f97316';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, isFirst ? (isHovered ? 8 : 6.5) : 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Node index badge
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${i + 1}`, scr.x, scr.y - 10);
    ctx.restore();
  });

  ctx.restore();
  updatePolygonHUDPosition();
}

function renderPolygonHUD() {
  let tb = document.getElementById('polygon-floating-bar');
  if (!tb && (elements.canvasContainer || document.getElementById('studio-canvas-container'))) {
    const container = elements.canvasContainer || document.getElementById('studio-canvas-container');
    tb = document.createElement('div');
    tb.id = 'polygon-floating-bar';
    tb.className = 'absolute z-50 bg-slate-950/95 backdrop-blur-md border border-slate-700/80 rounded-full py-1 px-2.5 flex items-center gap-2 shadow-2xl text-xs select-none pointer-events-auto ring-1 ring-white/10';
    container.appendChild(tb);

    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evt => {
      tb.addEventListener(evt, (e) => e.stopPropagation());
    });
  }
  if (!tb) return;

  const count = polygonStudioState.nodes.length;

  tb.innerHTML = `
    <span class="text-[11px] font-bold text-slate-200 flex items-center gap-1.5 font-mono">
      <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
      <span>${count} Node${count === 1 ? '' : 's'}</span>
    </span>

    <div class="h-4 w-px bg-slate-800"></div>

    <button id="btn-poly-commit" title="Close Polygon and Commit (Enter or Double-click)" class="h-6 px-3 rounded-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold text-[11px] flex items-center gap-1 shadow-sm transition cursor-pointer">
      <svg class="w-3.5 h-3.5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
      <span>Close Shape</span>
    </button>

    <button id="btn-poly-undo-pt" title="Undo Last Point (Backspace)" class="h-6 px-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition cursor-pointer">
      ↩ Undo Node
    </button>

    <button id="btn-poly-cancel" title="Cancel (Esc)" class="w-6 h-6 rounded-full bg-slate-800 hover:bg-rose-950/80 hover:text-rose-300 text-slate-400 flex items-center justify-center text-[10px] transition cursor-pointer">
      ✕
    </button>
  `;

  tb.querySelector('#btn-poly-commit')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAndCommitPolygon();
  });
  tb.querySelector('#btn-poly-undo-pt')?.addEventListener('click', (e) => {
    e.stopPropagation();
    popLastPolygonVertex();
  });
  tb.querySelector('#btn-poly-cancel')?.addEventListener('click', (e) => {
    e.stopPropagation();
    cancelPolygonStudio();
  });
}

function updatePolygonHUDPosition() {
  const tb = document.getElementById('polygon-floating-bar');
  if (!tb || !polygonStudioState.active || polygonStudioState.nodes.length === 0) return;
  const container = elements.canvasContainer || document.getElementById('studio-canvas-container');
  if (!container) return;

  const scrPoints = polygonStudioState.nodes.map(p => worldToScreen(p.x, p.y));
  const maxY = Math.max(...scrPoints.map(p => p.y));
  const minX = Math.min(...scrPoints.map(p => p.x));
  const maxX = Math.max(...scrPoints.map(p => p.x));
  const centerX = (minX + maxX) / 2;

  const containerRect = container.getBoundingClientRect();
  const tbW = tb.offsetWidth || 230;
  const tbH = tb.offsetHeight || 30;

  let targetX = centerX;
  let targetY = maxY + 16;

  if (targetY + tbH > containerRect.height - 20) {
    const minY = Math.min(...scrPoints.map(p => p.y));
    targetY = Math.max(12, minY - tbH - 12);
  }

  const halfW = tbW / 2;
  if (targetX - halfW < 12) targetX = halfW + 12;
  else if (targetX + halfW > containerRect.width - 12) targetX = containerRect.width - halfW - 12;

  tb.style.left = `${targetX}px`;
  tb.style.top = `${targetY}px`;
  tb.style.transform = 'translate(-50%, 0)';
}
