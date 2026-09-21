// src/js/viewport/polygonTool.js
import { state, currentFrame } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { worldToScreen, screenToWorld } from './camera.js';
import { requestRender } from '../render/renderEngine.js';
import { showToast } from '../ui/toast.js';
import { hexToRgba } from '../colorUtils.js';
import { commandManager, AddStrokeCommand } from '../project/commandManager.js';
import { commitRasterBlit } from '../render/rasterPaint.js';

export const polygonToolState = {
  active: false,
  points: [],             // Array of world points [{x, y}]
  hoveredStartNode: false,
};

export function startPolygonTool(startWorldPt) {
  polygonToolState.active = true;
  polygonToolState.points = [{ x: startWorldPt.x, y: startWorldPt.y }];
  polygonToolState.hoveredStartNode = false;
  renderPolygonHUD();
  updatePolygonHUDPosition();
  requestRender();
}

export function addPolygonPoint(worldPt) {
  if (!polygonToolState.active) return;
  const pts = polygonToolState.points;

  // Prevent duplicate clicks in rapid succession
  const last = pts[pts.length - 1];
  if (last && Math.hypot(worldPt.x - last.x, worldPt.y - last.y) < 3) return;

  pts.push({ x: worldPt.x, y: worldPt.y });
  renderPolygonHUD();
  updatePolygonHUDPosition();
  requestRender();
}

export function removeLastPolygonPoint() {
  if (!polygonToolState.active || polygonToolState.points.length <= 1) return;
  polygonToolState.points.pop();
  renderPolygonHUD();
  updatePolygonHUDPosition();
  requestRender();
}

export function cancelPolygonTool() {
  polygonToolState.active = false;
  polygonToolState.points = [];
  polygonToolState.hoveredStartNode = false;
  document.getElementById('polygon-floating-bar')?.remove();
  requestRender();
}

/**
 * Commits the completed polygon
 */
export async function commitPolygonShape() {
  if (!polygonToolState.active || polygonToolState.points.length < 3) {
    showToast('A polygon needs at least 3 points', 'error');
    return;
  }
  const frame = currentFrame();
  if (!frame) return;

  const pts = [...polygonToolState.points];
  const isPixelSpace = state.engineMode === 'pixel' || state.currentTool === 'pixel-shape';
  const st = state.toolSettings;
  const strokeWidth = st.size || 2;
  const strokeColor = st.color || '#1e293b';
  const fillColor = st.shapeMode === 'both' ? (st.secondaryColor || '#ffffff') : strokeColor;
  const opacity = st.opacity !== undefined ? st.opacity : 1.0;
  const isFilled = st.shapeMode === 'fill' || st.shapeMode === 'both';
  const hasStroke = st.shapeMode === 'stroke' || st.shapeMode === 'both';

  if (isPixelSpace) {
    // Pixel Space: Bake directly to tiles
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
    cancelPolygonTool();
    requestRender();
    showToast(`Baked Polygon (${pts.length} points) onto canvas`);
    return;
  }

  // Vector Space: Record vector stroke
  const strokeData = {
    id: `polygon_${Date.now()}`,
    tool: 'shape',
    isShape: true,
    shapeType: 'polygon',
    points: pts,
    settings: { ...state.toolSettings, shapeType: 'polygon' },
  };

  await commandManager.execute(
    new AddStrokeCommand(frame.id, state.activeLayerId, strokeData)
  );

  cancelPolygonTool();
  requestRender();
  showToast(`Committed Vector Polygon (${pts.length} points)`);
}

/**
 * Draws active polygon during point placement with numbered nodes and rubber-band line
 */
export function drawActivePolygon(ctx) {
  if (!polygonToolState.active || polygonToolState.points.length === 0) return;
  const pts = polygonToolState.points;
  const lastWorld = state.lastPointerWorld;
  const st = state.toolSettings;
  const strokeColor = st.color || '#f97316';
  const size = st.size || 2;

  ctx.save();
  const scrPts = pts.map(p => worldToScreen(p.x, p.y));

  // 1. Placed Segments
  ctx.beginPath();
  ctx.moveTo(scrPts[0].x, scrPts[0].y);
  for (let i = 1; i < scrPts.length; i++) {
    ctx.lineTo(scrPts[i].x, scrPts[i].y);
  }
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = Math.max(1.5, size * state.zoom);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  // 2. Dynamic Elastic Rubber-band Guide to Mouse Cursor
  if (lastWorld) {
    const scrLast = worldToScreen(lastWorld.x, lastWorld.y);
    const lastNode = scrPts[scrPts.length - 1];

    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(lastNode.x, lastNode.y);
    ctx.lineTo(scrLast.x, scrLast.y);
    ctx.stroke();
    ctx.restore();
  }

  // 3. Numbered Nodes with Snap Indicator on Node 0
  scrPts.forEach((sp, idx) => {
    const isFirst = idx === 0;
    const isHovered = isFirst && polygonToolState.hoveredStartNode;

    ctx.save();
    ctx.fillStyle = isFirst ? (isHovered ? '#38bdf8' : '#10b981') : '#f97316';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, isHovered ? 8 : 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Node index badge
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${idx + 1}`, sp.x, sp.y - 10);
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

  const count = polygonToolState.points.length;

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
    commitPolygonShape();
  });
  tb.querySelector('#btn-poly-undo-pt')?.addEventListener('click', (e) => {
    e.stopPropagation();
    removeLastPolygonPoint();
  });
  tb.querySelector('#btn-poly-cancel')?.addEventListener('click', (e) => {
    e.stopPropagation();
    cancelPolygonTool();
  });
}

function updatePolygonHUDPosition() {
  const tb = document.getElementById('polygon-floating-bar');
  if (!tb || !polygonToolState.active || polygonToolState.points.length === 0) return;
  const container = elements.canvasContainer || document.getElementById('studio-canvas-container');
  if (!container) return;

  const scrPoints = polygonToolState.points.map(p => worldToScreen(p.x, p.y));
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
