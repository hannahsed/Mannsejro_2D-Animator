// src/js/ui/colorPalettes.js
import {
  state,
  VECTOR_PRESETS,
  PIXEL_PRESETS,
  PENCIL_GRADES
} from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { showToast } from './toast.js';
import { refreshQuickPaletteUI } from './quickPalette.js';
import { requestRender } from '../render/renderEngine.js';
import {
  PAPER_PRESETS,
  currentPaperPresetId,
  setPaperPreset,
  togglePaperTexture,
  paperTextureEnabled
} from '../render/paperTextures.js';
import {
  perspectiveStudioState,
  rotatePerspectiveQuad,
  resetTo90Degrees,
  computeInteriorAngles,
  cancelPerspectiveStudio
} from '../viewport/perspectiveRectangleStudio.js';
import {
  polygonStudioState,
  closeAndCommitPolygon,
  popLastPolygonVertex,
  cancelPolygonStudio
} from '../viewport/polygonStudio.js';
import {
  nodeToolState,
  commitNodeTool,
  removeActiveNode,
  cancelNodeTool
} from '../viewport/nodeTool.js';
import {
  selectToolState,
  deleteSelectedStrokes,
  duplicateSelectedStrokes,
  clearSelection,
  selectAllStrokes,
  flipSelectedStrokes
} from '../viewport/selectTool.js';
import {
  PROPS_REGISTRY,
  stampPropAtCenter,
  scatterPropAcrossArea
} from '../render/propsLibrary.js';

/**
 * Global Switcher: Sets the engine space and transitions the UI
 * @param {'vector' | 'pixel'} mode
 */
export function setEngineMode(mode) {
  state.engineMode = mode;
  state.toolSettings.strokeSpace = mode;

  const btnVector = document.getElementById('btn-mode-vector');
  const btnPixel = document.getElementById('btn-mode-pixel');
  const tbVector = document.getElementById('toolbar-vector-tools');
  const tbPixel = document.getElementById('toolbar-pixel-tools');
  const statusBadge = document.getElementById('status-engine-mode');

  if (mode === 'vector') {
    state.currentTool = 'vector-pen';
    state.toolSettings.vectorPreset = 'fine-strokes';
    state.toolSettings.pencilPreset = 'fine-strokes';
    
    btnVector?.classList.add('bg-sky-500', 'text-slate-950', 'shadow-md', 'shadow-sky-500/25');
    btnVector?.classList.remove('text-slate-400');
    btnPixel?.classList.remove('bg-amber-500', 'text-slate-950', 'shadow-md', 'shadow-amber-500/25');
    btnPixel?.classList.add('text-slate-400');

    tbVector?.classList.remove('hidden');
    tbPixel?.classList.add('hidden');

    if (statusBadge) {
      statusBadge.textContent = 'VECTOR SPACE';
      statusBadge.className = 'text-sky-400 font-sans font-bold';
    }
    showToast('Switched to Vector Space Mode — Resolution-Independent Curves');
  } else {
    state.currentTool = 'graphite';
    state.toolSettings.pixelPreset = 'graphite';
    state.toolSettings.pencilPreset = 'graphite';

    btnPixel?.classList.add('bg-amber-500', 'text-slate-950', 'shadow-md', 'shadow-amber-500/25');
    btnPixel?.classList.remove('text-slate-400');
    btnVector?.classList.remove('bg-sky-500', 'text-slate-950', 'shadow-md', 'shadow-sky-500/25');
    btnVector?.classList.add('text-slate-400');

    tbPixel?.classList.remove('hidden');
    tbVector?.classList.add('hidden');

    if (statusBadge) {
      statusBadge.textContent = 'PIXEL SPACE';
      statusBadge.className = 'text-amber-400 font-sans font-bold';
    }
    showToast('Switched to Pixel Space Mode — Natural Media & Bitmap Tiles');
  }

  updateToolbarActiveState();
  updateToolPanelForCurrentTool();
  requestRender();
}

/**
 * Updates the Tool Inspector sidebar according to the active space
 */
export function updateToolPanelForCurrentTool() {
  const panel = document.getElementById('tab-content-tool');
  if (!panel) return;

  if (state.engineMode === 'vector') {
    renderVectorToolInspector(panel);
  } else {
    renderPixelToolInspector(panel);
  }
}

/**
 * Dedicated Shape, Straight Line & Perspective Studio Inspector
 */
