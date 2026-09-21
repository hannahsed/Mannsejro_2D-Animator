// src/js/ui/layersUI.js
import { state, BLEND_MODES, COLOR_TAGS } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { requestRender } from '../render/renderEngine.js';
import { renderTimelineFilmstrip } from '../timeline/filmstrip.js';
import { saveHistoryState } from '../project/history.js';
import { copyTiles, blitCanvasIntoTiles, compositeLayerRegion } from '../infiniteCanvas.js';
import { drawStroke } from '../canvasUtils.js';
import { scheduleAutosave } from '../project/autosave.js';
import { showToast, escapeHtml } from './toast.js';

let layerDragState = null;
let suppressLayerClick = false;
let layerContextMenuEl = null;
let contextLayerId = null;

/* ---------------------------------------------------------
   Context Menu Helpers
--------------------------------------------------------- */
function hideLayerContextMenu() {
  if (layerContextMenuEl) {
    layerContextMenuEl.classList.add('hidden');
  }
  contextLayerId = null;
}

function getLayerContextMenu() {
  if (layerContextMenuEl) return layerContextMenuEl;
  layerContextMenuEl = document.createElement('div');
  layerContextMenuEl.id = 'layer-context-menu';
  layerContextMenuEl.className =
    'fixed z-[120] min-w-[210px] bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl p-1.5 hidden select-none text-xs text-slate-200';
  document.body.appendChild(layerContextMenuEl);

  window.addEventListener(
    'pointerdown',
    (e) => {
      if (!layerContextMenuEl.classList.contains('hidden') && !layerContextMenuEl.contains(e.target)) {
        hideLayerContextMenu();
      }
    },
    true
  );
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideLayerContextMenu();
  });
  return layerContextMenuEl;
}

export function showLayerContextMenu(layerId, clientX, clientY) {
  const menu = getLayerContextMenu();
  contextLayerId = layerId;
  const layer = state.project.layers.find((l) => l.id === layerId);
  if (!layer) return;

  const idx = state.project.layers.findIndex((l) => l.id === layerId);
  const canMergeDown = idx > 0;
  const canDelete = state.project.layers.length > 1;

  const row = (action, label, shortcut = '', disabled = false, danger = false) => `
    <button data-layer-action="${action}" class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition ${
      disabled
        ? 'opacity-35 cursor-not-allowed'
        : danger
          ? 'text-orange-400 hover:bg-orange-950/50 hover:text-orange-200'
          : 'hover:bg-slate-800 text-slate-200'
    }">
      <span>${label}</span>
      ${shortcut ? `<span class="text-[10px] font-mono text-slate-500">${shortcut}</span>` : ''}
    </button>
  `;

  menu.innerHTML = `
    <div class="px-2.5 py-1 text-[10px] font-mono font-bold text-orange-400 uppercase tracking-wider truncate">${escapeHtml(
      layer.name
    )}</div>
    ${row('rename', 'Rename Layer', 'Dbl-Click')}
    ${row('duplicate', 'Duplicate Layer')}
    ${row('toggle-persist', layer.persistent ? 'Convert to Animation Layer' : 'Make Persistent (Pinned Background)')}
    ${row('propagate-all', 'Propagate to All Frames in Timeline')}
    ${row('toggle-clip', layer.clippingMask ? 'Unclip Mask' : 'Create Clipping Mask')}
    ${row('toggle-alpha', layer.alphaLocked ? 'Unlock Alpha' : 'Lock Alpha')}
    ${row('toggle-lock', layer.locked ? 'Unlock Layer' : 'Lock Layer')}
    ${row('solo', state.soloMemory ? 'Exit Solo Mode' : 'Solo Layer', 'Alt+Click')}
    <div class="my-1 h-px bg-slate-800"></div>
    <div class="px-2.5 py-1 text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Color Tag</div>
    <div class="flex items-center gap-1.5 px-2 py-1">
      ${COLOR_TAGS.map(
        (ct) => `
        <button data-layer-color="${ct.id || 'none'}" title="${ct.label}" class="w-4 h-4 rounded-full border border-white/20 transition hover:scale-125 ${
          layer.colorTag === ct.id ? 'ring-2 ring-orange-400' : ''
        }" style="background-color: ${ct.hex};"></button>
      `
      ).join('')}
    </div>
    <div class="my-1 h-px bg-slate-800"></div>
    ${row('bake-layer', 'Bake Layer to Pixels')}
    ${row('clear', 'Clear Layer')}
    ${row('merge-down', 'Merge Down', '', !canMergeDown)}
    ${row('merge-visible', 'Merge Visible')}
    ${row('flatten', 'Flatten All Layers')}
    <div class="my-1 h-px bg-slate-800"></div>
    ${row('delete', 'Delete Layer', 'Del', !canDelete, true)}
  `;

  menu.classList.remove('hidden');
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - rect.width - 12))}px`;
  menu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - rect.height - 12))}px`;

  menu.querySelectorAll('[data-layer-action]').forEach((b) => {
    b.addEventListener('click', () => {
      const action = b.dataset.layerAction;
      hideLayerContextMenu();
      handleLayerAction(action, layerId);
    });
  });

  menu.querySelectorAll('[data-layer-color]').forEach((b) => {
    b.addEventListener('click', () => {
      const col = b.dataset.layerColor === 'none' ? null : b.dataset.layerColor;
      hideLayerContextMenu();
      layer.colorTag = col;
      renderLayersList();
      saveHistoryState();
    });
  });
}

