// src/js/viewport/nodeTool.js
import { state, currentFrame } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { worldToScreen, screenToWorld } from './camera.js';
import { requestRender } from '../render/renderEngine.js';
import { showToast } from '../ui/toast.js';
import { hexToRgba } from '../colorUtils.js';
import { commandManager, AddStrokeCommand } from '../project/commandManager.js';
import { commitRasterBlit } from '../render/rasterPaint.js';

export const nodeToolState = {
  active: false,
  nodes: [],               // Array of { id: number, x: number, y: number }
  edges: [],               // Array of { from: number, to: number } (node IDs)
  activeNodeId: null,      // ID of the active RED node
  hoveredNodeId: null,     // ID of node under cursor
  draggingNodeId: null,    // ID of node currently being dragged
  dragStartPointer: null,
  dragNodeSnapshot: null,
  lastClickTime: 0,
};

let nextNodeId = 1;

/**
 * Starts the Node Tool session with the first RED node
 */
export function startNodeTool(startWorldPt) {
  nodeToolState.active = true;
  nextNodeId = 1;
  const firstNode = { id: nextNodeId++, x: startWorldPt.x, y: startWorldPt.y };
  nodeToolState.nodes = [firstNode];
  nodeToolState.edges = [];
  nodeToolState.activeNodeId = firstNode.id; // First node is active (RED)
  nodeToolState.hoveredNodeId = null;
  nodeToolState.draggingNodeId = null;

  renderNodeToolHUD();
  updateNodeToolHUDPosition();
  requestRender();
}

/**
 * Adds a new node and connects it to the active RED node
 */
export function addNodeFromActive(worldPt) {
  if (!nodeToolState.active) {
    startNodeTool(worldPt);
    return;
  }

  const activeNode = getActiveNode();
  if (!activeNode) return;

  // Deduplicate accidental zero-distance rapid clicks
  if (Math.hypot(worldPt.x - activeNode.x, worldPt.y - activeNode.y) < 4) return;

  const newNode = { id: nextNodeId++, x: worldPt.x, y: worldPt.y };
  nodeToolState.nodes.push(newNode);

  // Connect edge from the RED node to the new node
  nodeToolState.edges.push({ from: activeNode.id, to: newNode.id });

  // New node becomes the active RED node; previous becomes BLUE
  nodeToolState.activeNodeId = newNode.id;

  renderNodeToolHUD();
  updateNodeToolHUDPosition();
  requestRender();
}

/**
 * Switches the active RED node to an existing node
 */
export function setActiveNode(nodeId) {
  if (!nodeToolState.active) return;
  const target = nodeToolState.nodes.find(n => n.id === nodeId);
  if (target) {
    nodeToolState.activeNodeId = target.id;
    renderNodeToolHUD();
    updateNodeToolHUDPosition();
    requestRender();
    showToast(`Node #${target.id} is now Active (RED) — lines will extend from here`);
  }
}

/**
 * Connects an edge between the active RED node and an existing BLUE node
 */
export function connectActiveToNode(targetNodeId) {
  const activeNode = getActiveNode();
  if (!activeNode || activeNode.id === targetNodeId) return;

  // Avoid duplicate edges
  const exists = nodeToolState.edges.some(
    e => (e.from === activeNode.id && e.to === targetNodeId) ||
         (e.from === targetNodeId && e.to === activeNode.id)
  );

  if (!exists) {
    nodeToolState.edges.push({ from: activeNode.id, to: targetNodeId });
    nodeToolState.activeNodeId = targetNodeId; // Transfer active state to target
    renderNodeToolHUD();
    updateNodeToolHUDPosition();
    requestRender();
  }
}

export function getActiveNode() {
  return nodeToolState.nodes.find(n => n.id === nodeToolState.activeNodeId) || null;
}

/**
 * Hit-test node under mouse cursor
 */
export function hitTestNode(clientX, clientY) {
  if (!nodeToolState.active || nodeToolState.nodes.length === 0) return null;
  const container = elements.canvasContainer || document.getElementById('studio-canvas-container');
  if (!container) return null;

  const rect = container.getBoundingClientRect();
  const screenX = clientX - rect.left;
  const screenY = clientY - rect.top;

  for (const node of nodeToolState.nodes) {
    const scr = worldToScreen(node.x, node.y);
    if (Math.hypot(screenX - scr.x, screenY - scr.y) <= 14) {
      return node.id;
    }
  }
  return null;
}

/**
 * Removes the currently active RED node and falls back to previous node
 */
