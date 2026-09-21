// src/js/viewport/brushCursor.js
import { state } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { hexToRgba } from '../colorUtils.js';

export function updateBrushCursorPosition(clientX, clientY) {
  if (!elements.brushCursor || !elements.canvasContainer) return;
  const rect = elements.canvasContainer.getBoundingClientRect();
  const outOfBounds =
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom;

  if (outOfBounds || state.isPanning || state.isSpacePressed) {
    elements.brushCursor.classList.add('hidden');
    return;
  }

  const relX = clientX - rect.left;
  const relY = clientY - rect.top;
  const baseSize = state.toolSettings.size || 3;
  // Stroke diameter = baseSize * zoom (matches rendered stroke width at 100% pressure)
  const visualDiameter = Math.max(3, Math.round(baseSize * state.zoom));

  elements.brushCursor.style.width = `${visualDiameter}px`;
  elements.brushCursor.style.height = `${visualDiameter}px`;
  elements.brushCursor.style.left = `${relX - visualDiameter / 2}px`;
  elements.brushCursor.style.top = `${relY - visualDiameter / 2}px`;

  const curColor = state.toolSettings.color || '#1e293b';
  elements.brushCursor.className =
    'rounded-full border pointer-events-none shadow-sm z-90 ring-1 ring-black/40 absolute transition-none';
  elements.brushCursor.style.borderColor = 'rgba(255, 255, 255, 0.9)';
  elements.brushCursor.style.backgroundColor = hexToRgba(curColor, 0.25);
  elements.brushCursor.classList.remove('hidden');
}

export function adjustBrushSize(delta) {
  state.toolSettings.size = Math.max(1, Math.min(60, (state.toolSettings.size || 3) + delta));
  const s = document.getElementById('slider-pencil-size');
  if (s) s.value = state.toolSettings.size;
  const lbl = document.getElementById('label-pencil-size');
  if (lbl) lbl.textContent = `${state.toolSettings.size} px`;
}

export function getCursorSvg() {
  return null;
}
