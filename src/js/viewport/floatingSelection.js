import { state, currentFrame } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { worldToScreen, screenToWorld } from './camera.js';
import { compositeLayerRegion, blitCanvasIntoTiles } from '../infiniteCanvas.js';
import { requestRender } from '../render/renderEngine.js';
import { renderTimelineFilmstrip } from '../timeline/filmstrip.js';
import { saveHistoryState } from '../project/history.js';
import { showToast } from '../ui/toast.js';

let overlayEl = null;

export function getFloatingSelectionOverlay() {
  if (overlayEl) return overlayEl;
  overlayEl = document.getElementById('floating-selection-overlay');
  if (!overlayEl && elements.canvasContainer) {
    overlayEl = document.createElement('div');
    overlayEl.id = 'floating-selection-overlay';
    overlayEl.className = 'absolute z-50 pointer-events-auto select-none hidden';
    elements.canvasContainer.appendChild(overlayEl);
  }
  return overlayEl;
}

export function updateMarqueeDisplay() {
  const svg = elements.selectionSvg;
  const rectEl = elements.selectionRect;
  if (!svg || !rectEl) return;
  if (!state.selectionMarquee) {
    svg.classList.add('hidden');
    return;
  }
  svg.classList.remove('hidden');
  const m = state.selectionMarquee;
  const p1 = worldToScreen(m.x, m.y);
  const p2 = worldToScreen(m.x + m.w, m.y + m.h);
  const sx = Math.min(p1.x, p2.x);
  const sy = Math.min(p1.y, p2.y);
  const sw = Math.abs(p2.x - p1.x);
  const sh = Math.abs(p2.y - p1.y);
  rectEl.setAttribute('x', sx);
  rectEl.setAttribute('y', sy);
  rectEl.setAttribute('width', sw);
  rectEl.setAttribute('height', sh);
}

/**
 * Lifts pixels from active layer inside rect (x, y, w, h) into state.floatingSelection
 */
export async function liftSelectionToFloatingObject(rect) {
  const activeLayer = state.project.layers.find((l) => l.id === state.activeLayerId);
  if (!activeLayer || activeLayer.locked || !activeLayer.visible) {
    showToast('Cannot select on locked or hidden layer');
    return;
  }
  const frame = currentFrame();
  if (!frame) return;

  const w = Math.max(1, Math.round(rect.w));
  const h = Math.max(1, Math.round(rect.h));

  // Extract selected pixels from tiles
  const sourceTiles = frame.layerData[activeLayer.id]?.tiles;
  const extractedCanvas = await compositeLayerRegion(sourceTiles, rect.x, rect.y, w, h);

  // Clear lifted pixels from the layer
  const eraserCanvas = document.createElement('canvas');
  eraserCanvas.width = w;
  eraserCanvas.height = h;
  const ectx = eraserCanvas.getContext('2d');
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, w, h);

  const store = frame.layerData[activeLayer.id] || (frame.layerData[activeLayer.id] = { tiles: {} });
  await blitCanvasIntoTiles(store.tiles, eraserCanvas, rect.x, rect.y, 'destination-out');

  state.floatingSelection = {
    canvas: extractedCanvas,
    x: rect.x + w / 2, // Center point in world
    y: rect.y + h / 2,
    width: w,
    height: h,
    rotation: 0,
    scale: 1,
    locked: false,
    originalX: rect.x,
    originalY: rect.y,
  };

  state.selectionMarquee = null;
  updateMarqueeDisplay();
  renderFloatingSelectionOverlay();
  requestRender();
  showToast('Selection lifted — Enter: commit, Esc: cancel');
}

export function renderFloatingSelectionOverlay() {
  const ov = getFloatingSelectionOverlay();
  if (!ov) return;
  const sel = state.floatingSelection;
  if (!sel || !sel.canvas) {
    ov.classList.add('hidden');
    ov.innerHTML = '';
    return;
  }

  ov.classList.remove('hidden');
  const pos = worldToScreen(sel.x, sel.y);
  const dispW = sel.width * sel.scale * state.zoom;
  const dispH = sel.height * sel.scale * state.zoom;

  ov.style.left = `${pos.x}px`;
  ov.style.top = `${pos.y}px`;
  ov.style.width = `${dispW}px`;
  ov.style.height = `${dispH}px`;
  ov.style.transform = `translate(-50%, -50%) rotate(${sel.rotation}deg)`;

  ov.innerHTML = `
    <div class="absolute inset-0 border-2 border-indigo-400 marching-ants pointer-events-none rounded-sm"></div>
    <div data-sel-handle="move" title="Drag to move" class="absolute -left-2 -top-2 w-4 h-4 bg-rose-500 border-2 border-white rounded-sm cursor-move shadow-md"></div>
    <div data-sel-handle="rotate" title="Drag to rotate" class="absolute -right-2 -top-2 w-4 h-4 bg-indigo-500 border-2 border-white rounded-full cursor-grab shadow-md"></div>
    <div data-sel-handle="lock" title="Click to lock/unlock" class="absolute -left-2 -bottom-2 w-4 h-4 ${sel.locked ? 'bg-amber-500' : 'bg-zinc-600'} border-2 border-white rounded-sm cursor-pointer shadow-md flex items-center justify-center">
      <svg class="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a5 5 0 00-5 5v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm-3 8V7a3 3 0 116 0v3H9z"/></svg>
    </div>
    <div data-sel-handle="scale" title="Drag to scale" class="absolute -right-2 -bottom-2 w-4 h-4 bg-emerald-500 border-2 border-white rounded-sm cursor-nwse-resize shadow-md"></div>
  `;

  setupSelectionInteraction(ov, sel);
}

