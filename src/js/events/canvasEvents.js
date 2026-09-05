import { state, SHAPE_TOOLS, INK_TOOLS, currentFrame } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { screenToWorld, zoomAtPointer } from '../viewport/camera.js';
import { updateBrushCursorPosition, adjustBrushSize } from '../viewport/brushCursor.js';
import { clearStrokePreview, renderStrokePreview, commitStrokeToTiles, commitLassoFill } from '../render/strokeRenderer.js';
import { requestRender, sampleWorldColor } from '../render/renderEngine.js';
import { renderTimelineFilmstrip } from '../timeline/filmstrip.js';
import { saveHistoryState } from '../project/history.js';
import { showToast } from '../ui/toast.js';
import { liftSelectionToFloatingObject, updateMarqueeDisplay } from '../viewport/floatingSelection.js';
import { floodFillWorld } from '../infiniteCanvas.js';
import { SmartFillEngine } from '../smartFillEngine.js';
import { dualStabilizer } from '../viewport/dualStabilizer.js';
import { MaxedFillEngine } from '../color/maxedFillEngine.js';
import { scheduleAutosave } from '../project/autosave.js';

export function getStrokePressure(e, lastPt, currentPt) {
  if (!state.toolSettings.pressure) return 1;

  // Real hardware stylus pressure
  if (e.pointerType === 'pen' && typeof e.pressure === 'number' && e.pressure > 0) {
    return Math.min(1, Math.max(0.08, e.pressure));
  }

  // Natural velocity-based pressure simulation for mouse users
  if (lastPt && currentPt) {
    const dist = Math.hypot(currentPt.x - lastPt.x, currentPt.y - lastPt.y);
    // Faster strokes thin down like a real pen flick
    const speed = Math.min(60, dist);
    const simulated = 1.15 - (speed / 60) * 0.55;
    return Math.max(0.25, Math.min(1.0, simulated));
  }

  return 0.75;
}

export function captureStabilizedPoint(rawPt) {
  const pts = state.strokePoints;
  if (pts.length === 0) return rawPt;

  const prev = pts[pts.length - 1];
  const dx = rawPt.x - prev.x;
  const dy = rawPt.y - prev.y;
  if (dx * dx + dy * dy < 0.2) return null;

  const smoothing = state.toolSettings.smoothing || 0;
  if (smoothing <= 0) return rawPt;

  // Adaptive exponential smoothing (Streamline / Lazy Rope algorithm)
  const k = Math.max(0.04, 1 - Math.pow(smoothing, 0.65) * 0.92);

  return {
    x: prev.x + dx * k,
    y: prev.y + dy * k,
    pressure: rawPt.pressure ?? 1,
  };
}

export async function sampleAndApplyColor(wx, wy) {
  const hex = await sampleWorldColor(wx, wy);
  if (hex) {
    state.toolSettings.color = hex;
    if (elements.primaryColorPicker) elements.primaryColorPicker.value = hex;
  }
}

export function activateTempEyedropper() {
  if (state.currentTool === 'eyedropper') return;
  state.tempEyedropper = true;
  if (elements.canvasContainer) elements.canvasContainer.style.cursor = 'copy';
  if (elements.brushCursor) elements.brushCursor.classList.add('hidden');
}

export function deactivateTempEyedropper() {
  if (!state.tempEyedropper) return;
  state.tempEyedropper = false;
  if (elements.canvasContainer) {
    elements.canvasContainer.style.cursor = state.currentTool === 'hand' ? 'grab' : '';
  }
}