function renderShapeStudioInspector(panel, isPixelSpace = false) {
  const st = state.toolSettings;
  const activeShape = st.shapeType || st.activeShapeType || 'rectangle';
  const rectMode = st.rectMode || st.rectSubMode || 'standard';
  const isBox = rectMode === 'cube';
  const accentColor = isPixelSpace ? 'amber' : 'sky';
  const accentClass = isPixelSpace ? 'text-amber-400' : 'text-sky-400';
  const accentSlider = isPixelSpace ? '!accent-amber-400' : '!accent-sky-400';
  const accentPill = isPixelSpace ? '!bg-amber-500 !text-slate-950 font-bold' : 'active';

  // Compute live angles if perspective quad is active
  let interiorAngles = [90, 90, 90, 90];
  if (perspectiveStudioState.active && perspectiveStudioState.nodes) {
    interiorAngles = computeInteriorAngles(perspectiveStudioState.nodes);
  }

  panel.innerHTML = `
    <div class="space-y-3 select-none">
      <div class="spec-header ${accentClass} flex items-center justify-between">
        <span>${isPixelSpace ? 'Raster Shapes & Lines' : 'Vector Shapes & Lines'}</span>
        <span class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${isPixelSpace ? 'bg-amber-500/20 text-amber-300' : 'bg-sky-500/20 text-sky-300'}">
          ${isPixelSpace ? 'Tile Baked' : 'Vector Curves'}
        </span>
      </div>

      <!-- Primary Geometry Type Selector -->
      <div class="spec-card">
        <div class="spec-header">
          <span class="text-slate-200">Geometry Tool</span>
          <span class="font-mono ${accentClass} font-bold capitalize">${activeShape}</span>
        </div>
        <div class="grid grid-cols-4 gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs font-bold text-center">
          <button id="btn-shape-line" class="spec-pill-btn ${activeShape === 'line' ? accentPill : ''}">Line</button>
          <button id="btn-shape-rect" class="spec-pill-btn ${activeShape === 'rectangle' ? accentPill : ''}">Rect</button>
          <button id="btn-shape-ellipse" class="spec-pill-btn ${activeShape === 'ellipse' ? accentPill : ''}">Ellipse</button>
          <button id="btn-shape-polygon" class="spec-pill-btn ${activeShape === 'polygon' ? accentPill : ''}">Poly</button>
        </div>
      </div>

      <!-- 1. STRAIGHT LINE SETTINGS -->
      ${activeShape === 'line' ? `
        <div class="spec-card space-y-2.5">
          <div class="spec-header text-slate-200">Straight Line Properties</div>
          
          <div class="space-y-1">
            <div class="flex justify-between text-xs font-semibold">
              <span class="text-slate-300">Stroke Thickness</span>
              <span id="label-shape-size" class="font-mono ${accentClass} font-bold">${st.size || 2} px</span>
            </div>
            <input id="slider-shape-size" type="range" min="1" max="48" value="${st.size || 2}" class="spec-slider ${accentSlider}" />
          </div>

          <div class="space-y-1 pt-1.5 border-t border-slate-800">
            <div class="text-xs font-semibold text-slate-300">Line Cap</div>
            <div class="spec-pill-container">
              <button id="btn-linecap-round" class="spec-pill-btn ${st.lineCap !== 'butt' ? accentPill : ''}">Round</button>
              <button id="btn-linecap-butt" class="spec-pill-btn ${st.lineCap === 'butt' ? accentPill : ''}">Square / Butt</button>
            </div>
          </div>

          <div class="space-y-1 pt-1.5 border-t border-slate-800">
            <div class="text-xs font-semibold text-slate-300">Stroke Style</div>
            <div class="spec-pill-container">
              <button id="btn-dash-solid" class="spec-pill-btn ${st.strokeDash === 'solid' || !st.strokeDash ? accentPill : ''}">Solid</button>
              <button id="btn-dash-dashed" class="spec-pill-btn ${st.strokeDash === 'dashed' ? accentPill : ''}">Dashed</button>
              <button id="btn-dash-dotted" class="spec-pill-btn ${st.strokeDash === 'dotted' ? accentPill : ''}">Dotted</button>
            </div>
          </div>

          <div class="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[10px] text-slate-400">
            💡 <strong class="text-slate-200">Tip:</strong> Hold <strong class="text-sky-300">Shift</strong> while dragging to snap to 45° angle increments.
          </div>
        </div>
      ` : ''}

      <!-- 2. RECTANGLE / PERSPECTIVE / 3D CUBE SETTINGS -->
      ${activeShape === 'rectangle' ? `
        <div class="spec-card">
          <div class="spec-header">
            <span class="text-slate-200">Mode</span>
            <span class="font-mono ${accentClass} font-bold capitalize">${rectMode === 'standard' ? '2D Rect' : rectMode === 'cube' ? '3D Cube' : 'Perspective Quad'}</span>
          </div>
          <div class="spec-pill-container">
            <button id="btn-rect-mode-standard" class="spec-pill-btn ${rectMode === 'standard' ? accentPill : ''}">2D Rect</button>
            <button id="btn-rect-mode-persp" class="spec-pill-btn ${rectMode === 'perspective' ? accentPill : ''}">Perspective</button>
            <button id="btn-rect-mode-cube" class="spec-pill-btn ${rectMode === 'cube' ? accentPill : ''}">3D Cube</button>
          </div>
        </div>

        ${rectMode === 'standard' ? `
          <div class="spec-card space-y-2">
            <div class="flex justify-between text-xs font-semibold">
              <span class="text-slate-300">Corner Radius</span>
              <span id="label-corner-radius" class="font-mono ${accentClass} font-bold">${st.cornerRadius || 0} px</span>
            </div>
            <input id="slider-corner-radius" type="range" min="0" max="40" value="${st.cornerRadius || 0}" class="spec-slider ${accentSlider}" />
            <div class="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[10px] text-slate-400">
              💡 <strong class="text-slate-200">Tip:</strong> Hold <strong class="text-sky-300">Shift</strong> while dragging for a 1:1 square.
            </div>
          </div>
        ` : ''}

        ${rectMode !== 'standard' ? `
          <div class="spec-card space-y-2 border-${accentColor}-500/30">
            <div class="spec-header text-slate-200">Angle & Rotation Tools</div>
            <div class="p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-[10px] font-mono space-y-1">
              <div class="flex justify-between text-slate-400">
                <span>Interior Angles:</span>
                <button id="btn-snap-90" class="${accentClass} hover:underline font-bold cursor-pointer">Reset 90°</button>
              </div>
              <div class="grid grid-cols-4 gap-1 text-center font-bold text-slate-200">
                <div class="p-1 rounded bg-slate-900">TL: ${interiorAngles[0]}°</div>
                <div class="p-1 rounded bg-slate-900">TR: ${interiorAngles[1]}°</div>
                <div class="p-1 rounded bg-slate-900">BR: ${interiorAngles[2]}°</div>
                <div class="p-1 rounded bg-slate-900">BL: ${interiorAngles[3]}°</div>
              </div>
            </div>

            ${isBox ? `
              <div class="space-y-1.5 pt-2 border-t border-slate-800">
                <div class="flex justify-between text-xs font-semibold">
                  <span class="text-slate-300">Cube Extrusion Height</span>
                  <span id="label-cube-ext" class="font-mono ${accentClass} font-bold">${st.cubeExtrusion || 80} px</span>
                </div>
                <input id="slider-cube-ext" type="range" min="20" max="250" value="${st.cubeExtrusion || 80}" class="spec-slider ${accentSlider}" />
              </div>

              <div class="space-y-1.5 pt-2 border-t border-slate-800">
                <div class="flex justify-between text-xs font-semibold">
                  <span class="text-slate-300">Cube Visibility</span>
                  <span class="font-mono ${accentClass} font-bold">
                    ${st.cubeVisibility === 'shaded3' ? '3 Visible Sides' : st.cubeVisibility === 'all' ? 'All Sides (X-Ray)' : 'Cutaway Room'}
                  </span>
                </div>
                <div class="spec-pill-container !p-0.5">
                  <button id="btn-vis-3" class="spec-pill-btn !py-1 !text-[10px] ${st.cubeVisibility === 'shaded3' ? accentPill : ''}">3-Sided</button>
                  <button id="btn-vis-all" class="spec-pill-btn !py-1 !text-[10px] ${st.cubeVisibility === 'all' ? accentPill : ''}">All Sides</button>
                  <button id="btn-vis-room" class="spec-pill-btn !py-1 !text-[10px] ${st.cubeVisibility === 'cutaway' ? accentPill : ''}">Open Room</button>
                </div>
              </div>
            ` : ''}
          </div>
        ` : ''}
      ` : ''}

      <!-- 3. ELLIPSE TIP -->
      ${activeShape === 'ellipse' ? `
        <div class="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[10px] text-slate-400">
          💡 <strong class="text-slate-200">Tip:</strong> Hold <strong class="text-sky-300">Shift</strong> while dragging for a 1:1 perfect circle.
        </div>
      ` : ''}

      <!-- 4. GENERAL STROKE & FILL SETTINGS FOR CLOSED SHAPES -->
      ${activeShape !== 'line' ? `
        <div class="spec-card space-y-2.5">
          <div class="spec-header text-slate-200">Paint Mode & Stroke</div>
          <div class="spec-pill-container">
            <button id="btn-rect-mode-stroke" class="spec-pill-btn ${st.shapeMode === 'stroke' ? accentPill : ''}">Stroke</button>
            <button id="btn-rect-mode-fill" class="spec-pill-btn ${st.shapeMode === 'fill' ? accentPill : ''}">Fill</button>
            <button id="btn-rect-mode-both" class="spec-pill-btn ${st.shapeMode === 'both' ? accentPill : ''}">Both</button>
          </div>

          <div class="space-y-1 pt-1.5 border-t border-slate-800">
            <div class="flex justify-between text-xs font-semibold">
              <span class="text-slate-300">Stroke Thickness</span>
              <span id="label-rect-size" class="font-mono ${accentClass} font-bold">${st.size || 2} px</span>
            </div>
            <input id="slider-rect-size" type="range" min="1" max="32" value="${st.size || 2}" class="spec-slider ${accentSlider}" />
          </div>

          <div class="space-y-1 pt-1.5 border-t border-slate-800">
            <div class="text-xs font-semibold text-slate-300">Stroke Style</div>
            <div class="spec-pill-container">
              <button id="btn-dash-solid" class="spec-pill-btn ${st.strokeDash === 'solid' || !st.strokeDash ? accentPill : ''}">Solid</button>
              <button id="btn-dash-dashed" class="spec-pill-btn ${st.strokeDash === 'dashed' ? accentPill : ''}">Dashed</button>
              <button id="btn-dash-dotted" class="spec-pill-btn ${st.strokeDash === 'dotted' ? accentPill : ''}">Dotted</button>
            </div>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  // Event Listeners
  panel.querySelector('#btn-shape-line')?.addEventListener('click', () => {
    st.shapeType = 'line';
    st.activeShapeType = 'line';
    updateToolPanelForCurrentTool();
  });
  panel.querySelector('#btn-shape-rect')?.addEventListener('click', () => {
    st.shapeType = 'rectangle';
    st.activeShapeType = 'rectangle';
    updateToolPanelForCurrentTool();
  });
  panel.querySelector('#btn-shape-ellipse')?.addEventListener('click', () => {
    st.shapeType = 'ellipse';
    st.activeShapeType = 'ellipse';
    updateToolPanelForCurrentTool();
  });
  panel.querySelector('#btn-shape-polygon')?.addEventListener('click', () => {
    st.shapeType = 'polygon';
    st.activeShapeType = 'polygon';
    updateToolPanelForCurrentTool();
  });

  panel.querySelector('#btn-rect-mode-standard')?.addEventListener('click', () => {
    st.rectMode = 'standard';
    st.rectSubMode = 'standard';
    updateToolPanelForCurrentTool();
  });
  panel.querySelector('#btn-rect-mode-persp')?.addEventListener('click', () => {
    st.rectMode = 'perspective';
    st.rectSubMode = 'perspective';
    updateToolPanelForCurrentTool();
  });
  panel.querySelector('#btn-rect-mode-cube')?.addEventListener('click', () => {
    st.rectMode = 'cube';
    st.rectSubMode = 'cube';
    updateToolPanelForCurrentTool();
  });

  panel.querySelector('#btn-linecap-round')?.addEventListener('click', () => {
    st.lineCap = 'round';
    updateToolPanelForCurrentTool();
  });
  panel.querySelector('#btn-linecap-butt')?.addEventListener('click', () => {
    st.lineCap = 'butt';
    updateToolPanelForCurrentTool();
  });

  panel.querySelector('#btn-dash-solid')?.addEventListener('click', () => {
    st.strokeDash = 'solid';
    updateToolPanelForCurrentTool();
  });
  panel.querySelector('#btn-dash-dashed')?.addEventListener('click', () => {
    st.strokeDash = 'dashed';
    updateToolPanelForCurrentTool();
  });
  panel.querySelector('#btn-dash-dotted')?.addEventListener('click', () => {
    st.strokeDash = 'dotted';
    updateToolPanelForCurrentTool();
  });

  panel.querySelector('#slider-corner-radius')?.addEventListener('input', (e) => {
    st.cornerRadius = parseInt(e.target.value, 10);
    const lbl = panel.querySelector('#label-corner-radius');
    if (lbl) lbl.textContent = `${st.cornerRadius} px`;
  });

  panel.querySelector('#slider-shape-size')?.addEventListener('input', (e) => {
    st.size = parseInt(e.target.value, 10);
    const lbl = panel.querySelector('#label-shape-size');
    if (lbl) lbl.textContent = `${st.size} px`;
  });

  panel.querySelector('#slider-cube-ext')?.addEventListener('input', (e) => {
    st.cubeExtrusion = parseInt(e.target.value, 10);
    perspectiveStudioState.extrusionHeight = st.cubeExtrusion;
    const lbl = panel.querySelector('#label-cube-ext');
    if (lbl) lbl.textContent = `${st.cubeExtrusion} px`;
    requestRender();
  });

  panel.querySelector('#btn-snap-90')?.addEventListener('click', () => {
    resetTo90Degrees();
    updateToolPanelForCurrentTool();
  });

  panel.querySelector('#btn-vis-3')?.addEventListener('click', () => {
    st.cubeVisibility = 'shaded3';
    perspectiveStudioState.cubeVisibility = 'shaded3';
    updateToolPanelForCurrentTool();
    requestRender();
  });
  panel.querySelector('#btn-vis-all')?.addEventListener('click', () => {
    st.cubeVisibility = 'all';
    perspectiveStudioState.cubeVisibility = 'all';
    updateToolPanelForCurrentTool();
    requestRender();
  });
  panel.querySelector('#btn-vis-room')?.addEventListener('click', () => {
    st.cubeVisibility = 'cutaway';
    perspectiveStudioState.cubeVisibility = 'cutaway';
    updateToolPanelForCurrentTool();
    requestRender();
  });

  ['stroke', 'fill', 'both'].forEach((m) => {
    panel.querySelector(`#btn-rect-mode-${m}`)?.addEventListener('click', () => {
      st.shapeMode = m;
      updateToolPanelForCurrentTool();
      requestRender();
    });
  });
  panel.querySelector('#slider-rect-size')?.addEventListener('input', (e) => {
    st.size = parseInt(e.target.value, 10);
    const lbl = panel.querySelector('#label-rect-size');
    if (lbl) lbl.textContent = `${st.size} px`;
    requestRender();
  });
}

