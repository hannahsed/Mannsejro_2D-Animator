// src/js/ui/canvasContextMenu.js
import { state, hasFloatingSelection } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { undo, redo } from '../project/history.js';
import { centerCameraInView, screenToWorld } from '../viewport/camera.js';
import { requestRender } from '../render/renderEngine.js';
import { setToolByName } from './colorPalettes.js';
import { commitFloatingSelection, cancelFloatingSelection, liftSelectionToFloatingObject } from '../viewport/floatingSelection.js';
import { showToast } from './toast.js';

let canvasMenuEl = null;

export function hideCanvasContextMenu() {
  if (canvasMenuEl) canvasMenuEl.classList.add('hidden');
}

export function setupCanvasContextMenu() {
  if (!elements.canvasContainer) return;

  canvasMenuEl = document.createElement('div');
  canvasMenuEl.id = 'canvas-context-menu';
  canvasMenuEl.className =
    'fixed z-[120] min-w-[200px] bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl p-1.5 hidden select-none text-xs text-slate-200';
  document.body.appendChild(canvasMenuEl);

  window.addEventListener(
    'pointerdown',
    (e) => {
      if (!canvasMenuEl.classList.contains('hidden') && !canvasMenuEl.contains(e.target)) {
        hideCanvasContextMenu();
      }
    },
    true
  );

  elements.canvasContainer.addEventListener('contextmenu', (e) => {
    // If context menu originated from a reference overlay or handle, allow reference context menu to handle it
    if (e.target.closest('[data-ref-id]') || e.target.closest('#reference-overlays-container')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const worldPt = screenToWorld(e.clientX, e.clientY);
    const hasSelection = hasFloatingSelection();

    const row = (act, label, kbd = '', danger = false) => `
      <button data-c-act="${act}" class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition ${
        danger ? 'text-orange-400 hover:bg-orange-950/50' : 'hover:bg-slate-800 text-slate-200'
      }">
        <span>${label}</span>
        ${kbd ? `<span class="text-[10px] font-mono text-slate-500">${kbd}</span>` : ''}
      </button>
    `;

    canvasMenuEl.innerHTML = `
      <div class="px-2.5 py-1 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Canvas Quick Menu</div>
      ${hasSelection ? row('commit-sel', 'Commit Selection', 'Enter') : ''}
      ${hasSelection ? row('cancel-sel', 'Cancel & Restore', 'Esc') : ''}
      ${!hasSelection ? row('select-camera', 'Select Capture Area', 'S') : ''}
      <div class="my-1 h-px bg-slate-800"></div>
      ${row('undo', 'Undo Stroke', 'Ctrl+Z')}
      ${row('redo', 'Redo', 'Ctrl+Y')}
      <div class="my-1 h-px bg-slate-800"></div>
      ${row('eyedropper', 'Sample Color Here', 'I')}
      ${row('flip-h', 'Flip Workspace H', 'H')}
      ${row('center-cam', 'Center on Camera', '0')}
      ${row('fit-screen', 'Fit Canvas to Screen', 'F')}
    `;

    canvasMenuEl.classList.remove('hidden');
    const rect = canvasMenuEl.getBoundingClientRect();
    canvasMenuEl.style.left = `${Math.max(8, Math.min(e.clientX, window.innerWidth - rect.width - 12))}px`;
    canvasMenuEl.style.top = `${Math.max(8, Math.min(e.clientY, window.innerHeight - rect.height - 12))}px`;

    canvasMenuEl.querySelectorAll('[data-c-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.cAct;
        hideCanvasContextMenu();

        if (act === 'commit-sel') commitFloatingSelection();
        else if (act === 'cancel-sel') cancelFloatingSelection();
        else if (act === 'select-camera') {
          const cam = state.project.camera;
          const w = state.project.width * (cam.scale || 1);
          const h = state.project.height * (cam.scale || 1);
          liftSelectionToFloatingObject({ x: cam.x - w / 2, y: cam.y - h / 2, w, h });
        } else if (act === 'undo') undo();
        else if (act === 'redo') redo();
        else if (act === 'eyedropper') setToolByName('eyedropper');
        else if (act === 'flip-h') {
          state.flipH = !state.flipH;
          requestRender();
          showToast(state.flipH ? 'Flipped Canvas' : 'Normal Canvas');
        } else if (act === 'center-cam') {
          state.zoom = 1;
          centerCameraInView();
          requestRender();
        } else if (act === 'fit-screen') {
          state.zoom = 1;
          centerCameraInView();
          requestRender();
        }
      });
    });
  });
}