export function setupCanvasEvents() {
  if (!elements.canvasContainer) return;

  // Wheel Zoom & Brush Size
  elements.canvasContainer.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (e.altKey) {
        const delta = e.deltaY < 0 ? (e.shiftKey ? 10 : 2) : (e.shiftKey ? -10 : -2);
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

  // Pointer Down
  elements.canvasContainer.addEventListener('pointerdown', async (e) => {
    try {
      elements.canvasContainer.setPointerCapture(e.pointerId);
    } catch (err) {}

    // Middle click or space bar or hand tool => Pan
    if (e.button === 1 || state.isSpacePressed || state.currentTool === 'hand') {
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

    if (e.button !== 0) return;
    e.preventDefault();

    state.shiftPressed = Boolean(e.shiftKey);
    const worldPt = screenToWorld(e.clientX, e.clientY);
    state.dragStartPoint = worldPt;
    state.lastPointerWorld = worldPt;

    // Reset Dual-Stage Stabilizer on initial pen contact
    dualStabilizer.reset(worldPt);

    // Alt-eyedropper or Eyedropper tool
    if (state.tempEyedropper || state.currentTool === 'eyedropper') {
      await sampleAndApplyColor(worldPt.x, worldPt.y);
      return;
    }

    // Select Tool: start marquee drag
    if (state.currentTool === 'select') {
      state.isSelecting = true;
      state.selectStart = worldPt;
      state.selectionMarquee = { x: worldPt.x, y: worldPt.y, w: 0, h: 0 };
      updateMarqueeDisplay();
      return;
    }

    // Drawing requires an editable active layer
    const activeLayer = state.project.layers.find((l) => l.id === state.activeLayerId);
    if (!activeLayer || activeLayer.locked || !activeLayer.visible) {
      showToast('Active layer is locked or hidden');
      return;
    }

    // MAXED-OUT FILL TOOL
    if (state.currentTool === 'fill' || state.currentTool === 'bucket') {
      const frame = currentFrame();
      if (!frame) return;

      showToast('Filling…');
      const modified = await MaxedFillEngine.executeSmartFill(
        state.project,
        frame,
        state.activeLayerId,
        worldPt.x,
        worldPt.y,
        state.toolSettings
      );

      if (modified) {
        requestRender();
        renderTimelineFilmstrip();
        saveHistoryState();
        scheduleAutosave(true); // Instant crash-proof flush
      }
      return;
    }

    // Lasso Fill tool
    if (state.currentTool === 'lassofill') {
      state.isDrawing = true;
      state.strokePoints = [{ ...worldPt }];
      renderStrokePreview();
      return;
    }

    // Ink & Shape tools
    if (INK_TOOLS.has(state.currentTool) || SHAPE_TOOLS.has(state.currentTool)) {
      state.isDrawing = true;
      const pressure = getStrokePressure(e);
      const stabilized = dualStabilizer.process({ ...worldPt, pressure }, state.toolSettings);
      state.strokePoints = [stabilized];
      renderStrokePreview();
    }
  });

  // Pointer Move
  elements.canvasContainer.addEventListener('pointermove', async (e) => {
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

    if (state.tempEyedropper && (e.buttons & 1)) {
      await sampleAndApplyColor(worldPt.x, worldPt.y);
      return;
    }

    if (state.isSelecting && state.selectStart) {
      const sx = Math.min(state.selectStart.x, worldPt.x);
      const sy = Math.min(state.selectStart.y, worldPt.y);
      const sw = Math.abs(worldPt.x - state.selectStart.x);
      const sh = Math.abs(worldPt.y - state.selectStart.y);
      state.selectionMarquee = { x: sx, y: sy, w: sw, h: sh };
      updateMarqueeDisplay();
      return;
    }

    if (state.isDrawing) {
      if (state.currentTool === 'lassofill') {
        state.strokePoints.push(worldPt);
        renderStrokePreview();
      } else if (SHAPE_TOOLS.has(state.currentTool)) {
        renderStrokePreview();
      } else {
        const lastPt = state.strokePoints.length > 0 ? state.strokePoints[state.strokePoints.length - 1] : null;
        const pressure = getStrokePressure(e, lastPt, worldPt);
        const stabilized = dualStabilizer.process({ ...worldPt, pressure }, state.toolSettings);
        state.strokePoints.push(stabilized);
        renderStrokePreview();
      }
    }
  });

  // Pointer Up
  const handlePointerUp = async (e) => {
    state.shiftPressed = Boolean(e.shiftKey);
    if (state.isPanning) {
      state.isPanning = false;
      state.dragStartPoint = null;
      elements.canvasContainer.style.cursor = state.currentTool === 'hand' ? 'grab' : '';
      return;
    }

    if (state.isSelecting) {
      state.isSelecting = false;
      state.selectStart = null;
      if (state.selectionMarquee && state.selectionMarquee.w >= 4 && state.selectionMarquee.h >= 4) {
        await liftSelectionToFloatingObject(state.selectionMarquee);
      } else {
        state.selectionMarquee = null;
        updateMarqueeDisplay();
      }
      return;
    }

    if (state.isDrawing) {
      await commitStrokeToTiles();
    }
  };

  elements.canvasContainer.addEventListener('pointerup', handlePointerUp);
  elements.canvasContainer.addEventListener('pointercancel', handlePointerUp);

  elements.canvasContainer.addEventListener('pointerleave', () => {
    if (elements.brushCursor) elements.brushCursor.classList.add('hidden');
  });
}