/**
 * Dedicated Node Tool Graph & Branching Path Inspector
 */
function renderNodeToolInspector(panel, isPixelSpace = false) {
  const st = state.toolSettings;
  const accentClass = isPixelSpace ? 'text-amber-400' : 'text-sky-400';
  const accentSlider = isPixelSpace ? '!accent-amber-400' : '!accent-sky-400';
  const nodeCount = nodeToolState.nodes ? nodeToolState.nodes.length : 0;
  const edgeCount = nodeToolState.edges ? nodeToolState.edges.length : 0;

  panel.innerHTML = `
    <div class="space-y-3 select-none">
      <div class="spec-header ${accentClass} flex items-center justify-between">
        <span>Node Graph Studio</span>
        <span class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${isPixelSpace ? 'bg-amber-500/20 text-amber-300' : 'bg-sky-500/20 text-sky-300'}">
          ${nodeToolState.active ? `${nodeCount} Nodes · ${edgeCount} Edges` : 'Ready to Plot'}
        </span>
      </div>

      <!-- Stroke Settings -->
      <div class="spec-card space-y-2.5">
        <div class="spec-header text-slate-200">Path Properties</div>
        
        <div class="space-y-1">
          <div class="flex justify-between text-xs font-semibold">
            <span class="text-slate-300">Stroke Thickness</span>
            <span id="label-node-size" class="font-mono ${accentClass} font-bold">${st.size || 3} px</span>
          </div>
          <input id="slider-node-size" type="range" min="1" max="40" value="${st.size || 3}" class="spec-slider ${accentSlider}" />
        </div>

        <div class="space-y-1 pt-1.5 border-t border-slate-800">
          <div class="flex justify-between text-xs font-semibold">
            <span class="text-slate-300">Opacity</span>
            <span id="label-node-opacity" class="font-mono ${accentClass} font-bold">${Math.round((st.opacity ?? 1.0) * 100)}%</span>
          </div>
          <input id="slider-node-opacity" type="range" min="5" max="100" value="${Math.round((st.opacity ?? 1.0) * 100)}" class="spec-slider ${accentSlider}" />
        </div>
      </div>

      <!-- Node Graph Actions -->
      <div class="spec-card space-y-2">
        <div class="spec-header text-slate-200">Session Controls</div>
        <div class="grid grid-cols-2 gap-1.5">
          <button id="btn-node-commit" class="py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-1">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
            <span>Bake (Enter)</span>
          </button>
          <button id="btn-node-delete-active" class="py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-xs border border-slate-700 transition cursor-pointer flex items-center justify-center gap-1">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            <span>Delete Node</span>
          </button>
        </div>
        <button id="btn-node-cancel" class="w-full py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-semibold text-[11px] border border-rose-500/30 transition cursor-pointer">
          Cancel & Discard Path (Esc)
        </button>
      </div>

      <!-- Quick Guide -->
      <div class="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] space-y-1 text-slate-400 leading-snug">
        <div class="font-bold text-slate-200">How to Use:</div>
        <div>• <strong class="text-sky-300">Click empty canvas</strong> to plot / extend node from active node.</div>
        <div>• <strong class="text-rose-400">Red node</strong> = Active node (new nodes branch from here).</div>
        <div>• <strong class="text-sky-400">Blue node</strong> = Inactive node (click to activate).</div>
        <div>• <strong class="text-amber-300">Shift + Click</strong> another node to create a connecting edge.</div>
        <div>• <strong class="text-emerald-300">Double Click or Enter</strong> to bake the network.</div>
      </div>
    </div>
  `;

  panel.querySelector('#slider-node-size')?.addEventListener('input', (e) => {
    st.size = parseFloat(e.target.value);
    const lbl = panel.querySelector('#label-node-size');
    if (lbl) lbl.textContent = `${st.size} px`;
    requestRender();
  });

  panel.querySelector('#slider-node-opacity')?.addEventListener('input', (e) => {
    st.opacity = parseInt(e.target.value, 10) / 100;
    const lbl = panel.querySelector('#label-node-opacity');
    if (lbl) lbl.textContent = `${Math.round(st.opacity * 100)}%`;
    requestRender();
  });

  panel.querySelector('#btn-node-commit')?.addEventListener('click', async () => {
    await commitNodeTool();
  });

  panel.querySelector('#btn-node-delete-active')?.addEventListener('click', () => {
    removeActiveNode();
  });

  panel.querySelector('#btn-node-cancel')?.addEventListener('click', () => {
    cancelNodeTool();
  });
}

