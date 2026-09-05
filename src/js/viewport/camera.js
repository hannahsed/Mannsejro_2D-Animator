// src/js/viewport/camera.js
import { state, MIN_ZOOM, MAX_ZOOM } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { showToast } from '../ui/toast.js';
import { saveHistoryState } from '../project/history.js';

export function screenToWorld(clientX, clientY) {
  if (!elements.canvasContainer) return { x: 0, y: 0 };
  const rect = elements.canvasContainer.getBoundingClientRect();
  return {
    x: (clientX - rect.left - rect.width / 2 - state.pan.x) / state.zoom,
    y: (clientY - rect.top - rect.height / 2 - state.pan.y) / state.zoom,
  };
}

export function worldToScreen(wx, wy) {
  if (!elements.canvasContainer) return { x: 0, y: 0 };
  const rect = elements.canvasContainer.getBoundingClientRect();
  return {
    x: rect.width / 2 + state.pan.x + wx * state.zoom,
    y: rect.height / 2 + state.pan.y + wy * state.zoom,
  };
}

export function getVisibleWorldRect() {
  if (!elements.canvasContainer) return { x: 0, y: 0, w: 800, h: 600 };
  const rect = elements.canvasContainer.getBoundingClientRect();
  const tl = screenToWorld(rect.left, rect.top);
  const br = screenToWorld(rect.right, rect.bottom);
  return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
}

export function centerCameraInView() {
  if (!state.project?.camera) return;
  const cam = state.project.camera;
  state.pan.x = -cam.x * state.zoom;
  state.pan.y = -cam.y * state.zoom;
}

export function zoomAtPointer(clientX, clientY, newZoom, requestRenderFn) {
  if (!elements.canvasContainer) return;
  const rect = elements.canvasContainer.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  const before = screenToWorld(clientX, clientY);

  state.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
  state.pan.x = (sx - rect.width / 2) - before.x * state.zoom;
  state.pan.y = (sy - rect.height / 2) - before.y * state.zoom;

  if (elements.zoomText) elements.zoomText.textContent = `${Math.round(state.zoom * 100)}%`;
  if (elements.statusZoom) elements.statusZoom.textContent = `${Math.round(state.zoom * 100)}%`;

  if (requestRenderFn) requestRenderFn();
}

export function positionCameraOverlay() {
  if (!state.project?.camera || !elements.cameraOverlay) return;
  const cam = state.project.camera;
  const ov = elements.cameraOverlay;
  const c = worldToScreen(cam.x, cam.y);
  const w = state.project.width * (cam.scale || 1) * state.zoom;
  const h = state.project.height * (cam.scale || 1) * state.zoom;

  ov.style.left = `${c.x}px`;
  ov.style.top = `${c.y}px`;
  ov.style.width = `${w}px`;
  ov.style.height = `${h}px`;
  ov.style.transform = `translate(-50%,-50%) rotate(${cam.rotation || 0}rad)`;

  if (elements.cameraBorder) {
    elements.cameraBorder.classList.toggle('border-amber-400/90', !!cam.locked);
    elements.cameraBorder.classList.toggle('border-rose-400/90', !cam.locked);
  }
  if (elements.camLockIcon) {
    elements.camLockIcon.classList.toggle('hidden', !cam.locked);
  }
}

export function setupCameraHandles(requestRenderFn, renderFilmstripFn) {
  if (!elements.cameraOverlay) return;
  elements.cameraOverlay.querySelectorAll('[data-cam-handle]').forEach((hd) => {
    hd.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const mode = hd.dataset.camHandle;
      const cam = state.project.camera;

      if (mode === 'lock') {
        cam.locked = !cam.locked;
        positionCameraOverlay();
        showToast(cam.locked ? 'Camera locked' : 'Camera unlocked');
        saveHistoryState();
        return;
      }

      if (cam.locked) {
        showToast('Camera is locked');
        return;
      }

      const startWorld = { x: cam.x, y: cam.y };
      const startRot = cam.rotation || 0;
      const startScale = cam.scale || 1;
      const startPointer = screenToWorld(e.clientX, e.clientY);
      const center = worldToScreen(cam.x, cam.y);
      const startAngle = Math.atan2(e.clientY - center.y, e.clientX - center.x);
      const startDist = Math.hypot(e.clientX - center.x, e.clientY - center.y) || 1;

      const onMove = (me) => {
        if (mode === 'move') {
          const cur = screenToWorld(me.clientX, me.clientY);
          cam.x = startWorld.x + (cur.x - startPointer.x);
          cam.y = startWorld.y + (cur.y - startPointer.y);
        } else if (mode === 'rotate') {
          const ang = Math.atan2(me.clientY - center.y, me.clientX - center.x);
          cam.rotation = startRot + (ang - startAngle);
        } else if (mode === 'scale') {
          const d = Math.hypot(me.clientX - center.x, me.clientY - center.y);
          cam.scale = Math.min(8, Math.max(0.1, startScale * (d / startDist)));
        }
        if (requestRenderFn) requestRenderFn();
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (renderFilmstripFn) renderFilmstripFn();
        saveHistoryState();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });
}
