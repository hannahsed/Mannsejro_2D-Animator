// src/js/events/canvasEvents.js
import { state, currentFrame } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { screenToWorld, zoomAtPointer } from '../viewport/camera.js';
import { updateBrushCursorPosition, adjustBrushSize } from '../viewport/brushCursor.js';
import { clearStrokePreview, renderStrokePreview, commitStrokeToTiles } from '../render/strokeRenderer.js';
import { requestRender } from '../render/renderEngine.js';
import { renderTimelineFilmstrip } from '../timeline/filmstrip.js';
import { scheduleAutosave } from '../project/autosave.js';
import { saveHistoryState } from '../project/history.js';
import { commandManager, AddStrokeCommand } from '../project/commandManager.js';
import { commitRasterBlit } from '../render/rasterPaint.js';
import { drawShape } from '../canvasUtils.js';
import { showToast } from '../ui/toast.js';
import { dualStabilizer } from '../viewport/dualStabilizer.js';
import { StylusHardwareEngine } from '../viewport/stylusHardware.js';
import {
  perspectiveStudioState,
  hitTestPerspectiveHandle,
  handlePerspectiveDrag,
  startPerspectiveRectangle,
  commitPerspectiveShape,
  cancelPerspectiveStudio
} from '../viewport/perspectiveRectangleStudio.js';
import {
  polygonStudioState,
  addPolygonVertex,
  updatePolygonCursor,
  closeAndCommitPolygon,
  cancelPolygonStudio
} from '../viewport/polygonStudio.js';
import {
  nodeToolState,
  startNodeTool,
  addNodeFromActive,
  setActiveNode,
  connectActiveToNode,
  commitNodeTool,
  cancelNodeTool,
  hitTestNode
} from '../viewport/nodeTool.js';
import {
  selectToolState,
  clearSelection,
  updateSelectionBounds,
  hitTestStrokes,
  hitTestSelectionHandles,
  beginSelectionDrag,
  handleSelectDrag,
  finishSelectionDrag,
} from '../viewport/selectTool.js';
import { paintScatterProp, paintStampProp } from '../render/propsLibrary.js';

export function getStrokePressure(e, lastPt, currentPt) {
  if (!state.toolSettings.pressure) return 1;

  let raw = 0.75;
  if (e.pointerType === 'pen' && typeof e.pressure === 'number' && e.pressure > 0) {
    raw = Math.min(1, Math.max(0.02, e.pressure));
  } else if (lastPt && currentPt) {
    const dist = Math.hypot(currentPt.x - lastPt.x, currentPt.y - lastPt.y);
    const speed = Math.min(60, dist);
    raw = Math.max(0.2, 1.15 - (speed / 60) * 0.55);
  }

  const gamma = state.toolSettings.pressureCurve ?? 0.8;
  return Math.pow(raw, gamma);
}