/**
 * Dedicated Select & Transform Studio Inspector
 */
function renderSelectToolInspector(panel, isPixelSpace = false) {
  const accentClass = isPixelSpace ? 'text-amber-400' : 'text-sky-400';
  const selCount = selectToolState.selectedStrokeIds ? selectToolState.selectedStrokeIds.size : 0;
  const b = selectToolState.bounds;
  const hasBounds = Boolean(b);

  panel.innerHTML = `
    <div class="space-y-3 select-none">
      <div class="spec-header ${accentClass} flex items-center justify-between">
        <span>Select & Transform</span>
        <span class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${isPixelSpace ? 'bg-amber-500/20 text-amber-300' : 'bg-sky-500/20 text-sky-300'}">
          ${selCount > 0 ? `${selCount} Selected` : 'Marquee / Click'}
        </span>
      </div>

      <div class="spec-card space-y-2.5">
        <div class="spec-header text-slate-200">Selection Controls</div>
        
        <div class="grid grid-cols-2 gap-1.5">
          <button id="btn-sel-duplicate" class="spec-pill-btn !py-2 !text-xs font-bold ${selCount > 0 ? 'active !bg-sky-500 !text-slate-950' : 'opacity-40 cursor-not-allowed'}" ${selCount === 0 ? 'disabled' : ''}>
            📑 Duplicate
          </button>
          <button id="btn-sel-delete" class="spec-pill-btn !py-2 !text-xs font-bold ${selCount > 0 ? '!bg-rose-500/20 !border-rose-500/40 !text-rose-300 hover:!bg-rose-500/40' : 'opacity-40 cursor-not-allowed'}" ${selCount === 0 ? 'disabled' : ''}>
            🗑️ Delete
          </button>
        </div>

        <div class="grid grid-cols-2 gap-1.5">
          <button id="btn-sel-flip-h" class="spec-pill-btn !py-1.5 !text-xs font-semibold ${selCount > 0 ? 'text-slate-200 hover:bg-slate-800' : 'opacity-40 cursor-not-allowed'}" ${selCount === 0 ? 'disabled' : ''}>
            ↔️ Flip Horiz
          </button>
          <button id="btn-sel-flip-v" class="spec-pill-btn !py-1.5 !text-xs font-semibold ${selCount > 0 ? 'text-slate-200 hover:bg-slate-800' : 'opacity-40 cursor-not-allowed'}" ${selCount === 0 ? 'disabled' : ''}>
            ↕️ Flip Vert
          </button>
        </div>

        <div class="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-800">
          <button id="btn-sel-all" class="spec-pill-btn !py-1.5 !text-xs text-sky-300 hover:text-sky-200 hover:bg-sky-950/40">
            Select All
          </button>
          <button id="btn-sel-clear" class="spec-pill-btn !py-1.5 !text-xs text-slate-400 hover:text-slate-200">
            Deselect
          </button>
        </div>

        ${hasBounds ? `
          <div class="p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-[10px] font-mono space-y-1">
            <div class="text-slate-400 font-bold">Bounding Box:</div>
            <div class="grid grid-cols-2 gap-1 text-slate-300">
              <div>W: ${Math.round(b.w || b.width || 0)} px</div>
              <div>H: ${Math.round(b.h || b.height || 0)} px</div>
            </div>
          </div>
        ` : ''}

        <div class="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[10px] text-slate-400 space-y-1">
          <div>💡 <strong class="text-slate-200">Tips:</strong></div>
          <div>• Drag handles to <strong>scale</strong> (Shift for 1:1)</div>
          <div>• Drag top orange node to <strong>rotate</strong></div>
          <div>• Drag inside box to <strong>move</strong></div>
          <div>• Hold <strong class="text-sky-300">Shift</strong> for multi-select</div>
        </div>
      </div>
    </div>
  `;

  panel.querySelector('#btn-sel-duplicate')?.addEventListener('click', () => {
    duplicateSelectedStrokes();
    updateToolPanelForCurrentTool();
  });

  panel.querySelector('#btn-sel-delete')?.addEventListener('click', () => {
    deleteSelectedStrokes();
    updateToolPanelForCurrentTool();
  });

  panel.querySelector('#btn-sel-flip-h')?.addEventListener('click', () => {
    flipSelectedStrokes('horizontal');
    updateToolPanelForCurrentTool();
  });

  panel.querySelector('#btn-sel-flip-v')?.addEventListener('click', () => {
    flipSelectedStrokes('vertical');
    updateToolPanelForCurrentTool();
  });

  panel.querySelector('#btn-sel-all')?.addEventListener('click', () => {
    selectAllStrokes();
    updateToolPanelForCurrentTool();
  });

  panel.querySelector('#btn-sel-clear')?.addEventListener('click', () => {
    clearSelection();
    updateToolPanelForCurrentTool();
    requestRender();
  });
}