export function removeActiveNode() {
  if (!nodeToolState.active || nodeToolState.nodes.length === 0) return;
  const currentId = nodeToolState.activeNodeId;

  // Remove node
  nodeToolState.nodes = nodeToolState.nodes.filter(n => n.id !== currentId);
  // Remove connected edges
  nodeToolState.edges = nodeToolState.edges.filter(e => e.from !== currentId && e.to !== currentId);

  if (nodeToolState.nodes.length > 0) {
    // Make the last remaining node active (RED)
    nodeToolState.activeNodeId = nodeToolState.nodes[nodeToolState.nodes.length - 1].id;
  } else {
    cancelNodeTool();
    return;
  }

  renderNodeToolHUD();
  updateNodeToolHUDPosition();
  requestRender();
}

export function updateNodeCurveMode(mode = 'linear') {
  state.toolSettings.curveMode = mode; // 'linear' | 'bezier'
  requestRender();
}

/**
 * Closes the polygon loop, connects back to Node #1, and commits shape with optional fill
 */
export async function closeAndMergeLoop() {
  if (!nodeToolState.active || nodeToolState.nodes.length < 3) {
    showToast('Need at least 3 nodes to close a loop', 'error');
    return;
  }
  const firstId = nodeToolState.nodes[0].id;
  const activeId = nodeToolState.activeNodeId;

  // Add closing edge if not already present
  const exists = nodeToolState.edges.some(
    e => (e.from === activeId && e.to === firstId) || (e.from === firstId && e.to === activeId)
  );
  if (!exists) {
    nodeToolState.edges.push({ from: activeId, to: firstId });
  }

  await commitNodeTool();
  showToast('Closed loop and committed shape!');
}

/**
 * Commits the completed node network (ends without closing unless explicitly closed)
 */
export async function commitNodeTool() {
  if (!nodeToolState.active || nodeToolState.nodes.length === 0) return;
  const frame = currentFrame();
  if (!frame) return;

  const nodes = [...nodeToolState.nodes];
  const edges = [...nodeToolState.edges];
  const isPixelSpace = state.engineMode === 'pixel' || state.currentTool === 'pixel-shape';
  const st = state.toolSettings;
  const strokeWidth = st.size || 2;
  const strokeColor = st.color || '#1e293b';
  const opacity = st.opacity !== undefined ? st.opacity : 1.0;

  if (isPixelSpace) {
    // PIXEL SPACE: Bake graph directly into 512px canvas tiles
    const minX = Math.min(...nodes.map(n => n.x));
    const maxX = Math.max(...nodes.map(n => n.x));
    const minY = Math.min(...nodes.map(n => n.y));
    const maxY = Math.max(...nodes.map(n => n.y));
    const pad = Math.max(12, strokeWidth * 2 + 16);

    const rx = Math.floor(minX - pad);
    const ry = Math.floor(minY - pad);
    const rw = Math.max(2, Math.ceil(maxX - minX + pad * 2));
    const rh = Math.max(2, Math.ceil(maxY - minY + pad * 2));

    const canvas = document.createElement('canvas');
    canvas.width = rw;
    canvas.height = rh;
    const ctx = canvas.getContext('2d');
    ctx.translate(-rx, -ry);

    renderNodeNetworkToContext(ctx, nodes, edges, st);

    await commitRasterBlit(frame, state.activeLayerId, canvas, rx, ry, 'source-over', 1.0);
    cancelNodeTool();
    requestRender();
    showToast(`Baked Node Graph (${nodes.length} nodes, ${edges.length} lines) onto canvas`);
    return;
  }

  // VECTOR SPACE: Record vector stroke object
  const strokeData = {
    id: `node_graph_${Date.now()}`,
    tool: 'node-tool',
    isNodePath: true,
    nodes,
    edges,
    settings: { ...state.toolSettings },
  };

  await commandManager.execute(
    new AddStrokeCommand(frame.id, state.activeLayerId, strokeData)
  );

  cancelNodeTool();
  requestRender();
  showToast(`Committed Vector Path (${nodes.length} nodes, ${edges.length} lines)`);
}

export function cancelNodeTool() {
  nodeToolState.active = false;
  nodeToolState.nodes = [];
  nodeToolState.edges = [];
  nodeToolState.activeNodeId = null;
  nodeToolState.hoveredNodeId = null;
  nodeToolState.draggingNodeId = null;
  document.getElementById('node-tool-floating-bar')?.remove();
  requestRender();
}

/**
 * Draws smooth spline connecting sequential nodes
 */