export async function commitShapeToStorage(shapeType, p1, p2, shiftKey, isPixelSpace) {
  const frame = currentFrame();
  if (!frame) return;

  let x1 = p1.x;
  let y1 = p1.y;
  let x2 = p2.x;
  let y2 = p2.y;
  let dx = x2 - x1;
  let dy = y2 - y1;

  if (shapeType === 'line' && shiftKey) {
    const angle = Math.atan2(dy, dx);
    const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    const dist = Math.hypot(dx, dy);
    x2 = x1 + Math.cos(snapped) * dist;
    y2 = y1 + Math.sin(snapped) * dist;
  } else if (shapeType !== 'line' && shiftKey) {
    const maxDim = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * maxDim;
    dy = Math.sign(dy || 1) * maxDim;
    x2 = x1 + dx;
    y2 = y1 + dy;
  }

  const endPt = { x: x2, y: y2 };

  // 1. PIXEL SPACE: BAKE DIRECTLY ONTO 512px CANVAS TILES
  if (isPixelSpace) {
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const maxX = Math.max(x1, x2);
    const maxY = Math.max(y1, y2);
    const pad = Math.max(16, (state.toolSettings.size || 3) * 2 + 16);

    const rx = Math.floor(minX - pad);
    const ry = Math.floor(minY - pad);
    const rw = Math.max(2, Math.ceil(maxX - minX + pad * 2));
    const rh = Math.max(2, Math.ceil(maxY - minY + pad * 2));

    const canvas = document.createElement('canvas');
    canvas.width = rw;
    canvas.height = rh;
    const ctx = canvas.getContext('2d');
    ctx.translate(-rx, -ry);

    drawShape(ctx, 'shape', p1, endPt, { ...state.toolSettings, shapeType }, false);

    await commitRasterBlit(frame, state.activeLayerId, canvas, rx, ry, 'source-over', 1.0);
    showToast(`Baked ${shapeType} directly to pixel layer`);
  } else {
    // 2. VECTOR SPACE: RESOLUTION-INDEPENDENT VECTOR SHAPE
    const strokeData = {
      id: `${shapeType}_${Date.now()}`,
      tool: 'shape',
      isShape: true,
      shapeData: { start: p1, end: endPt, shiftKey },
      settings: { ...state.toolSettings, shapeType, activeShapeType: shapeType },
    };

    await commandManager.execute(
      new AddStrokeCommand(frame.id, state.activeLayerId, strokeData)
    );
    showToast(`Created vector ${shapeType}`);
  }

  requestRender();
  renderTimelineFilmstrip();
  scheduleAutosave(true);
}