function handleLayerAction(action, layerId) {
  const layer = state.project.layers.find((l) => l.id === layerId);
  if (!layer) return;

  if (action === 'toggle-persist') {
    toggleLayerPersistence(layerId);
  } else if (action === 'propagate-all') {
    propagateLayerAcrossTimeline(layerId);
  } else if (action === 'rename') {
    startRenamingLayer(layerId);
  } else if (action === 'duplicate') {
    duplicateLayer(layerId);
  } else if (action === 'toggle-clip') {
    layer.clippingMask = !layer.clippingMask;
    renderLayersList();
    requestRender();
    saveHistoryState();
    showToast(layer.clippingMask ? 'Clipping mask active' : 'Clipping mask removed');
  } else if (action === 'toggle-alpha') {
    layer.alphaLocked = !layer.alphaLocked;
    renderLayersList();
    saveHistoryState();
    showToast(layer.alphaLocked ? 'Alpha lock ON' : 'Alpha lock OFF');
  } else if (action === 'toggle-lock') {
    layer.locked = !layer.locked;
    renderLayersList();
    saveHistoryState();
  } else if (action === 'solo') {
    toggleSoloLayer(layerId);
  } else if (action === 'bake-layer') {
    bakeLayerToPixels(layerId);
  } else if (action === 'clear') {
    clearLayerPixels(layerId);
  } else if (action === 'merge-down') {
    mergeLayerDown(layerId);
  } else if (action === 'merge-visible') {
    mergeVisibleLayers();
  } else if (action === 'flatten') {
    flattenProjectImage();
  } else if (action === 'delete') {
    deleteLayer(layerId);
  }
}

/* ---------------------------------------------------------
   Core Layer Modifications
--------------------------------------------------------- */
/**
 * Copies the current frame's artwork on this layer to every frame across the entire timeline.
 */
export function propagateLayerAcrossTimeline(layerId) {
  const currentF = state.project.frames[state.currentFrameIndex];
  if (!currentF) return;

  const sourceData = currentF.layerData[layerId];
  if (!sourceData) return;

  const layer = state.project.layers.find((l) => l.id === layerId);
  if (!layer) return;
  layer.persistent = true; // Auto-mark as persistent

  state.project.frames.forEach((frame) => {
    frame.layerData[layerId] = {
      tiles: copyTiles(sourceData.tiles),
      strokes: sourceData.strokes ? JSON.parse(JSON.stringify(sourceData.strokes)) : []
    };
  });

  renderLayersList();
  renderTimelineFilmstrip();
  requestRender();
  saveHistoryState();
  showToast(`Propagated "${layer.name}" across all ${state.project.frames.length} frames!`);
}

export function toggleLayerPersistence(layerId) {
  const layer = state.project.layers.find((l) => l.id === layerId);
  if (!layer) return;

  layer.persistent = !layer.persistent;
  renderLayersList();
  saveHistoryState();
  showToast(layer.persistent ? `"${layer.name}" is now Persistent (Pinned across new frames)` : `"${layer.name}" is now an Animation Layer (Blanks on new frames)`);
}