function drawSplinePath(ctx, pointList, isClosed = false) {
  if (pointList.length < 2) return;
  if (pointList.length === 2) {
    ctx.beginPath();
    ctx.moveTo(pointList[0].x, pointList[0].y);
    ctx.lineTo(pointList[1].x, pointList[1].y);
    ctx.stroke();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(pointList[0].x, pointList[0].y);
  for (let i = 0; i < pointList.length - 1; i++) {
    const p0 = pointList[i === 0 ? 0 : i - 1];
    const p1 = pointList[i];
    const p2 = pointList[i + 1];
    const p3 = pointList[i + 2 < pointList.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
  if (isClosed) {
    ctx.closePath();
  }
  ctx.stroke();
}

/**
 * Draws the active node network with Red (Active) vs Blue (Inactive) color coding
 */
export function drawActiveNodeTool(ctx) {
  if (!nodeToolState.active || nodeToolState.nodes.length === 0) return;
  const nodes = nodeToolState.nodes;
  const edges = nodeToolState.edges;
  const activeNode = getActiveNode();
  const lastWorld = state.lastPointerWorld;
  const st = state.toolSettings;
  const strokeColor = st.color || '#f97316';
  const size = Math.max(1, st.size || 2);
  const isBezier = st.curveMode === 'bezier';

  ctx.save();

  // 1. Placed Edges / Lines
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = Math.max(1.5, size * state.zoom);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (isBezier && nodes.length >= 2) {
    const screenPts = nodes.map(n => worldToScreen(n.x, n.y));
    drawSplinePath(ctx, screenPts);
  } else {
    edges.forEach(edge => {
      const fromNode = nodes.find(n => n.id === edge.from);
      const toNode = nodes.find(n => n.id === edge.to);
      if (fromNode && toNode) {
        const scrFrom = worldToScreen(fromNode.x, fromNode.y);
        const scrTo = worldToScreen(toNode.x, toNode.y);
        ctx.beginPath();
        ctx.moveTo(scrFrom.x, scrFrom.y);
        ctx.lineTo(scrTo.x, scrTo.y);
        ctx.stroke();
      }
    });
  }

  // 2. Dynamic Elastic Rubber-band Guide from Active RED Node to Cursor
  if (activeNode && lastWorld && !nodeToolState.draggingNodeId) {
    const scrActive = worldToScreen(activeNode.x, activeNode.y);
    const scrCursor = worldToScreen(lastWorld.x, lastWorld.y);

    ctx.save();
    ctx.strokeStyle = '#ef4444'; // Red dashed lead
    ctx.lineWidth = 1.75;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(scrActive.x, scrActive.y);
    ctx.lineTo(scrCursor.x, scrCursor.y);
    ctx.stroke();
    ctx.restore();
  }

  // 3. Nodes (Red = Active, Blue = Inactive)
  nodes.forEach(node => {
    const isActive = node.id === nodeToolState.activeNodeId;
    const isHovered = node.id === nodeToolState.hoveredNodeId;
    const scr = worldToScreen(node.x, node.y);

    ctx.save();
    if (isActive) {
      // ACTIVE NODE: RED with pulsing focus ring
      ctx.fillStyle = '#ef4444';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = 'rgba(239, 68, 68, 0.7)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, isHovered ? 8.5 : 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Outer target halo
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, 13, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // INACTIVE NODE: BLUE
      ctx.fillStyle = '#3b82f6';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(59, 130, 246, 0.5)';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, isHovered ? 8 : 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Node ID Badge
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${node.id}`, scr.x, scr.y - 12);
    ctx.restore();
  });

  ctx.restore();
  updateNodeToolHUDPosition();
}

/**
 * Renders committed node graph onto canvas context
 */
export function renderNodeNetworkToContext(ctx, nodes, edges, settings = {}) {
  if (!nodes || nodes.length === 0 || !edges) return;
  const strokeColor = settings.color || '#1e293b';
  const strokeWidth = settings.size || 2;
  const opacity = settings.opacity !== undefined ? settings.opacity : 1.0;
  const isBezier = settings.curveMode === 'bezier';

  ctx.save();
  ctx.strokeStyle = hexToRgba(strokeColor, opacity);
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (isBezier && nodes.length >= 2) {
    drawSplinePath(ctx, nodes);
  } else {
    edges.forEach(edge => {
      const fromNode = nodes.find(n => n.id === edge.from);
      const toNode = nodes.find(n => n.id === edge.to);
      if (fromNode && toNode) {
        ctx.beginPath();
        ctx.moveTo(fromNode.x, fromNode.y);
        ctx.lineTo(toNode.x, toNode.y);
        ctx.stroke();
      }
    });
  }
  ctx.restore();
}

/**
 * Compact Floating Action HUD
 */
function renderNodeToolHUD() {
  let tb = document.getElementById('node-tool-floating-bar');
  if (!tb && (elements.canvasContainer || document.getElementById('studio-canvas-container'))) {
    const container = elements.canvasContainer || document.getElementById('studio-canvas-container');
    tb = document.createElement('div');
    tb.id = 'node-tool-floating-bar';
    tb.className = 'absolute z-50 bg-slate-950/95 backdrop-blur-md border border-slate-700/80 rounded-full py-1 px-2.5 flex items-center gap-2 shadow-2xl text-xs select-none pointer-events-auto ring-1 ring-white/10';
    container.appendChild(tb);

    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evt => {
      tb.addEventListener(evt, e => e.stopPropagation());
    });
  }
  if (!tb) return;

  const activeNode = getActiveNode();
  const total = nodeToolState.nodes.length;

  tb.innerHTML = `
    <!-- Active Node Indicator -->
    <span class="text-[11px] font-bold text-slate-200 flex items-center gap-1.5 font-mono">
      <span class="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse"></span>
      <span>Active: Node #${activeNode ? activeNode.id : '?'}</span>
      <span class="text-[10px] text-slate-500">(${total} total)</span>
    </span>

    <div class="h-4 w-px bg-slate-800"></div>

    <!-- 1-Click Finish Path (Enter / Dbl-Click) -->
    <button id="btn-node-tool-commit" title="Finish Path without closing (Enter or Dbl-Click)" class="h-6 px-3 rounded-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold text-[11px] flex items-center gap-1 shadow-sm transition cursor-pointer">
      <svg class="w-3.5 h-3.5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
      <span>Finish Path</span>
    </button>

    <!-- Connect / Close Loop Button -->
    <button id="btn-node-tool-close-loop" title="Close Loop back to Node #1 and bake shape" class="h-6 px-2.5 rounded-full bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/40 text-[11px] font-semibold transition cursor-pointer">
      Close Loop
    </button>

    <!-- Curve Mode Toggle -->
    <button id="btn-node-tool-curve-mode" title="Toggle between Straight Lines and Smooth Curves" class="h-6 px-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium transition cursor-pointer">
      ${state.toolSettings.curveMode === 'bezier' ? '〰 Curves' : '╱ Lines'}
    </button>

    <!-- Delete Current Node -->
    <button id="btn-node-tool-del-node" title="Delete current active node (Del / Backspace)" class="h-6 px-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-medium transition cursor-pointer">
      ↩ Del Node
    </button>

    <!-- Cancel / Discard -->
    <button id="btn-node-tool-cancel" title="Discard Path (Esc)" class="w-6 h-6 rounded-full bg-slate-800 hover:bg-rose-950/80 hover:text-rose-300 text-slate-400 flex items-center justify-center text-[10px] transition cursor-pointer">
      ✕
    </button>
  `;

  tb.querySelector('#btn-node-tool-commit')?.addEventListener('click', e => {
    e.stopPropagation();
    commitNodeTool();
  });
  tb.querySelector('#btn-node-tool-close-loop')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (nodeToolState.nodes.length >= 3) {
      await closeAndMergeLoop();
    } else if (nodeToolState.nodes.length === 2) {
      connectActiveToNode(nodeToolState.nodes[0].id);
    }
  });
  tb.querySelector('#btn-node-tool-curve-mode')?.addEventListener('click', e => {
    e.stopPropagation();
    const nextMode = state.toolSettings.curveMode === 'bezier' ? 'linear' : 'bezier';
    updateNodeCurveMode(nextMode);
    renderNodeToolHUD();
    showToast(`Node mode: ${nextMode === 'bezier' ? 'Smooth Bézier Curves' : 'Straight Lines'}`);
  });
  tb.querySelector('#btn-node-tool-del-node')?.addEventListener('click', e => {
    e.stopPropagation();
    removeActiveNode();
  });
  tb.querySelector('#btn-node-tool-cancel')?.addEventListener('click', e => {
    e.stopPropagation();
    cancelNodeTool();
  });
}

export function updateNodeToolHUDPosition() {
  const tb = document.getElementById('node-tool-floating-bar');
  if (!tb || !nodeToolState.active || nodeToolState.nodes.length === 0) return;
  const container = elements.canvasContainer || document.getElementById('studio-canvas-container');
  if (!container) return;

  const scrPoints = nodeToolState.nodes.map(p => worldToScreen(p.x, p.y));
  const maxY = Math.max(...scrPoints.map(p => p.y));
  const minX = Math.min(...scrPoints.map(p => p.x));
  const maxX = Math.max(...scrPoints.map(p => p.x));
  const centerX = (minX + maxX) / 2;

  const containerRect = container.getBoundingClientRect();
  const tbW = tb.offsetWidth || 280;
  const tbH = tb.offsetHeight || 30;

  let targetX = centerX;
  let targetY = maxY + 18;

  if (targetY + tbH > containerRect.height - 20) {
    const minY = Math.min(...scrPoints.map(p => p.y));
    targetY = Math.max(12, minY - tbH - 14);
  }

  const halfW = tbW / 2;
  if (targetX - halfW < 12) targetX = halfW + 12;
  else if (targetX + halfW > containerRect.width - 12) targetX = containerRect.width - halfW - 12;

  tb.style.left = `${targetX}px`;
  tb.style.top = `${targetY}px`;
  tb.style.transform = 'translate(-50%, 0)';
}
