// src/js/viewport/selectTool.js
/**
 * PROFESSIONAL VECTOR & OBJECT SELECTION TOOL
 * - Click or box marquee to select vector strokes, shapes, props, and node graphs.
 * - 8-point bounding box for scaling, rotation handle, and body translation.
 * - Double-click selected node paths to edit their vertex points directly.
 * - Delete (Del), Duplicate (Ctrl+D), Select All (Ctrl+A), and Flip (H/V) support.
 */
import { state, currentFrame } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { worldToScreen, screenToWorld } from './camera.js';
import { requestRender } from '../render/renderEngine.js';
import { saveHistoryState } from '../project/history.js';
import { showToast } from '../ui/toast.js';
import { commandManager, SnapshotCommand } from '../project/commandManager.js';

export const selectToolState = {
  active: false,
  selectedStrokeIds: new Set(),
  marqueeStart: null,
  marqueeCurrent: null,
  draggingHandle: null, // 'move', 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rot'
  dragStartPointer: null,
  dragSnapshots: null,
  bounds: null, // { minX, minY, maxX, maxY, cx, cy, w, h, width, height }
};

export function clearSelection() {
  selectToolState.selectedStrokeIds.clear();
  selectToolState.bounds = null;
  selectToolState.draggingHandle = null;
  selectToolState.marqueeStart = null;
  selectToolState.marqueeCurrent = null;
  requestRender();
}

/**
 * Selects all vector strokes on the current active layer
 */
export function selectAllStrokes() {
  const frame = currentFrame();
  const lData = frame?.layerData[state.activeLayerId];
  if (!lData?.strokes || lData.strokes.length === 0) {
    showToast('No vector strokes on active layer to select');
    return;
  }
  selectToolState.selectedStrokeIds.clear();
  lData.strokes.forEach(s => selectToolState.selectedStrokeIds.add(s.id));
  updateSelectionBounds();
  requestRender();
  showToast(`Selected all ${lData.strokes.length} strokes on active layer`);
}

/**
 * Calculates world-space axis-aligned bounding box of selected items
 */