export function toggleSoloLayer(targetId) {
  if (state.soloMemory) {
    // Restore previous visibilities
    state.project.layers.forEach((l) => {
      if (state.soloMemory[l.id] !== undefined) l.visible = state.soloMemory[l.id];
    });
    state.soloMemory = null;
    showToast('Exited Solo Mode');
  } else {
    // Save current states and isolate target
    state.soloMemory = {};
    state.project.layers.forEach((l) => {
      state.soloMemory[l.id] = l.visible;
      l.visible = l.id === targetId;
    });
    showToast('Layer Solo Active');
  }
  renderLayersList();
  requestRender();
  saveHistoryState();
}

export function duplicateLayer(layerId) {
  const target = state.project.layers.find((l) => l.id === layerId);
  if (!target) return;
  const dupId = `layer_dup_${Date.now()}`;
  const idx = state.project.layers.findIndex((l) => l.id === layerId);
  const cloned = {
    ...target,
    id: dupId,
    name: `${target.name} Copy`,
  };
  state.project.layers.splice(idx + 1, 0, cloned);
  state.project.frames.forEach((f) => {
    f.layerData[dupId] = { tiles: copyTiles(f.layerData[target.id]?.tiles) };
  });
  state.activeLayerId = dupId;
  renderLayersList();
  requestRender();
  renderTimelineFilmstrip();
  saveHistoryState();
  showToast(`Duplicated "${target.name}"`);
}

export function deleteLayer(layerId) {
  if (state.project.layers.length <= 1) {
    showToast('Cannot delete the only layer');
    return;
  }
  const idx = state.project.layers.findIndex((l) => l.id === layerId);
  if (idx < 0) return;
  state.project.layers.splice(idx, 1);
  state.project.frames.forEach((f) => {
    delete f.layerData[layerId];
  });
  state.activeLayerId = state.project.layers[Math.max(0, idx - 1)].id;
  renderLayersList();
  requestRender();
  renderTimelineFilmstrip();
  saveHistoryState();
}

export async function bakeLayerToPixels(layerId) {
  const layer = state.project.layers.find((l) => l.id === layerId);
  if (!layer) return;

  const w = state.project.width;
  const h = state.project.height;

  for (const frame of state.project.frames) {
    const layerEntry = frame.layerData[layerId];
    if (!layerEntry) continue;
    const tiles = layerEntry.tiles || {};
    const strokes = layerEntry.strokes || [];
    if (Object.keys(tiles).length === 0 && strokes.length === 0) continue;

    const c = await compositeLayerRegion(tiles, 0, 0, w, h);
    if (strokes.length > 0) {
      const ctx = c.getContext('2d');
      for (const s of strokes) {
        drawStroke(ctx, s.points, s.tool, s.settings);
      }
      layerEntry.strokes = [];
    }
    layerEntry.tiles = {};
    await blitCanvasIntoTiles(layerEntry.tiles, c, 0, 0, 'source-over');
  }

  requestRender();
  renderTimelineFilmstrip();
  saveHistoryState();
  scheduleAutosave(true);
  showToast(`Baked "${layer.name}" into pure pixel tiles`);
}

export async function clearLayerPixels(layerId) {
  const frame = state.project.frames[state.currentFrameIndex];
  if (!frame) return;
  frame.layerData[layerId] = { tiles: {} };
  renderLayersList();
  requestRender();
  renderTimelineFilmstrip();
  saveHistoryState();
  showToast('Cleared layer content');
}

export async function mergeLayerDown(layerId) {
  const layers = state.project.layers;
  const idx = layers.findIndex((l) => l.id === layerId);
  if (idx <= 0) {
    showToast('No layer below to merge into', 'error');
    return;
  }
  const upper = layers[idx];
  const lower = layers[idx - 1];
  if (lower.locked) {
    showToast(`"${lower.name}" is locked — unlock it to merge`, 'error');
    return;
  }

  const w = state.project.width;
  const h = state.project.height;

  for (const frame of state.project.frames) {
    const upperTiles = frame.layerData[upper.id]?.tiles;
    if (!upperTiles || Object.keys(upperTiles).length === 0) continue;

    // Composite upper layer tiles into a flat canvas
    const c = await compositeLayerRegion(upperTiles, 0, 0, w, h);
    const store = frame.layerData[lower.id] || (frame.layerData[lower.id] = { tiles: {} });
    await blitCanvasIntoTiles(store.tiles, c, 0, 0, upper.blendMode || 'source-over');
    delete frame.layerData[upper.id];
  }

  layers.splice(idx, 1);
  state.activeLayerId = lower.id;
  renderLayersList();
  requestRender();
  renderTimelineFilmstrip();
  saveHistoryState();
  showToast(`Merged "${upper.name}" into "${lower.name}"`);
}