/**
 * Dedicated Nature & Procedural Props Library Inspector
 */
function renderPropsLibraryInspector(panel, isPixelSpace = false) {
  const accentClass = isPixelSpace ? 'text-amber-400' : 'text-sky-400';
  const accentSlider = isPixelSpace ? '!accent-amber-400' : '!accent-sky-400';
  const st = state.toolSettings;
  const currentPropId = st.activePropId || st.propId || 'tree';

  panel.innerHTML = `
    <div class="space-y-3 select-none">
      <div class="spec-header ${accentClass} flex items-center justify-between">
        <span>Nature & Props Studio</span>
        <span class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${isPixelSpace ? 'bg-amber-500/20 text-amber-300' : 'bg-sky-500/20 text-sky-300'}">
          Procedural Asset
        </span>
      </div>

      <!-- Props Grid -->
      <div class="spec-card space-y-2">
        <div class="spec-header text-slate-200">Available Props</div>
        <div class="grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pr-1">
          ${PROPS_REGISTRY.map(p => `
            <button data-prop-id="${p.id}" class="p-2 rounded-xl border text-left transition text-xs ${
              currentPropId === p.id
                ? 'bg-sky-500/20 border-sky-500 text-sky-200 font-bold'
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }">
              <div class="font-bold truncate text-[11px] flex items-center gap-1">
                <span>${p.icon || '🌿'}</span>
                <span>${p.name}</span>
              </div>
              <div class="text-[9px] text-slate-500 capitalize">${p.category} · ${p.type}</div>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Prop Scale & Opacity Settings -->
      <div class="spec-card space-y-2.5">
        <div class="spec-header text-slate-200">Prop Tuning</div>
        
        <div class="space-y-1">
          <div class="flex justify-between text-xs font-semibold">
            <span class="text-slate-300">Scale / Brush Size</span>
            <span id="label-prop-size" class="font-mono ${accentClass} font-bold">${st.size || 48} px</span>
          </div>
          <input id="slider-prop-size" type="range" min="8" max="160" value="${st.size || 48}" class="spec-slider ${accentSlider}" />
        </div>

        <div class="space-y-1 pt-1.5 border-t border-slate-800">
          <div class="flex justify-between text-xs font-semibold">
            <span class="text-slate-300">Opacity</span>
            <span id="label-prop-opacity" class="font-mono ${accentClass} font-bold">${Math.round((st.opacity ?? 1) * 100)}%</span>
          </div>
          <input id="slider-prop-opacity" type="range" min="10" max="100" value="${Math.round((st.opacity ?? 1) * 100)}" class="spec-slider ${accentSlider}" />
        </div>
      </div>

      <!-- Quick Stamp Button -->
      <div class="spec-card space-y-2">
        <div class="spec-header text-slate-200">Placement</div>
        <button id="btn-prop-stamp-center" class="w-full spec-pill-btn active !py-2 font-bold text-xs !bg-sky-500 !text-slate-950">
          ✨ Stamp Prop at Canvas Center
        </button>
        <div class="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[10px] text-slate-400">
          💡 <strong class="text-slate-200">On Canvas:</strong> Click to stamp directly, or drag across the canvas to scatter-paint.
        </div>
      </div>
    </div>
  `;

  panel.querySelectorAll('[data-prop-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      st.activePropId = btn.dataset.propId;
      st.propId = btn.dataset.propId;
      updateToolPanelForCurrentTool();
      showToast(`Selected Prop: ${PROPS_REGISTRY.find(p => p.id === st.activePropId)?.name}`);
    });
  });

  panel.querySelector('#slider-prop-size')?.addEventListener('input', (e) => {
    st.size = parseInt(e.target.value, 10);
    const lbl = panel.querySelector('#label-prop-size');
    if (lbl) lbl.textContent = `${st.size} px`;
  });

  panel.querySelector('#slider-prop-opacity')?.addEventListener('input', (e) => {
    st.opacity = parseInt(e.target.value, 10) / 100;
    const lbl = panel.querySelector('#label-prop-opacity');
    if (lbl) lbl.textContent = `${Math.round(st.opacity * 100)}%`;
  });

  panel.querySelector('#btn-prop-stamp-center')?.addEventListener('click', () => {
    stampPropAtCenter(currentPropId);
    showToast(`Stamped ${PROPS_REGISTRY.find(p => p.id === currentPropId)?.name}`);
  });
}

/**
 * -------------------------------------------------------------
 * A. VECTOR SPACE INSPECTOR
 * -------------------------------------------------------------
 */
function renderVectorToolInspector(panel) {
  const st = state.toolSettings;
  const tool = state.currentTool;

  if (tool === 'select') {
    renderSelectToolInspector(panel, false);
    return;
  }

  if (tool === 'props') {
    renderPropsLibraryInspector(panel, false);
    return;
  }

  if (tool === 'node-tool') {
    renderNodeToolInspector(panel, false);
    return;
  }

  if (tool === 'shape') {
    renderShapeStudioInspector(panel, false);
    return;
  }

  if (tool === 'vector-fill') {
    panel.innerHTML = `
      <div class="space-y-3 select-none">
        <div class="spec-header text-sky-400 flex items-center justify-between">
          <span>Vector Fill</span>
          <span class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">Enclosure Boundary</span>
        </div>
        <div class="spec-card space-y-2">
          <div class="spec-header text-slate-200">Tolerance & Gap Close</div>
          <div class="space-y-1">
            <div class="flex justify-between text-xs font-semibold">
              <span class="text-slate-300">Gap Close Radius</span>
              <span class="font-mono text-sky-400 font-bold">${st.fillCloseGap || 2} px</span>
            </div>
            <input id="slider-vec-fill-gap" type="range" min="0" max="8" value="${st.fillCloseGap || 2}" class="spec-slider !accent-sky-400" />
          </div>
        </div>
      </div>
    `;
    panel.querySelector('#slider-vec-fill-gap')?.addEventListener('input', (e) => {
      st.fillCloseGap = parseInt(e.target.value, 10);
    });
    return;
  }

  // Default Vector Tool: Vector Pen / Fine Strokes
  panel.innerHTML = `
    <div class="space-y-3 select-none">
      <div class="spec-header text-sky-400 flex items-center justify-between">
        <span>Vector Pen Studio</span>
        <span class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">Infinite Resolution</span>
      </div>

      <!-- Vector Style Presets -->
      <div class="spec-card">
        <div class="spec-header">
          <span class="text-slate-200">Preset Style</span>
          <span class="font-mono text-sky-400 font-bold capitalize">${(st.vectorPreset || 'fine-strokes').replace('-', ' ')}</span>
        </div>
        <div class="grid grid-cols-3 gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs font-bold text-center">
          ${VECTOR_PRESETS.map((p) => `
            <button data-vec-preset="${p.id}" class="spec-pill-btn ${(st.vectorPreset || 'fine-strokes') === p.id ? 'active' : ''}">
              ${p.name.split(' ')[0]}
            </button>
          `).join('')}
        </div>
        <p class="text-[10px] text-slate-400 leading-snug pt-1">
          ${VECTOR_PRESETS.find(p => p.id === (st.vectorPreset || 'fine-strokes'))?.desc || ''}
        </p>
      </div>

      <!-- Calligraphic Taper Matrix -->
      <div class="spec-card space-y-2">
        <div class="spec-header">
          <span class="text-slate-200">Calligraphic Taper</span>
          <span class="font-mono text-sky-400 font-bold capitalize">${st.interpolationMode || 'both'}</span>
        </div>
        <div class="grid grid-cols-2 gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs font-semibold text-center">
          <button data-interp="both" class="spec-pill-btn ${st.interpolationMode === 'both' ? 'active' : ''}">Both Ends</button>
          <button data-interp="start" class="spec-pill-btn ${st.interpolationMode === 'start' ? 'active' : ''}">Start Only</button>
          <button data-interp="end" class="spec-pill-btn ${st.interpolationMode === 'end' ? 'active' : ''}">End Flick</button>
          <button data-interp="none" class="spec-pill-btn ${st.interpolationMode === 'none' ? 'active' : ''}">No Taper</button>
        </div>
        <div class="space-y-1 pt-1.5 border-t border-slate-800">
          <div class="flex justify-between text-xs font-semibold">
            <span class="text-slate-300">Taper Length</span>
            <span id="label-vec-taper" class="font-mono text-sky-400 font-bold">${Math.round((st.taperLength ?? 0.22) * 100)}%</span>
          </div>
          <input id="slider-vec-taper" type="range" min="10" max="40" value="${Math.round((st.taperLength ?? 0.22) * 100)}" class="spec-slider !accent-sky-400" />
        </div>
      </div>

      <!-- Dual Stabilization Controls -->
      <div class="spec-card space-y-3 border-sky-500/30">
        <div class="spec-header flex items-center justify-between">
          <span class="text-slate-200">Dual Stabilization</span>
          <span class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">Vector Guides</span>
        </div>

        <div class="space-y-1">
          <div class="flex justify-between text-xs font-semibold">
            <span class="text-slate-300">1. Streamline (Tremor Filter)</span>
            <span id="label-vec-smoothing" class="font-mono text-sky-400 font-bold">${Math.round((st.smoothing ?? 0.60) * 100)}%</span>
          </div>
          <input id="slider-vec-smoothing" type="range" min="0" max="100" value="${Math.round((st.smoothing ?? 0.60) * 100)}" class="spec-slider !accent-sky-400" />
        </div>

        <div class="space-y-1 pt-2 border-t border-slate-800">
          <div class="flex justify-between text-xs font-semibold">
            <span class="text-slate-300">2. Inertial Rope (Arc Leash)</span>
            <span id="label-vec-rope" class="font-mono text-sky-400 font-bold">${Math.round((st.stabilizerRope ?? 0.0) * 100)}%</span>
          </div>
          <input id="slider-vec-rope" type="range" min="0" max="100" value="${Math.round((st.stabilizerRope ?? 0.0) * 100)}" class="spec-slider !accent-sky-400" />
        </div>
      </div>

      <!-- Line Weight & Opacity -->
      <div class="spec-card space-y-2">
        <div class="space-y-1">
          <div class="flex justify-between text-xs font-semibold">
            <span class="text-slate-200">Stroke Width</span>
            <span id="label-vec-size" class="font-mono text-sky-400 font-bold">${st.size || 4} px</span>
          </div>
          <input id="slider-vec-size" type="range" min="0.5" max="40" step="0.5" value="${st.size || 4}" class="spec-slider !accent-sky-400" />
          <div class="flex items-center gap-1.5 pt-1">
            ${[0.5, 1.0, 2.0, 4.0, 8.0, 16.0].map((sz) => `
              <button data-quick-size="${sz}" class="spec-chip">${sz}px</button>
            `).join('')}
          </div>
        </div>

        <div class="space-y-1 pt-2 border-t border-slate-800">
          <div class="flex justify-between text-xs font-semibold">
            <span class="text-slate-200">Opacity</span>
            <span id="label-vec-opacity" class="font-mono text-sky-400 font-bold">${Math.round((st.opacity ?? 1.0) * 100)}%</span>
          </div>
          <input id="slider-vec-opacity" type="range" min="5" max="100" value="${Math.round((st.opacity ?? 1.0) * 100)}" class="spec-slider !accent-sky-400" />
        </div>
      </div>
    </div>
  `;

  panel.querySelectorAll('[data-vec-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.vecPreset;
      const preset = VECTOR_PRESETS.find(p => p.id === id);
      if (preset) {
        st.vectorPreset = id;
        st.pencilPreset = id;
        st.size = preset.size;
        st.opacity = preset.opacity;
        st.smoothing = preset.smoothing;
        st.taperLength = preset.taperLength;
        st.interpolationMode = preset.interpolationMode;
        st.taperStart = preset.taperStart;
        st.taperEnd = preset.taperEnd;
        updateToolPanelForCurrentTool();
        showToast(`Vector Preset: ${preset.name}`);
      }
    });
  });

  panel.querySelectorAll('[data-interp]').forEach((btn) => {
    btn.addEventListener('click', () => {
      st.interpolationMode = btn.dataset.interp;
      st.taperStart = st.interpolationMode === 'both' || st.interpolationMode === 'start';
      st.taperEnd = st.interpolationMode === 'both' || st.interpolationMode === 'end';
      updateToolPanelForCurrentTool();
    });
  });

  panel.querySelector('#slider-vec-taper')?.addEventListener('input', (e) => {
    st.taperLength = parseInt(e.target.value, 10) / 100;
    const lbl = panel.querySelector('#label-vec-taper');
    if (lbl) lbl.textContent = `${Math.round(st.taperLength * 100)}%`;
  });

  panel.querySelector('#slider-vec-smoothing')?.addEventListener('input', (e) => {
    st.smoothing = parseInt(e.target.value, 10) / 100;
    const lbl = panel.querySelector('#label-vec-smoothing');
    if (lbl) lbl.textContent = `${Math.round(st.smoothing * 100)}%`;
  });

  panel.querySelector('#slider-vec-rope')?.addEventListener('input', (e) => {
    st.stabilizerRope = parseInt(e.target.value, 10) / 100;
    const lbl = panel.querySelector('#label-vec-rope');
    if (lbl) lbl.textContent = `${Math.round(st.stabilizerRope * 100)}%`;
  });

  panel.querySelector('#slider-vec-size')?.addEventListener('input', (e) => {
    st.size = parseFloat(e.target.value);
    const lbl = panel.querySelector('#label-vec-size');
    if (lbl) lbl.textContent = `${st.size} px`;
  });

  panel.querySelector('#slider-vec-opacity')?.addEventListener('input', (e) => {
    st.opacity = parseInt(e.target.value, 10) / 100;
    const lbl = panel.querySelector('#label-vec-opacity');
    if (lbl) lbl.textContent = `${Math.round(st.opacity * 100)}%`;
  });

  panel.querySelectorAll('[data-quick-size]').forEach((btn) => {
    btn.addEventListener('click', () => {
      st.size = parseFloat(btn.dataset.quickSize);
      updateToolPanelForCurrentTool();
    });
  });
}

/**
 * -------------------------------------------------------------
 * B. PIXEL SPACE INSPECTOR
 * -------------------------------------------------------------
 */
function renderPixelToolInspector(panel) {
  const st = state.toolSettings;
  const tool = state.currentTool;

  if (tool === 'select') {
    renderSelectToolInspector(panel, true);
    return;
  }

  if (tool === 'props') {
    renderPropsLibraryInspector(panel, true);
    return;
  }

  if (tool === 'node-tool') {
    renderNodeToolInspector(panel, true);
    return;
  }

  if (tool === 'shape' || tool === 'pixel-shape') {
    renderShapeStudioInspector(panel, true);
    return;
  }

  if (tool === 'eraser') {
    panel.innerHTML = `
      <div class="space-y-3 select-none">
        <div class="spec-header text-amber-400 flex items-center justify-between">
          <span>Raster Eraser</span>
          <span class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">Pixel Tiles</span>
        </div>
        <div class="spec-card space-y-2">
          <div class="flex justify-between text-xs font-semibold">
            <span class="text-slate-200">Eraser Diameter</span>
            <span id="label-eraser-size" class="font-mono text-amber-400 font-bold">${st.eraserSize || 24} px</span>
          </div>
          <input id="slider-eraser-size" type="range" min="2" max="120" value="${st.eraserSize || 24}" class="spec-slider !accent-amber-400" />
          <div class="flex items-center gap-1.5 pt-1">
            ${[8, 16, 24, 48, 80].map(sz => `<button data-eraser-quick="${sz}" class="spec-chip">${sz}px</button>`).join('')}
          </div>
        </div>
      </div>
    `;
    panel.querySelector('#slider-eraser-size')?.addEventListener('input', (e) => {
      st.eraserSize = parseInt(e.target.value, 10);
      const lbl = panel.querySelector('#label-eraser-size');
      if (lbl) lbl.textContent = `${st.eraserSize} px`;
    });
    panel.querySelectorAll('[data-eraser-quick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        st.eraserSize = parseInt(btn.dataset.eraserQuick, 10);
        updateToolPanelForCurrentTool();
      });
    });
    return;
  }

  if (tool === 'smear' || tool === 'blur') {
    panel.innerHTML = `
      <div class="space-y-3 select-none">
        <div class="spec-header text-amber-400 flex items-center justify-between">
          <span>${tool === 'smear' ? 'Smudge & Smear' : 'Soften & Blur'}</span>
          <span class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">Pixel Blending</span>
        </div>
        <div class="spec-card space-y-2">
          <div class="flex justify-between text-xs font-semibold">
            <span class="text-slate-200">Strength</span>
            <span class="font-mono text-amber-400 font-bold">${Math.round((tool === 'smear' ? st.smearStrength : st.blurStrength) * 100)}%</span>
          </div>
          <input id="slider-blend-strength" type="range" min="10" max="100" value="${Math.round((tool === 'smear' ? st.smearStrength : st.blurStrength) * 100)}" class="spec-slider !accent-amber-400" />
        </div>
      </div>
    `;
    panel.querySelector('#slider-blend-strength')?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10) / 100;
      if (tool === 'smear') st.smearStrength = val;
      else st.blurStrength = val;
    });
    return;
  }

  // Default Pixel Tool: Graphite Lead & Natural Media
  panel.innerHTML = `
    <div class="space-y-3 select-none">
      <div class="spec-header text-amber-400 flex items-center justify-between">
        <span>Natural Media Studio</span>
        <span class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">Bitmap Persona</span>
      </div>

      <!-- Graphite Lead Hardness Matrix -->
      <div class="spec-card">
        <div class="spec-header">
          <span class="text-slate-200">Lead Grade (Hardness)</span>
          <span class="font-mono text-amber-400 font-bold">${st.pencilGrade || '2B'} Graphite</span>
        </div>
        <div class="grid grid-cols-5 gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs font-bold text-center">
          ${PENCIL_GRADES.map((g) => `
            <button data-pencil-grade="${g.id}" class="spec-pill-btn ${(st.pencilGrade || '2B') === g.id ? 'active !bg-amber-500 !text-slate-950' : ''}">
              ${g.id}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Tip & Shading Profile -->
      <div class="spec-card">
        <div class="spec-header">
          <span class="text-slate-200">Tip Profile</span>
          <span class="font-mono text-amber-400 font-bold capitalize">${st.pencilTip === 'broad' ? 'Broad Chisel' : 'Fine Point'}</span>
        </div>
        <div class="spec-pill-container">
          <button id="btn-pencil-point" class="spec-pill-btn ${(st.pencilTip || 'point') === 'point' ? 'active !bg-amber-500 !text-slate-950' : ''}">Fine Point</button>
          <button id="btn-pencil-broad" class="spec-pill-btn ${st.pencilTip === 'broad' ? 'active !bg-amber-500 !text-slate-950' : ''}">Broad Chisel</button>
        </div>
      </div>

      <!-- Paper Tooth Catch Intensity -->
      <div class="spec-card space-y-1.5">
        <div class="flex justify-between text-xs font-semibold">
          <span class="text-slate-200">Paper Tooth Catch (Grain Bite)</span>
          <span id="label-pencil-tooth" class="font-mono text-amber-400 font-bold">${Math.round((st.pencilTooth ?? 0.85) * 100)}%</span>
        </div>
        <input id="slider-pencil-tooth" type="range" min="10" max="100" value="${Math.round((st.pencilTooth ?? 0.85) * 100)}" class="spec-slider !accent-amber-400" />
      </div>

      <!-- Canvas Surface Paper Texture Selection -->
      <div class="spec-card space-y-2 border-amber-500/30">
        <div class="flex justify-between items-center text-xs">
          <span class="text-slate-200 font-semibold">Canvas Surface Texture</span>
          <button id="btn-toggle-panel-paper" class="px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
            paperTextureEnabled ? 'bg-amber-500 text-slate-950 shadow-xs' : 'bg-slate-800 text-slate-400'
          }">${paperTextureEnabled ? 'ACTIVE' : 'OFF'}</button>
        </div>
        <div class="grid grid-cols-2 gap-1.5 pt-1">
          ${PAPER_PRESETS.map((pp) => `
            <button data-panel-paper="${pp.id}" class="p-2 rounded-xl border text-left transition text-xs ${
              currentPaperPresetId === pp.id 
                ? 'bg-amber-500/20 border-amber-500 text-amber-200 font-bold shadow-xs' 
                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }">
              <div class="truncate text-[11px]">${pp.name.split(' ')[0]}</div>
              <div class="text-[9px] text-slate-500 truncate">${Math.round(pp.toothIntensity * 100)}% grain</div>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Size & Opacity -->
      <div class="spec-card space-y-2">
        <div class="space-y-1">
          <div class="flex justify-between text-xs font-semibold">
            <span class="text-slate-200">Shading Width</span>
            <span id="label-pixel-size" class="font-mono text-amber-400 font-bold">${st.size || 3} px</span>
          </div>
          <input id="slider-pixel-size" type="range" min="1" max="60" value="${st.size || 3}" class="spec-slider !accent-amber-400" />
        </div>
        <div class="space-y-1 pt-2 border-t border-slate-800">
          <div class="flex justify-between text-xs font-semibold">
            <span class="text-slate-200">Deposit Density (Opacity)</span>
            <span id="label-pixel-opacity" class="font-mono text-amber-400 font-bold">${Math.round((st.opacity ?? 0.85) * 100)}%</span>
          </div>
          <input id="slider-pixel-opacity" type="range" min="5" max="100" value="${Math.round((st.opacity ?? 0.85) * 100)}" class="spec-slider !accent-amber-400" />
        </div>
      </div>
    </div>
  `;

  panel.querySelectorAll('[data-pencil-grade]').forEach((btn) => {
    btn.addEventListener('click', () => {
      st.pencilGrade = btn.dataset.pencilGrade;
      updateToolPanelForCurrentTool();
      showToast(`Graphite Grade: ${st.pencilGrade}`);
    });
  });

  panel.querySelector('#btn-pencil-point')?.addEventListener('click', () => {
    st.pencilTip = 'point';
    updateToolPanelForCurrentTool();
  });

  panel.querySelector('#btn-pencil-broad')?.addEventListener('click', () => {
    st.pencilTip = 'broad';
    updateToolPanelForCurrentTool();
    showToast('Broad Chisel Tip active for planar shading');
  });

  panel.querySelector('#slider-pencil-tooth')?.addEventListener('input', (e) => {
    st.pencilTooth = parseInt(e.target.value, 10) / 100;
    const lbl = panel.querySelector('#label-pencil-tooth');
    if (lbl) lbl.textContent = `${Math.round(st.pencilTooth * 100)}%`;
  });

  panel.querySelector('#btn-toggle-panel-paper')?.addEventListener('click', () => {
    togglePaperTexture();
    st.paperTexture = paperTextureEnabled;
    requestRender();
    updateToolPanelForCurrentTool();
  });

  panel.querySelectorAll('[data-panel-paper]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.panelPaper;
      setPaperPreset(id);
      st.paperPreset = id;
      requestRender();
      updateToolPanelForCurrentTool();
    });
  });

  panel.querySelector('#slider-pixel-size')?.addEventListener('input', (e) => {
    st.size = parseFloat(e.target.value);
    const lbl = panel.querySelector('#label-pixel-size');
    if (lbl) lbl.textContent = `${st.size} px`;
  });

  panel.querySelector('#slider-pixel-opacity')?.addEventListener('input', (e) => {
    st.opacity = parseInt(e.target.value, 10) / 100;
    const lbl = panel.querySelector('#label-pixel-opacity');
    if (lbl) lbl.textContent = `${Math.round(st.opacity * 100)}%`;
  });
}

function updateToolbarActiveState() {
  document.querySelectorAll('.tool-btn').forEach((btn) => {
    const bTool = btn.getAttribute('data-tool');
    const isTarget = bTool === state.currentTool;
    btn.classList.toggle('active-tool', isTarget);

    if (state.engineMode === 'vector') {
      btn.classList.toggle('text-sky-400', isTarget);
      btn.classList.toggle('bg-sky-500/15', isTarget);
      btn.classList.toggle('border', isTarget);
      btn.classList.toggle('border-sky-500/50', isTarget);
      btn.classList.toggle('shadow-md', isTarget);
      btn.classList.toggle('shadow-sky-500/20', isTarget);
      btn.classList.remove('text-amber-400', 'bg-amber-500/15', 'border-amber-500/50', 'shadow-amber-500/20');
    } else {
      btn.classList.toggle('text-amber-400', isTarget);
      btn.classList.toggle('bg-amber-500/15', isTarget);
      btn.classList.toggle('border', isTarget);
      btn.classList.toggle('border-amber-500/50', isTarget);
      btn.classList.toggle('shadow-md', isTarget);
      btn.classList.toggle('shadow-amber-500/20', isTarget);
      btn.classList.remove('text-sky-400', 'bg-sky-500/15', 'border-sky-500/50', 'shadow-sky-500/20');
    }
    btn.classList.toggle('text-slate-400', !isTarget);
  });
}

export function setToolByName(toolName) {
  state.currentTool = toolName || (state.engineMode === 'vector' ? 'vector-pen' : 'graphite');
  if (state.currentTool === 'vector-pen') {
    state.toolSettings.strokeSpace = 'vector';
  } else if (state.currentTool === 'graphite' || state.currentTool === 'eraser' || state.currentTool === 'smear' || state.currentTool === 'blur' || state.currentTool === 'pixel-fill') {
    state.toolSettings.strokeSpace = 'pixel';
  }
  updateToolbarActiveState();
  updateToolPanelForCurrentTool();
}

import { renderColorStudioTab } from './artistPalettes.js';

export function setupColorPalettes() {
  const container = document.getElementById('tab-content-palettes');
  if (container) {
    renderColorStudioTab(container);
  }
}