export function setupCanvasEvents() {
  if (!elements.canvasContainer) return;

  const stylusEngine = new StylusHardwareEngine(elements.canvasContainer, (stabilizedPoint) => {
    state.strokePoints.push(stabilizedPoint);
    renderStrokePreview();
  });

  // Wheel Zoom & Brush Size
  elements.canvasContainer.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (e.altKey) {
        const delta = e.deltaY < 0 ? (e.shiftKey ? 4 : 1) : (e.shiftKey ? -4 : -1);
        adjustBrushSize(delta);
        updateBrushCursorPosition(e.clientX, e.clientY);
        return;
      }
      const rawDelta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const newZoom = state.zoom * Math.exp(-rawDelta * 0.0015);
      zoomAtPointer(e.clientX, e.clientY, newZoom, requestRender);
    },
    { passive: false }
  );

  // Double-click to commit active node-tool, perspective or polygon
  elements.canvasContainer.addEventListener('dblclick', async (e) => {
    if (state.currentTool === 'node-tool' && nodeToolState.active) {
      e.preventDefault();
      await commitNodeTool();
      return;
    }
    if (perspectiveStudioState.active) {
      e.preventDefault();
      commitPerspectiveShape();
      return;
    }
    if (polygonStudioState.active) {
      e.preventDefault();
      closeAndCommitPolygon();
    }
  });

  // -------------------------------------------------------------
  // Pointer Down
  // -------------------------------------------------------------
  elements.canvasContainer.addEventListener('pointerdown', async (e) => {
    try {
      elements.canvasContainer.setPointerCapture(e.pointerId);
    } catch (_) {}

    // Middle click or space bar => Pan
    if (e.button === 1 || state.isSpacePressed) {
      e.preventDefault();
      state.isPanning = true;
      if (state.isSpacePressed) state.spacePanUsed = true;
      state.dragStartPoint = {
        x: e.clientX - state.pan.x,
        y: e.clientY - state.pan.y,
      };
      elements.canvasContainer.style.cursor = 'grabbing';
      if (elements.brushCursor) elements.brushCursor.classList.add('hidden');
      return;
    }

    // Right-click cancels active stroke / perspective / polygon / node-tool
    if (e.button === 2) {
      e.preventDefault();
      if (nodeToolState.active) {
        cancelNodeTool();
        showToast('Cancelled node path');
        return;
      }
      if (polygonStudioState.active) {
        cancelPolygonStudio();
        showToast('Cancelled polygon');
        return;
      }
      if (perspectiveStudioState.active) {
        cancelPerspectiveStudio();
        showToast('Cancelled perspective rectangle');
        return;
      }
      if (state.isDrawing) {
        state.isDrawing = false;
        state.strokePoints = [];
        clearStrokePreview();
        return;
      }
    }

    if (e.button !== 0) return;
    e.preventDefault();

    state.shiftPressed = Boolean(e.shiftKey);
    const worldPt = screenToWorld(e.clientX, e.clientY);

    // =========================================================
    // 0. SELECTION & TRANSFORM TOOL (V / S)
    // =========================================================
    if (state.currentTool === 'select') {
      const container = elements.canvasContainer || document.getElementById('studio-canvas-container');
      const rect = container?.getBoundingClientRect();
      const screenX = rect ? e.clientX - rect.left : e.clientX;
      const screenY = rect ? e.clientY - rect.top : e.clientY;

      const hitHandle = hitTestSelectionHandles(screenX, screenY);
      if (hitHandle) {
        beginSelectionDrag(worldPt, hitHandle);
        return;
      }

      const hitStrokeId = hitTestStrokes(worldPt.x, worldPt.y);
      if (hitStrokeId) {
        if (e.shiftKey) {
          if (selectToolState.selectedStrokeIds.has(hitStrokeId)) {
            selectToolState.selectedStrokeIds.delete(hitStrokeId);
          } else {
            selectToolState.selectedStrokeIds.add(hitStrokeId);
          }
        } else {
          if (!selectToolState.selectedStrokeIds.has(hitStrokeId)) {
            selectToolState.selectedStrokeIds.clear();
            selectToolState.selectedStrokeIds.add(hitStrokeId);
          }
        }
        updateSelectionBounds();
        beginSelectionDrag(worldPt, 'move');
        requestRender();
        return;
      } else {
        // Clicked outside any stroke
        if (!e.shiftKey) {
          clearSelection();
        }
        selectToolState.marqueeStart = { ...worldPt };
        selectToolState.marqueeCurrent = { ...worldPt };
        requestRender();
        return;
      }
    }

    // =========================================================
    // 1. NODE TOOL INTERACTION
    // =========================================================
    if (state.currentTool === 'node-tool') {
      const activeLayer = state.project?.layers?.find((l) => l.id === state.activeLayerId);
      if (!activeLayer || activeLayer.locked || !activeLayer.visible) {
        showToast('Active layer is locked or hidden');
        return;
      }

      const clickedNodeId = hitTestNode(e.clientX, e.clientY);

      if (clickedNodeId) {
        // A. Shift+Click on a node connects an edge to it
        if (e.shiftKey) {
          connectActiveToNode(clickedNodeId);
          return;
        }

        // B. Clicking an existing BLUE node turns it RED (Active)
        setActiveNode(clickedNodeId);

        // Prepare for dragging
        const targetNode = nodeToolState.nodes.find(n => n.id === clickedNodeId);
        if (targetNode) {
          nodeToolState.draggingNodeId = clickedNodeId;
          nodeToolState.dragStartPointer = { ...worldPt };
          nodeToolState.dragNodeSnapshot = { x: targetNode.x, y: targetNode.y };
        }
        return;
      }

      // C. Click on empty space: extend from current RED node
      if (!nodeToolState.active) {
        startNodeTool(worldPt);
      } else {
        addNodeFromActive(worldPt);
      }
      return;
    }

    // 2. ACTIVE PERSPECTIVE STUDIO INTERACTION
    if (perspectiveStudioState.active && perspectiveStudioState.nodes) {
      const hit = hitTestPerspectiveHandle(e.clientX, e.clientY);
      if (hit) {
        perspectiveStudioState.draggingHandle = hit;
        perspectiveStudioState.dragStartPointer = { ...worldPt };
        perspectiveStudioState.dragSnapshotNodes = perspectiveStudioState.nodes.map(p => ({ ...p }));
        if (perspectiveStudioState.topNodes) {
          perspectiveStudioState.dragSnapshotTopNodes = perspectiveStudioState.topNodes.map(p => ({ ...p }));
        }
        perspectiveStudioState.dragSnapshotExtrusion = perspectiveStudioState.extrusionHeight || 80;
        return;
      }
      // Missed handle: Keep active session, DO NOT accidentally commit
      return;
    }

    const activeLayer = state.project?.layers?.find((l) => l.id === state.activeLayerId);
    if (!activeLayer || activeLayer.locked || !activeLayer.visible) {
      showToast('Active layer is locked or hidden');
      return;
    }

    // 3. Node-by-Node Polygon Tool
    if ((state.currentTool === 'shape' || state.currentTool === 'pixel-shape') && state.toolSettings.activeShapeType === 'polygon') {
      addPolygonVertex(worldPt);
      return;
    }

    // 3.5 Nature & Procedural Props Tool
    if (state.currentTool === 'props') {
      state.isDrawing = true;
      state.strokePoints = [{ ...worldPt }];
      state.dragStartPoint = { ...worldPt };
      state.lastPointerWorld = { ...worldPt };
      renderStrokePreview();
      return;
    }

    // 4. Shape & Line Tool Initiation (Drag straight line / rectangle / ellipse / start perspective)
    if (state.currentTool === 'shape' || state.currentTool === 'pixel-shape') {
      state.isDrawing = true;
      state.strokePoints = [];
      state.dragStartPoint = { ...worldPt };
      state.lastPointerWorld = { ...worldPt };
      renderStrokePreview();
      return;
    }

    // 5. Pencil / Eraser Tool Stroke Initiation
    const isEraserHardware = e.pointerType === 'eraser' || (typeof e.buttons === 'number' && (e.buttons & 32) !== 0);
    state.isEraserActive = isEraserHardware;

    state.dragStartPoint = { ...worldPt };
    state.lastPointerWorld = { ...worldPt };
    state.isDrawing = true;
    stylusEngine.lastPoint = { ...worldPt };
    const pressure = getStrokePressure(e, null, worldPt);
    dualStabilizer.reset({ ...worldPt, pressure, isEraser: isEraserHardware });
    const stabilized = dualStabilizer.process({ ...worldPt, pressure, isEraser: isEraserHardware }, state.toolSettings);
    state.strokePoints = [stabilized];
    renderStrokePreview();
  });

  // -------------------------------------------------------------
  // Pointer Move
  // -------------------------------------------------------------
  elements.canvasContainer.addEventListener('pointermove', (e) => {
    updateBrushCursorPosition(e.clientX, e.clientY);
    state.shiftPressed = Boolean(e.shiftKey);

    if (state.isPanning && state.dragStartPoint) {
      state.pan.x = e.clientX - state.dragStartPoint.x;
      state.pan.y = e.clientY - state.dragStartPoint.y;
      requestRender();
      return;
    }

    const worldPt = screenToWorld(e.clientX, e.clientY);
    state.lastPointerWorld = worldPt;

    // Select Tool Dragging, Marquee, & Hover Feedback
    if (state.currentTool === 'select') {
      if (selectToolState.draggingHandle) {
        handleSelectDrag(worldPt, e);
        return;
      }
      if (selectToolState.marqueeStart) {
        selectToolState.marqueeCurrent = { ...worldPt };
        // Select strokes whose bounds intersect marquee
        const x0 = Math.min(selectToolState.marqueeStart.x, worldPt.x);
        const y0 = Math.min(selectToolState.marqueeStart.y, worldPt.y);
        const x1 = Math.max(selectToolState.marqueeStart.x, worldPt.x);
        const y1 = Math.max(selectToolState.marqueeStart.y, worldPt.y);

        const frame = currentFrame();
        const lData = frame?.layerData[state.activeLayerId];
        if (lData?.strokes) {
          selectToolState.selectedStrokeIds.clear();
          for (const s of lData.strokes) {
            const pts = s.points || s.nodes || (s.shapeData ? [s.shapeData.start, s.shapeData.end] : []);
            if (pts.some(p => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)) {
              selectToolState.selectedStrokeIds.add(s.id);
            }
          }
          updateSelectionBounds();
        }
        requestRender();
        return;
      }

      // Cursor feedback
      const container = elements.canvasContainer || document.getElementById('studio-canvas-container');
      const rect = container?.getBoundingClientRect();
      const screenX = rect ? e.clientX - rect.left : e.clientX;
      const screenY = rect ? e.clientY - rect.top : e.clientY;
      const hHandle = hitTestSelectionHandles(screenX, screenY);
      if (hHandle) {
        elements.canvasContainer.style.cursor = hHandle === 'rot' ? 'crosshair' : (hHandle === 'move' ? 'move' : 'nwse-resize');
      } else {
        const hitStr = hitTestStrokes(worldPt.x, worldPt.y);
        elements.canvasContainer.style.cursor = hitStr ? 'pointer' : 'default';
      }
      return;
    }

    // Node Tool Dragging & Hover Feedback
    if (state.currentTool === 'node-tool') {
      if (nodeToolState.draggingNodeId) {
        const dx = worldPt.x - nodeToolState.dragStartPointer.x;
        const dy = worldPt.y - nodeToolState.dragStartPointer.y;
        const targetNode = nodeToolState.nodes.find(n => n.id === nodeToolState.draggingNodeId);
        if (targetNode && nodeToolState.dragNodeSnapshot) {
          targetNode.x = nodeToolState.dragNodeSnapshot.x + dx;
          targetNode.y = nodeToolState.dragNodeSnapshot.y + dy;
          requestRender();
        }
        return;
      }

      // Hover Detection
      const hovId = hitTestNode(e.clientX, e.clientY);
      nodeToolState.hoveredNodeId = hovId;
      elements.canvasContainer.style.cursor = hovId ? 'pointer' : 'crosshair';
      requestRender();
      return;
    }

    // Update live polygon rubber-band line
    if (polygonStudioState.active) {
      updatePolygonCursor(worldPt);
    }

    // A. Active Perspective Dragging
    if (perspectiveStudioState.draggingHandle) {
      handlePerspectiveDrag(worldPt, e);
      return;
    }

    // B. Real-time Cursor & Handle Hover Feedback
    if (perspectiveStudioState.active && perspectiveStudioState.nodes) {
      const hoverHit = hitTestPerspectiveHandle(e.clientX, e.clientY);
      perspectiveStudioState.hoveredHandle = hoverHit;

      if (hoverHit) {
        if (hoverHit.type.includes('node')) {
          elements.canvasContainer.style.cursor = 'grab';
        } else if (hoverHit.type.includes('edge') || hoverHit.type === 'body') {
          elements.canvasContainer.style.cursor = 'move';
        } else if (hoverHit.type === 'extrude') {
          elements.canvasContainer.style.cursor = 'ns-resize';
        }
      } else {
        elements.canvasContainer.style.cursor = 'default';
      }
      requestRender();
      return;
    }

    if (state.isDrawing) {
      if (state.currentTool === 'props') {
        const last = state.strokePoints[state.strokePoints.length - 1];
        if (!last || Math.hypot(worldPt.x - last.x, worldPt.y - last.y) >= 12) {
          state.strokePoints.push({ ...worldPt });
          renderStrokePreview();
        }
      } else if (state.currentTool === 'shape' || state.currentTool === 'pixel-shape') {
        renderStrokePreview();
      } else {
        stylusEngine.handlePointerMove(e);
      }
    }
  });

  // -------------------------------------------------------------
  // Pointer Up
  // -------------------------------------------------------------
  const handlePointerUp = async (e) => {
    try {
      if (elements.canvasContainer.hasPointerCapture(e.pointerId)) {
        elements.canvasContainer.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}

    state.shiftPressed = Boolean(e.shiftKey);

    // Release Select Tool Dragging
    if (state.currentTool === 'select') {
      if (selectToolState.draggingHandle) {
        finishSelectionDrag();
      }
      selectToolState.marqueeStart = null;
      selectToolState.marqueeCurrent = null;
      requestRender();
      return;
    }

    // Release Node Tool Dragging
    if (state.currentTool === 'node-tool' && nodeToolState.draggingNodeId) {
      nodeToolState.draggingNodeId = null;
      nodeToolState.dragStartPointer = null;
      nodeToolState.dragNodeSnapshot = null;
      return;
    }

    if (state.isPanning) {
      state.isPanning = false;
      state.dragStartPoint = null;
      elements.canvasContainer.style.cursor = '';
      return;
    }

    // Release perspective handle drag
    if (perspectiveStudioState.draggingHandle) {
      perspectiveStudioState.draggingHandle = null;
      perspectiveStudioState.dragSnapshotNodes = null;
      perspectiveStudioState.dragSnapshotTopNodes = null;
      perspectiveStudioState.dragStartPointer = null;
      saveHistoryState();
      return;
    }

    // Finished dragging a shape (Line, Rectangle, Ellipse, or starting Perspective)
    if (state.isDrawing && (state.currentTool === 'shape' || state.currentTool === 'pixel-shape')) {
      state.isDrawing = false;
      clearStrokePreview();
      const p1 = state.dragStartPoint;
      const p2 = state.lastPointerWorld;
      state.dragStartPoint = null;
      state.lastPointerWorld = null;

      if (p1 && p2 && Math.hypot(p2.x - p1.x, p2.y - p1.y) >= 3) {
        const isPixelSpace = state.engineMode === 'pixel' || state.currentTool === 'pixel-shape';
        const shapeType = state.toolSettings.shapeType || state.toolSettings.activeShapeType || 'rectangle';
        const mode = state.toolSettings.rectMode || state.toolSettings.rectSubMode || 'standard';

        // 1. Straight Line Tool
        if (shapeType === 'line') {
          commitShapeToStorage('line', p1, p2, state.shiftPressed, isPixelSpace);
          return;
        }

        // 2. Ellipse / Circle Tool
        if (shapeType === 'ellipse') {
          commitShapeToStorage('ellipse', p1, p2, state.shiftPressed, isPixelSpace);
          return;
        }

        // 3. 2D Standard Rectangle
        if (shapeType === 'rectangle' && mode === 'standard') {
          commitShapeToStorage('rectangle', p1, p2, state.shiftPressed, isPixelSpace);
          return;
        }

        // 4. Perspective Quad & 3D Extruded Cube
        startPerspectiveRectangle(p1, p2, mode === 'cube' ? 'cube' : 'plane');
      }
      return;
    }

    // Finished Props tool stroke / stamp
    if (state.isDrawing && state.currentTool === 'props') {
      state.isDrawing = false;
      clearStrokePreview();
      const points = [...state.strokePoints];
      const p1 = state.dragStartPoint;
      state.dragStartPoint = null;
      state.lastPointerWorld = null;
      state.strokePoints = [];

      const propId = state.toolSettings.propId || 'tree';
      const isScatter = points.length > 2;

      const frame = currentFrame();
      const activeLayer = state.project?.layers?.find((l) => l.id === state.activeLayerId);
      if (!frame || !activeLayer || activeLayer.locked || !activeLayer.visible) return;

      const stroke = {
        id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        isStampProp: !isScatter,
        isScatterProp: isScatter,
        propId: propId,
        center: p1 ? { ...p1 } : { x: 400, y: 300 },
        points: isScatter ? points : [{ ...(p1 || { x: 400, y: 300 }) }],
        settings: {
          color: state.toolSettings.color || '#22c55e',
          size: state.toolSettings.size || 48,
          opacity: state.toolSettings.opacity ?? 1,
        },
        tool: 'props',
      };

      await commandManager.execute(new AddStrokeCommand(frame.id, state.activeLayerId, stroke));
      requestRender();
      return;
    }

    // Finished pencil stroke
    if (state.isDrawing) {
      const remainingPoints = dualStabilizer.flush();
      if (remainingPoints.length > 0) {
        state.strokePoints.push(...remainingPoints);
        renderStrokePreview();
      }
      await commitStrokeToTiles();
    }
  };

  elements.canvasContainer.addEventListener('pointerup', handlePointerUp);
  elements.canvasContainer.addEventListener('pointercancel', handlePointerUp);
  window.addEventListener('pointerup', (e) => {
    if (state.isDrawing) handlePointerUp(e);
  });

  elements.canvasContainer.addEventListener('pointerleave', () => {
    if (elements.brushCursor) elements.brushCursor.classList.add('hidden');
  });

  elements.canvasContainer.addEventListener('contextmenu', (e) => {
    if (state.isDrawing) e.preventDefault();
  });
}