export async function mergeVisibleLayers() {
  const visible = state.project.layers.filter((l) => l.visible);
  if (visible.length <= 1) {
    showToast('Need at least 2 visible layers to merge');
    return;
  }

  const base = visible[0];
  const w = state.project.width;
  const h = state.project.height;

  for (const frame of state.project.frames) {
    const combined = document.createElement('canvas');
    combined.width = w;
    combined.height = h;
    const cctx = combined.getContext('2d');

    for (const l of visible) {
      const t = frame.layerData[l.id]?.tiles;
      if (!t) continue;
      const layerCanvas = await compositeLayerRegion(t, 0, 0, w, h);
      cctx.save();
      cctx.globalAlpha = l.opacity !== undefined ? l.opacity : 1;
      cctx.globalCompositeOperation = l.blendMode || 'source-over';
      cctx.drawImage(layerCanvas, 0, 0);
      cctx.restore();
    }

    frame.layerData[base.id] = { tiles: {} };
    await blitCanvasIntoTiles(frame.layerData[base.id].tiles, combined, 0, 0, 'source-over');
    for (let i = 1; i < visible.length; i++) {
      delete frame.layerData[visible[i].id];
    }
  }

  state.project.layers = state.project.layers.filter((l) => !visible.slice(1).some((v) => v.id === l.id));
  base.name = 'Merged Visible';
  base.opacity = 1;
  base.blendMode = 'source-over';
  base.clippingMask = false;
  state.activeLayerId = base.id;

  renderLayersList();
  requestRender();
  renderTimelineFilmstrip();
  saveHistoryState();
  showToast('Merged visible layers');
}

export async function flattenProjectImage() {
  const w = state.project.width;
  const h = state.project.height;

  for (const frame of state.project.frames) {
    const flattened = document.createElement('canvas');
    flattened.width = w;
    flattened.height = h;
    const ctx = flattened.getContext('2d');
    ctx.fillStyle = state.project.backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, w, h);

    for (const l of state.project.layers) {
      if (!l.visible) continue;
      const t = frame.layerData[l.id]?.tiles;
      if (!t) continue;
      const layerCanvas = await compositeLayerRegion(t, 0, 0, w, h);
      ctx.save();
      ctx.globalAlpha = l.opacity !== undefined ? l.opacity : 1;
      ctx.globalCompositeOperation = l.blendMode || 'source-over';
      ctx.drawImage(layerCanvas, 0, 0);
      ctx.restore();
    }

    const flatTiles = {};
    await blitCanvasIntoTiles(flatTiles, flattened, 0, 0, 'source-over');
    frame.layerData = { layer_flattened: { tiles: flatTiles } };
  }

  state.project.layers = [
    {
      id: 'layer_flattened',
      name: 'Background',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'source-over',
      clippingMask: false,
      alphaLocked: false,
      colorTag: null,
    },
  ];
  state.activeLayerId = 'layer_flattened';

  renderLayersList();
  requestRender();
  renderTimelineFilmstrip();
  saveHistoryState();
  showToast('Flattened artwork');
}

