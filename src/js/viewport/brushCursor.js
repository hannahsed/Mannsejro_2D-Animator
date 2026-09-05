import { state, SHAPE_TOOLS } from '../state/appState.js';
import { elements } from '../state/domElements.js';

export function updateBrushCursorPosition(clientX, clientY) {
  if (!elements.brushCursor || !elements.canvasContainer) return;
  const rect = elements.canvasContainer.getBoundingClientRect();
  if (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom ||
    state.isPanning ||
    state.isSpacePressed ||
    state.currentTool === 'eyedropper' ||
    state.currentTool === 'bucket' ||
    state.currentTool === 'hand' ||
    SHAPE_TOOLS.has(state.currentTool)
  ) {
    elements.brushCursor.classList.add('hidden');
    return;
  }

  const isEraser = state.currentTool === 'eraser';
  const baseSize = isEraser
    ? state.toolSettings.eraserSize || 24
    : state.toolSettings.size || 5;

  const visualDiameter = Math.max(4, Math.round(baseSize * state.zoom));
  const relX = clientX - rect.left;
  const relY = clientY - rect.top;

  elements.brushCursor.style.width = `${visualDiameter}px`;
  elements.brushCursor.style.height = `${visualDiameter}px`;
  elements.brushCursor.style.left = `${relX - visualDiameter / 2}px`;
  elements.brushCursor.style.top = `${relY - visualDiameter / 2}px`;

  if (isEraser) {
    elements.brushCursor.className =
      'rounded-full border border-rose-400/90 bg-rose-500/20 pointer-events-none shadow-sm z-90 ring-1 ring-white/50 absolute transition-none';
  } else {
    elements.brushCursor.className =
      'rounded-full border border-white/90 bg-indigo-500/20 pointer-events-none shadow-sm z-90 ring-1 ring-black/40 absolute transition-none';
  }
  elements.brushCursor.classList.remove('hidden');
}

export function adjustBrushSize(delta) {
  const isEraser = state.currentTool === 'eraser';
  if (isEraser) {
    state.toolSettings.eraserSize = Math.max(1, Math.min(200, (state.toolSettings.eraserSize || 24) + delta));
    const s = document.getElementById('slider-eraser-size');
    if (s) s.value = state.toolSettings.eraserSize;
  } else {
    state.toolSettings.size = Math.max(1, Math.min(200, (state.toolSettings.size || 5) + delta));
    const s = document.getElementById('slider-draw-size') || elements.sliderBrushSize;
    if (s) s.value = state.toolSettings.size;
    const lbl = document.getElementById('label-draw-size') || elements.brushSizeVal;
    if (lbl) lbl.textContent = `${state.toolSettings.size} px`;
  }
}

export function adjustOpacity(delta) {
  state.toolSettings.opacity = +(Math.max(0.05, Math.min(1.0, (state.toolSettings.opacity || 1) + delta)).toFixed(2));
  const s = document.getElementById('slider-draw-opacity') || elements.sliderBrushOpacity;
  if (s) s.value = Math.round(state.toolSettings.opacity * 100);
  const lbl = document.getElementById('label-draw-opacity') || elements.brushOpacityVal;
  if (lbl) lbl.textContent = `${Math.round(state.toolSettings.opacity * 100)}%`;
}