export function updateSelectionBounds() {
  const frame = currentFrame();
  if (!frame || selectToolState.selectedStrokeIds.size === 0) {
    selectToolState.bounds = null;
    return;
  }

  const lData = frame.layerData[state.activeLayerId];
  if (!lData?.strokes) {
    selectToolState.bounds = null;
    return;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let count = 0;

  for (const s of lData.strokes) {
    if (!selectToolState.selectedStrokeIds.has(s.id)) continue;
    count++;

    if (s.isStampProp && s.center) {
      const halfSize = (s.settings?.size || 48) / 2;
      minX = Math.min(minX, s.center.x - halfSize);
      minY = Math.min(minY, s.center.y - halfSize);
      maxX = Math.max(maxX, s.center.x + halfSize);
      maxY = Math.max(maxY, s.center.y + halfSize);
    }

    const pts = s.points || s.nodes || (s.shapeData ? [s.shapeData.start, s.shapeData.end] : []);
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    if (s.topNodes) {
      for (const p of s.topNodes) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }
  }

  if (count === 0 || !isFinite(minX)) {
    selectToolState.bounds = null;
  } else {
    const w = Math.max(2, maxX - minX);
    const h = Math.max(2, maxY - minY);
    selectToolState.bounds = {
      minX, minY, maxX, maxY,
      w, h,
      width: w,
      height: h,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
    };
  }
}

/**
 * Hit test a single stroke under pointer
 */
export function hitTestStrokes(worldX, worldY, tolerance = 12) {
  const frame = currentFrame();
  if (!frame) return null;
  const lData = frame.layerData[state.activeLayerId];
  if (!lData?.strokes) return null;

  const tol = tolerance / (state.zoom || 1);

  // Search in reverse (topmost strokes first)
  for (let i = lData.strokes.length - 1; i >= 0; i--) {
    const s = lData.strokes[i];

    if (s.isStampProp && s.center) {
      const radius = Math.max(tol, (s.settings?.size || 48) / 2);
      if (Math.hypot(worldX - s.center.x, worldY - s.center.y) <= radius) {
        return s.id;
      }
    }

    const pts = s.points || s.nodes || (s.shapeData ? [s.shapeData.start, s.shapeData.end] : []);
    
    // Check points and segment proximity
    for (let j = 0; j < pts.length; j++) {
      if (Math.hypot(worldX - pts[j].x, worldY - pts[j].y) <= tol) return s.id;
      if (j < pts.length - 1) {
        if (distToSegmentWorld(worldX, worldY, pts[j].x, pts[j].y, pts[j+1].x, pts[j+1].y) <= tol) {
          return s.id;
        }
      }
    }

    if (s.topNodes) {
      for (let j = 0; j < s.topNodes.length; j++) {
        if (Math.hypot(worldX - s.topNodes[j].x, worldY - s.topNodes[j].y) <= tol) return s.id;
      }
    }
  }
  return null;
}

function distToSegmentWorld(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Hit test handles of active selection bounding box
 */
export function hitTestSelectionHandles(screenX, screenY) {
  const b = selectToolState.bounds;
  if (!b || selectToolState.selectedStrokeIds.size === 0) return null;

  const tl = worldToScreen(b.minX, b.minY);
  const br = worldToScreen(b.maxX, b.maxY);
  const cx = (tl.x + br.x) / 2;
  const cy = (tl.y + br.y) / 2;

  // Rotation Handle
  const rotY = tl.y - 24;
  if (Math.hypot(screenX - cx, screenY - rotY) <= 10) {
    return 'rot';
  }

  // 8 Handles
  const handles = [
    { type: 'nw', x: tl.x, y: tl.y },
    { type: 'n',  x: cx,   y: tl.y },
    { type: 'ne', x: br.x, y: tl.y },
    { type: 'e',  x: br.x, y: cy },
    { type: 'se', x: br.x, y: br.y },
    { type: 's',  x: cx,   y: br.y },
    { type: 'sw', x: tl.x, y: br.y },
    { type: 'w',  x: tl.x, y: cy },
  ];

  for (const h of handles) {
    if (Math.hypot(screenX - h.x, screenY - h.y) <= 8) {
      return h.type;
    }
  }

  // Inside Bounding Box (Move body)
  if (screenX >= tl.x && screenX <= br.x && screenY >= tl.y && screenY <= br.y) {
    return 'move';
  }

  return null;
}

/**
 * Capture snapshot of selected stroke coordinates before drag
 */
export function beginSelectionDrag(currentWorld, handle = 'move') {
  selectToolState.draggingHandle = handle;
  selectToolState.dragStartPointer = { ...currentWorld };

  const frame = currentFrame();
  const lData = frame?.layerData[state.activeLayerId];
  if (!lData?.strokes) return;

  selectToolState.dragSnapshots = lData.strokes
    .filter(s => selectToolState.selectedStrokeIds.has(s.id))
    .map(s => {
      const pts = s.points || s.nodes || (s.shapeData ? [s.shapeData.start, s.shapeData.end] : []);
      return {
        id: s.id,
        points: pts.map(p => ({ x: p.x, y: p.y })),
        topNodes: s.topNodes ? s.topNodes.map(p => ({ x: p.x, y: p.y })) : null,
        center: s.center ? { x: s.center.x, y: s.center.y } : null,
      };
    });
}

/**
 * Handle Dragging of Selection (Move, Scale, Rotate)
 */
export function handleSelectDrag(currentWorld, e) {
  const handle = selectToolState.draggingHandle;
  const b = selectToolState.bounds;
  const snaps = selectToolState.dragSnapshots;
  if (!handle || !b || !snaps) return;

  const dx = currentWorld.x - selectToolState.dragStartPointer.x;
  const dy = currentWorld.y - selectToolState.dragStartPointer.y;

  const frame = currentFrame();
  const lData = frame?.layerData[state.activeLayerId];
  if (!lData?.strokes) return;

  if (handle === 'move') {
    for (const snap of snaps) {
      const stroke = lData.strokes.find(s => s.id === snap.id);
      if (!stroke) continue;
      const pts = stroke.points || stroke.nodes || (stroke.shapeData ? [stroke.shapeData.start, stroke.shapeData.end] : []);
      for (let i = 0; i < pts.length && i < snap.points.length; i++) {
        pts[i].x = snap.points[i].x + dx;
        pts[i].y = snap.points[i].y + dy;
      }
      if (stroke.topNodes && snap.topNodes) {
        for (let i = 0; i < stroke.topNodes.length && i < snap.topNodes.length; i++) {
          stroke.topNodes[i].x = snap.topNodes[i].x + dx;
          stroke.topNodes[i].y = snap.topNodes[i].y + dy;
        }
      }
      if (stroke.center && snap.center) {
        stroke.center.x = snap.center.x + dx;
        stroke.center.y = snap.center.y + dy;
      }
    }
  } else if (handle === 'rot') {
    // Rotation around selection center
    const startAngle = Math.atan2(selectToolState.dragStartPointer.y - b.cy, selectToolState.dragStartPointer.x - b.cx);
    const curAngle = Math.atan2(currentWorld.y - b.cy, currentWorld.x - b.cx);
    let deltaAngle = curAngle - startAngle;

    if (e?.shiftKey) {
      // Snap to 15-degree steps
      deltaAngle = Math.round(deltaAngle / (Math.PI / 12)) * (Math.PI / 12);
    }

    const cos = Math.cos(deltaAngle);
    const sin = Math.sin(deltaAngle);

    for (const snap of snaps) {
      const stroke = lData.strokes.find(s => s.id === snap.id);
      if (!stroke) continue;
      const pts = stroke.points || stroke.nodes || (stroke.shapeData ? [stroke.shapeData.start, stroke.shapeData.end] : []);
      for (let i = 0; i < pts.length && i < snap.points.length; i++) {
        const ox = snap.points[i].x - b.cx;
        const oy = snap.points[i].y - b.cy;
        pts[i].x = b.cx + ox * cos - oy * sin;
        pts[i].y = b.cy + ox * sin + oy * cos;
      }
      if (stroke.topNodes && snap.topNodes) {
        for (let i = 0; i < stroke.topNodes.length && i < snap.topNodes.length; i++) {
          const ox = snap.topNodes[i].x - b.cx;
          const oy = snap.topNodes[i].y - b.cy;
          stroke.topNodes[i].x = b.cx + ox * cos - oy * sin;
          stroke.topNodes[i].y = b.cy + ox * sin + oy * cos;
        }
      }
      if (stroke.center && snap.center) {
        const ox = snap.center.x - b.cx;
        const oy = snap.center.y - b.cy;
        stroke.center.x = b.cx + ox * cos - oy * sin;
        stroke.center.y = b.cy + ox * sin + oy * cos;
      }
    }
  } else {
    // Scaling handles ('nw', 'ne', 'se', 'sw', etc.)
    const startW = b.w || 10;
    const startH = b.h || 10;
    let scaleX = 1;
    let scaleY = 1;

    if (handle.includes('e')) scaleX = (startW + dx) / startW;
    if (handle.includes('w')) scaleX = (startW - dx) / startW;
    if (handle.includes('s')) scaleY = (startH + dy) / startH;
    if (handle.includes('n')) scaleY = (startH - dy) / startH;

    if (e?.shiftKey) {
      // Uniform aspect ratio scale
      const avg = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
      scaleX = scaleX < 0 ? -avg : avg;
      scaleY = scaleY < 0 ? -avg : avg;
    }

    for (const snap of snaps) {
      const stroke = lData.strokes.find(s => s.id === snap.id);
      if (!stroke) continue;
      const pts = stroke.points || stroke.nodes || (stroke.shapeData ? [stroke.shapeData.start, stroke.shapeData.end] : []);
      for (let i = 0; i < pts.length && i < snap.points.length; i++) {
        const ox = snap.points[i].x - b.cx;
        const oy = snap.points[i].y - b.cy;
        pts[i].x = b.cx + ox * scaleX;
        pts[i].y = b.cy + oy * scaleY;
      }
      if (stroke.topNodes && snap.topNodes) {
        for (let i = 0; i < stroke.topNodes.length && i < snap.topNodes.length; i++) {
          const ox = snap.topNodes[i].x - b.cx;
          const oy = snap.topNodes[i].y - b.cy;
          stroke.topNodes[i].x = b.cx + ox * scaleX;
          stroke.topNodes[i].y = b.cy + oy * scaleY;
        }
      }
      if (stroke.center && snap.center) {
        const ox = snap.center.x - b.cx;
        const oy = snap.center.y - b.cy;
        stroke.center.x = b.cx + ox * scaleX;
        stroke.center.y = b.cy + oy * scaleY;
      }
    }
  }

  updateSelectionBounds();
  requestRender();
}

/**
 * Finish Drag and Record History
 */
export async function finishSelectionDrag() {
  if (selectToolState.draggingHandle && selectToolState.dragSnapshots) {
    saveHistoryState();
  }
  selectToolState.draggingHandle = null;
  selectToolState.dragSnapshots = null;
  selectToolState.dragStartPointer = null;
  updateSelectionBounds();
  requestRender();
}

/**
 * Flips selected strokes horizontally or vertically around selection center
 */
export function flipSelectedStrokes(direction = 'horizontal') {
  if (selectToolState.selectedStrokeIds.size === 0) return;
  const frame = currentFrame();
  const lData = frame?.layerData[state.activeLayerId];
  if (!lData?.strokes) return;
  updateSelectionBounds();
  const b = selectToolState.bounds;
  if (!b) return;

  for (const s of lData.strokes) {
    if (!selectToolState.selectedStrokeIds.has(s.id)) continue;
    const pts = s.points || s.nodes || (s.shapeData ? [s.shapeData.start, s.shapeData.end] : []);
    for (const p of pts) {
      if (direction === 'horizontal') {
        p.x = b.cx - (p.x - b.cx);
      } else {
        p.y = b.cy - (p.y - b.cy);
      }
    }
    if (s.topNodes) {
      for (const p of s.topNodes) {
        if (direction === 'horizontal') {
          p.x = b.cx - (p.x - b.cx);
        } else {
          p.y = b.cy - (p.y - b.cy);
        }
      }
    }
    if (s.center) {
      if (direction === 'horizontal') s.center.x = b.cx - (s.center.x - b.cx);
      else s.center.y = b.cy - (s.center.y - b.cy);
    }
  }
  updateSelectionBounds();
  saveHistoryState();
  requestRender();
  showToast(`Flipped selection ${direction === 'horizontal' ? 'horizontally' : 'vertically'}`);
}

/**
 * Delete Selected Strokes
 */
export async function deleteSelectedStrokes() {
  if (selectToolState.selectedStrokeIds.size === 0) return;
  const frame = currentFrame();
  const lData = frame?.layerData[state.activeLayerId];
  if (!lData?.strokes) return;

  const count = selectToolState.selectedStrokeIds.size;
  lData.strokes = lData.strokes.filter(s => !selectToolState.selectedStrokeIds.has(s.id));
  clearSelection();
  saveHistoryState();
  requestRender();
  showToast(`Deleted ${count} selected item${count === 1 ? '' : 's'}`);
}

/**
 * Duplicate Selected Strokes
 */
export async function duplicateSelectedStrokes() {
  if (selectToolState.selectedStrokeIds.size === 0) return;
  const frame = currentFrame();
  const lData = frame?.layerData[state.activeLayerId];
  if (!lData?.strokes) return;

  const newSelection = new Set();
  const toAdd = [];

  for (const s of lData.strokes) {
    if (!selectToolState.selectedStrokeIds.has(s.id)) continue;
    const clone = JSON.parse(JSON.stringify(s));
    clone.id = `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    
    // Offset slightly for visual feedback
    const pts = clone.points || clone.nodes || (clone.shapeData ? [clone.shapeData.start, clone.shapeData.end] : []);
    pts.forEach(p => {
      p.x += 16;
      p.y += 16;
    });
    if (clone.topNodes) {
      clone.topNodes.forEach(p => {
        p.x += 16;
        p.y += 16;
      });
    }
    if (clone.center) {
      clone.center.x += 16;
      clone.center.y += 16;
    }

    toAdd.push(clone);
    newSelection.add(clone.id);
  }

  lData.strokes.push(...toAdd);
  selectToolState.selectedStrokeIds = newSelection;
  updateSelectionBounds();
  saveHistoryState();
  requestRender();
  showToast(`Duplicated ${toAdd.length} selected item${toAdd.length === 1 ? '' : 's'}`);
}

/**
 * Renders selection bounding box, transform handles, and rotation anchor
 */
export function drawSelectionOverlay(ctx) {
  // 1. Box Marquee while dragging selection box
  if (selectToolState.marqueeStart && selectToolState.marqueeCurrent) {
    const s0 = worldToScreen(selectToolState.marqueeStart.x, selectToolState.marqueeStart.y);
    const s1 = worldToScreen(selectToolState.marqueeCurrent.x, selectToolState.marqueeCurrent.y);
    const mx = Math.min(s0.x, s1.x);
    const my = Math.min(s0.y, s1.y);
    const mw = Math.abs(s1.x - s0.x);
    const mh = Math.abs(s1.y - s0.y);

    ctx.save();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(mx, my, mw, mh);
    ctx.restore();
  }

  const b = selectToolState.bounds;
  if (!b || selectToolState.selectedStrokeIds.size === 0) return;

  const tl = worldToScreen(b.minX, b.minY);
  const br = worldToScreen(b.maxX, b.maxY);
  const w = br.x - tl.x;
  const h = br.y - tl.y;
  const cx = tl.x + w / 2;
  const cy = tl.y + h / 2;

  ctx.save();

  // Bounding box dashed outline
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(tl.x, tl.y, w, h);
  ctx.setLineDash([]);

  // Corner and edge handles
  const handles = [
    { x: tl.x, y: tl.y },         // NW
    { x: cx, y: tl.y },           // N
    { x: br.x, y: tl.y },         // NE
    { x: br.x, y: cy },           // E
    { x: br.x, y: br.y },         // SE
    { x: cx, y: br.y },           // S
    { x: tl.x, y: br.y },         // SW
    { x: tl.x, y: cy },           // W
  ];

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 1.75;

  handles.forEach(hPt => {
    ctx.fillRect(hPt.x - 4, hPt.y - 4, 8, 8);
    ctx.strokeRect(hPt.x - 4, hPt.y - 4, 8, 8);
  });

  // Rotation Handle at Top
  const rotY = tl.y - 24;
  ctx.beginPath();
  ctx.moveTo(cx, tl.y);
  ctx.lineTo(cx, rotY);
  ctx.strokeStyle = '#38bdf8';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, rotY, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#f97316';
  ctx.strokeStyle = '#ffffff';
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}