/* ---------------------------------------------------------
   DOM Renderer for Layers Panel
--------------------------------------------------------- */
export function renderLayersList() {
  if (!elements.layersListContainer) return;
  elements.layersListContainer.innerHTML = '';

  const activeLayer = state.project.layers.find((l) => l.id === state.activeLayerId);
  if (activeLayer) {
    if (elements.sliderLayerOpacity) elements.sliderLayerOpacity.value = Math.round(activeLayer.opacity * 100);
    if (elements.layerOpacityVal) elements.layerOpacityVal.textContent = `${Math.round(activeLayer.opacity * 100)}%`;
    if (elements.selectLayerBlend) {
      elements.selectLayerBlend.innerHTML = BLEND_MODES.map(
        (bm) => `<option value="${bm.value}" ${activeLayer.blendMode === bm.value ? 'selected' : ''}>${bm.label}</option>`
      ).join('');
    }
  }

  // Render top-to-bottom (highest layer index first)
  const reversedLayers = [...state.project.layers].reverse();

  reversedLayers.forEach((layer) => {
    const isCurrentActive = layer.id === state.activeLayerId;
    const tagInfo = COLOR_TAGS.find((c) => c.id === layer.colorTag);
    const isPersistent = Boolean(layer.persistent);
    const row = document.createElement('div');
    row.dataset.layerId = layer.id;
    row.title = 'Click to select · Right-click for options · Drag to reorder · Dbl-click to rename';

    row.className = `group relative p-2 rounded-xl border flex items-center justify-between transition cursor-pointer select-none ${
      layer.clippingMask ? 'ml-4 border-l-4 border-l-orange-400' : ''
    } ${
      isCurrentActive
        ? 'bg-orange-500/15 border-orange-500/80 text-white shadow-md shadow-orange-500/20'
        : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 text-slate-300'
    }`;

    const colorIndicator = tagInfo && tagInfo.id ? `<span class="w-1.5 h-6 rounded-full shrink-0" style="background-color: ${tagInfo.hex}"></span>` : '';

    row.innerHTML = `
      <div class="flex items-center gap-2 min-w-0 flex-1">
        ${colorIndicator}
        ${layer.clippingMask ? '<span class="text-[10px] text-orange-400 font-bold">↳</span>' : ''}
        <button class="btn-toggle-vis p-1 text-slate-400 hover:text-white shrink-0" title="Toggle visibility (Alt+Click to solo)">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            ${
              layer.visible
                ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />'
                : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />'
            }
          </svg>
        </button>
        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="layer-name-text text-xs font-semibold truncate">${escapeHtml(layer.name)}</span>
            ${isPersistent ? '<span class="inline-flex items-center gap-1 text-[9px] px-1 py-0.5 rounded bg-orange-500/20 text-orange-300 font-mono font-bold shrink-0" title="Persistent: fixed background across frames"><svg class="w-2.5 h-2.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>BG</span>' : ''}
          </div>
          <span class="text-[9px] text-slate-500 font-mono truncate">${Math.round((layer.opacity || 1) * 100)}% · ${
      BLEND_MODES.find((m) => m.value === (layer.blendMode || 'source-over'))?.label || 'Normal'
    }</span>
        </div>
      </div>

      <!-- Quick Toggles -->
      <div class="flex items-center gap-1 shrink-0">
        <!-- PERSISTENCE PIN BUTTON -->
        <button class="btn-toggle-persist p-1 rounded hover:bg-slate-800 ${
          isPersistent ? 'text-orange-400 opacity-100' : 'text-slate-500 opacity-40 group-hover:opacity-100'
        }" title="${isPersistent ? 'Persistent Layer (Pinned across new frames)' : 'Click to make Persistent (Auto-held for backgrounds)'}">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>

        <button class="btn-toggle-clip p-1 rounded hover:bg-slate-800 ${
          layer.clippingMask ? 'text-orange-400' : 'text-slate-500 opacity-40 group-hover:opacity-100'
        }" title="Clipping Mask: clip to layer below">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
        </button>
        <button class="btn-toggle-alpha p-1 rounded hover:bg-slate-800 ${
          layer.alphaLocked ? 'text-orange-400' : 'text-slate-500 opacity-40 group-hover:opacity-100'
        }" title="Alpha Lock: paint only inside opaque pixels">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2" />
            <path d="M7 7h4v4H7zM13 13h4v4h-4z" fill="currentColor" stroke="none" />
          </svg>
        </button>
        <button class="btn-toggle-lock p-1 rounded hover:bg-slate-800 ${
          layer.locked ? 'text-orange-400' : 'text-slate-500 opacity-40 group-hover:opacity-100'
        }" title="Lock Layer">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            ${
              layer.locked
                ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />'
                : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />'
            }
          </svg>
        </button>
      </div>
    `;

    // Left Click Actions
    row.addEventListener('click', (e) => {
      if (suppressLayerClick) {
        suppressLayerClick = false;
        return;
      }
      if (e.target.closest('.btn-toggle-persist')) {
        toggleLayerPersistence(layer.id);
        return;
      }
      if (e.target.closest('.btn-toggle-vis')) {
        if (e.altKey) {
          toggleSoloLayer(layer.id);
        } else {
          layer.visible = !layer.visible;
          renderLayersList();
          requestRender();
          saveHistoryState();
        }
        return;
      }
      if (e.target.closest('.btn-toggle-clip')) {
        layer.clippingMask = !layer.clippingMask;
        renderLayersList();
        requestRender();
        saveHistoryState();
        return;
      }
      if (e.target.closest('.btn-toggle-alpha')) {
        layer.alphaLocked = !layer.alphaLocked;
        renderLayersList();
        saveHistoryState();
        showToast(layer.alphaLocked ? `Alpha lock on "${layer.name}"` : `Alpha lock off`);
        return;
      }
      if (e.target.closest('.btn-toggle-lock')) {
        layer.locked = !layer.locked;
        renderLayersList();
        saveHistoryState();
        return;
      }

      state.activeLayerId = layer.id;
      renderLayersList();
      requestRender();
    });

    // Right-Click Context Menu Trigger
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.activeLayerId = layer.id;
      renderLayersList();
      showLayerContextMenu(layer.id, e.clientX, e.clientY);
    });

    elements.layersListContainer.appendChild(row);
  });
}