function setupSelectionInteraction(ov, sel) {
  ov.querySelectorAll('[data-sel-handle]').forEach((hd) => {
    hd.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const mode = hd.dataset.selHandle;
      if (mode === 'lock') {
        sel.locked = !sel.locked;
        renderFloatingSelectionOverlay();
        showToast(sel.locked ? 'Selection locked' : 'Selection unlocked');
        return;
      }
      if (sel.locked) return;

      const startX = sel.x;
      const startY = sel.y;
      const startRot = sel.rotation || 0;
      const startScale = sel.scale || 1;
      const startPointer = screenToWorld(e.clientX, e.clientY);
      const center = worldToScreen(sel.x, sel.y);
      const startAngle = Math.atan2(e.clientY - center.y, e.clientX - center.x);
      const startDist = Math.hypot(e.clientX - center.x, e.clientY - center.y) || 1;

      const onMove = (me) => {
        if (mode === 'move') {
          const cur = screenToWorld(me.clientX, me.clientY);
          sel.x = startX + (cur.x - startPointer.x);
          sel.y = startY + (cur.y - startPointer.y);
        } else if (mode === 'rotate') {
          const ang = Math.atan2(me.clientY - center.y, me.clientX - center.x);
          sel.rotation = startRot + ((ang - startAngle) * 180) / Math.PI;
        } else if (mode === 'scale') {
          const d = Math.hypot(me.clientX - center.x, me.clientY - center.y);
          sel.scale = Math.min(8, Math.max(0.1, startScale * (d / startDist)));
        }
        renderFloatingSelectionOverlay();
        requestRender();
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });

  ov.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-sel-handle]')) return;
    if (sel.locked) return;
    e.stopPropagation();
    const startX = sel.x;
    const startY = sel.y;
    const startPointer = screenToWorld(e.clientX, e.clientY);
    const onMove = (me) => {
      const cur = screenToWorld(me.clientX, me.clientY);
      sel.x = startX + (cur.x - startPointer.x);
      sel.y = startY + (cur.y - startPointer.y);
      renderFloatingSelectionOverlay();
      requestRender();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

/**
 * Commits the floating selection transform onto the active layer (ENTER)
 */
export async function commitFloatingSelection() {
  const sel = state.floatingSelection;
  if (!sel || !sel.canvas) return;

  const frame = currentFrame();
  const store = frame.layerData[state.activeLayerId] || (frame.layerData[state.activeLayerId] = { tiles: {} });

  const pad = 10;
  const boundW = Math.ceil(sel.width * sel.scale * 1.5) + pad * 2;
  const boundH = Math.ceil(sel.height * sel.scale * 1.5) + pad * 2;
  const c = document.createElement('canvas');
  c.width = boundW;
  c.height = boundH;
  const ctx = c.getContext('2d');

  ctx.translate(boundW / 2, boundH / 2);
  ctx.rotate((sel.rotation * Math.PI) / 180);
  ctx.scale(sel.scale, sel.scale);
  ctx.drawImage(sel.canvas, -sel.width / 2, -sel.height / 2);

  const worldX = sel.x - boundW / 2;
  const worldY = sel.y - boundH / 2;
  await blitCanvasIntoTiles(store.tiles, c, worldX, worldY, 'source-over');

  state.floatingSelection = null;
  renderFloatingSelectionOverlay();
  requestRender();
  renderTimelineFilmstrip();
  saveHistoryState();
  showToast('Committed selection');
}

/**
 * Cancels the floating selection and restores the original pixels (ESC)
 */
export async function cancelFloatingSelection() {
  const sel = state.floatingSelection;
  if (!sel || !sel.canvas) return;

  const frame = currentFrame();
  const store = frame.layerData[state.activeLayerId] || (frame.layerData[state.activeLayerId] = { tiles: {} });

  await blitCanvasIntoTiles(store.tiles, sel.canvas, sel.originalX, sel.originalY, 'source-over');

  state.floatingSelection = null;
  renderFloatingSelectionOverlay();
  requestRender();
  renderTimelineFilmstrip();
  showToast('Cancelled selection — restored');
}

/**
 * Deletes the floating selection without restoring pixels (DELETE)
 */
export function discardFloatingSelection() {
  if (!state.floatingSelection) return;
  state.floatingSelection = null;
  renderFloatingSelectionOverlay();
  requestRender();
  renderTimelineFilmstrip();
  saveHistoryState();
  showToast('Deleted selection');
}