function startRenamingLayer(layerId) {
  const row = elements.layersListContainer.querySelector(`[data-layer-id="${layerId}"]`);
  if (!row) return;
  const nameEl = row.querySelector('.layer-name-text');
  if (!nameEl) return;
  const layer = state.project.layers.find((l) => l.id === layerId);
  if (!layer) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = layer.name;
  input.className =
    'bg-slate-950 text-xs font-semibold text-white px-2 py-0.5 rounded border border-blue-500 outline-none w-32 shadow-inner';
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;
  const commit = (save) => {
    if (committed) return;
    committed = true;
    if (save && input.value.trim()) {
      layer.name = input.value.trim();
      saveHistoryState();
    }
    renderLayersList();
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') commit(true);
    if (e.key === 'Escape') commit(false);
  });
  input.addEventListener('blur', () => commit(true));
}

let layersInteractionsSetup = false;
export function setupLayersInteractions() {
  if (layersInteractionsSetup || !elements.layersListContainer) return;
  layersInteractionsSetup = true;

  // Global right-click suppression on layer panel container to stop funky default browser menu
  elements.layersListContainer.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('[data-layer-id]');
    if (!row) e.preventDefault();
  });

  // Reordering Drag-and-Drop
  elements.layersListContainer.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const row = e.target.closest('[data-layer-id]');
    if (!row || e.target.closest('button') || e.target.closest('input')) return;

    layerDragState = {
      id: row.dataset.layerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      overId: null,
    };

    const onMove = (me) => {
      if (!layerDragState) return;
      const dx = me.clientX - layerDragState.startX;
      const dy = me.clientY - layerDragState.startY;
      if (!layerDragState.moved && dx * dx + dy * dy < 16) return;
      layerDragState.moved = true;
      const el = document.elementFromPoint(me.clientX, me.clientY);
      const targetRow = el?.closest('[data-layer-id]');
      layerDragState.overId = targetRow ? targetRow.dataset.layerId : null;
      updateDragVisuals();
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (layerDragState?.moved && layerDragState.overId && layerDragState.overId !== layerDragState.id) {
        suppressLayerClick = true;
        reorderLayer(layerDragState.id, layerDragState.overId);
      }
      layerDragState = null;
      updateDragVisuals();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  elements.layersListContainer.addEventListener('dblclick', (e) => {
    const row = e.target.closest('[data-layer-id]');
    if (row) startRenamingLayer(row.dataset.layerId);
  });
}

function updateDragVisuals() {
  const rows = elements.layersListContainer.querySelectorAll('[data-layer-id]');
  rows.forEach((row) => {
    const id = row.dataset.layerId;
    const isSource = layerDragState?.moved && id === layerDragState.id;
    const isTarget = layerDragState?.moved && id === layerDragState.overId && id !== layerDragState.id;
    row.classList.toggle('opacity-40', Boolean(isSource));
    row.classList.toggle('ring-2', Boolean(isTarget));
    row.classList.toggle('ring-blue-400', Boolean(isTarget));
  });
}

function reorderLayer(sourceId, targetId) {
  const layers = state.project.layers;
  const from = layers.findIndex((l) => l.id === sourceId);
  const to = layers.findIndex((l) => l.id === targetId);
  if (from < 0 || to < 0 || from === to) return;
  const [moved] = layers.splice(from, 1);
  layers.splice(to, 0, moved);
  renderLayersList();
  requestRender();
  saveHistoryState();
}
