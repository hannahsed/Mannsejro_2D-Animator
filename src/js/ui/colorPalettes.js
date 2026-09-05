// src/js/ui/colorPalettes.js
import { state, DRAW_PRESETS, SHAPE_PRESETS } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { showToast } from './toast.js';

export function renderShapePresetsList(container) {
  if (!container) return;
  container.innerHTML = '';

  const activeId = state.toolSettings.shapePreset || 'rectangle';

  SHAPE_PRESETS.forEach((preset) => {
    const isSelected = preset.id === activeId;
    const btn = document.createElement('button');
    btn.className = `w-full p-2 rounded-xl border text-left transition flex items-center gap-2.5 cursor-pointer ${
      isSelected
        ? 'bg-orange-500/15 border-orange-500 text-white shadow-xs ring-1 ring-orange-500/40'
        : 'bg-zinc-800/40 border-zinc-700/50 text-zinc-300 hover:bg-zinc-800/80'
    }`;

    btn.innerHTML = `
      <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
        isSelected ? 'bg-orange-500 text-zinc-950 font-bold shadow-xs' : 'bg-zinc-700/60 text-zinc-400'
      }">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          ${preset.icon}
        </svg>
      </div>
      <div class="flex flex-col min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <span class="text-xs font-bold truncate">${preset.name}</span>
          <span class="text-[9px] font-mono px-1 py-0.2 rounded ${
            isSelected ? 'bg-orange-500/30 text-orange-200' : 'bg-zinc-700 text-zinc-400'
          }">${preset.badge}</span>
        </div>
        <span class="text-[10px] text-zinc-400 truncate mt-0.5">${preset.desc}</span>
      </div>
    `;

    btn.addEventListener('click', () => {
      state.toolSettings.shapePreset = preset.id;
      updateToolPanelForCurrentTool();
      showToast(`Shape: ${preset.name}`);
    });

    container.appendChild(btn);
  });
}

export function applyDrawPreset(presetId) {
  const p = DRAW_PRESETS.find((item) => item.id === presetId);
  if (!p) return;

  state.toolSettings.preset = p.id;
  state.toolSettings.size = p.size;
  state.toolSettings.opacity = p.opacity;
  state.toolSettings.smoothing = p.smoothing;
  state.toolSettings.taperStart = p.taperStart;
  state.toolSettings.taperEnd = p.taperEnd;
  state.toolSettings.taperLength = p.taperLength;
  state.toolSettings.pressure = p.pressure;
  state.toolSettings.composite = p.composite;

  updateToolPanelForCurrentTool();
  showToast(`Preset: ${p.name}`);
}

export function renderDrawPresetsList(container) {
  if (!container) return;
  container.innerHTML = '';

  const activeId = state.toolSettings.preset || 'studio-ink';

  DRAW_PRESETS.forEach((preset) => {
    const isSelected = preset.id === activeId;
    const btn = document.createElement('button');
    btn.className = `w-full p-2 rounded-xl border text-left transition flex items-center justify-between gap-2 ${
      isSelected
        ? 'bg-orange-500/15 border-orange-500 text-white shadow-xs ring-1 ring-orange-500/40'
        : 'bg-zinc-800/40 border-zinc-700/50 text-zinc-300 hover:bg-zinc-800'
    }`;

    btn.innerHTML = `
      <div class="flex flex-col min-w-0">
        <div class="flex items-center gap-1.5">
          <span class="text-xs font-bold truncate">${preset.name}</span>
          <span class="text-[9px] font-mono px-1 py-0.2 rounded ${
            isSelected ? 'bg-orange-500 text-zinc-950 font-bold' : 'bg-zinc-700 text-zinc-300'
          }">${preset.badge}</span>
        </div>
        <span class="text-[10px] text-zinc-400 truncate mt-0.5">${preset.desc}</span>
      </div>
      <div class="text-[10px] font-mono text-orange-400 font-bold shrink-0">${preset.size}px</div>
    `;

    btn.addEventListener('click', () => {
      applyDrawPreset(preset.id);
    });

    container.appendChild(btn);
  });
}

export function updateToolPanelForCurrentTool() {
  const panel = document.getElementById('tab-content-tool');
  if (!panel) return;

  const tool = state.currentTool;

  if (tool === 'draw') {
    panel.innerHTML = `
      <!-- Draw Header -->
      <div class="flex items-center gap-2.5 p-2.5 rounded-xl bg-zinc-800/60 border border-zinc-700/60">
        <div class="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
        </div>
        <div class="flex flex-col min-w-0">
          <span class="text-xs font-bold text-zinc-100">Draw Tool</span>
          <span class="text-[10px] text-zinc-400 truncate">Studio brush with customizable dynamics</span>
        </div>
      </div>

      <!-- Presets Gallery -->
      <div class="space-y-1.5">
        <div class="flex justify-between items-center text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          <span>Brush Presets</span>
          <span class="text-orange-400">${DRAW_PRESETS.length} Available</span>
        </div>
        <div id="draw-presets-container" class="space-y-1.5 max-h-48 overflow-y-auto pr-1"></div>
      </div>

      <!-- Size & Opacity -->
      <div class="space-y-3 pt-2 border-t border-zinc-800">
        <div class="space-y-1">
          <div class="flex justify-between text-xs">
            <span class="text-zinc-300 font-medium">Stroke Size</span>
            <span id="label-draw-size" class="font-mono text-orange-400 font-bold">${state.toolSettings.size} px</span>
          </div>
          <input id="slider-draw-size" type="range" min="1" max="100" value="${state.toolSettings.size}" class="w-full accent-orange-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer" />
        </div>

        <div class="space-y-1">
          <div class="flex justify-between text-xs">
            <span class="text-zinc-300 font-medium">Opacity</span>
            <span id="label-draw-opacity" class="font-mono text-orange-400 font-bold">${Math.round(state.toolSettings.opacity * 100)}%</span>
          </div>
          <input id="slider-draw-opacity" type="range" min="5" max="100" value="${Math.round(state.toolSettings.opacity * 100)}" class="w-full accent-orange-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer" />
        </div>
      </div>

      <!-- DUAL-STAGE STABILIZER CONTROLS -->
      <div class="space-y-2 pt-2 border-t border-zinc-800">
        <div class="flex justify-between text-xs">
          <span class="text-zinc-300 font-medium">Stage 1: Streamline (Filter)</span>
          <span id="label-draw-smoothing" class="font-mono text-orange-400 font-bold">${Math.round((state.toolSettings.smoothing ?? 0.5) * 100)}%</span>
        </div>
        <input id="slider-draw-smoothing" type="range" min="0" max="95" value="${Math.round((state.toolSettings.smoothing ?? 0.5) * 100)}" class="w-full accent-orange-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer" />
        <div class="segmented-pill-wrap text-[10px]">
          <button data-smooth="0" class="segmented-pill-item py-1">Raw</button>
          <button data-smooth="40" class="segmented-pill-item py-1">Normal</button>
          <button data-smooth="70" class="segmented-pill-item py-1">Smooth</button>
          <button data-smooth="90" class="segmented-pill-item py-1">Rope</button>
        </div>

        <div class="p-2.5 bg-zinc-850/60 rounded-xl border border-orange-500/40 space-y-2 mt-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-orange-400 shadow-[0_0_6px_#f97316]"></span>
              <span class="text-xs font-bold text-zinc-100">Stage 2: Inertial Leash Damper</span>
            </div>
            <input id="toggle-assistant-stabilizer" type="checkbox" ${state.toolSettings.assistantStabilizer ? 'checked' : ''} class="accent-orange-500 cursor-pointer" />
          </div>

          <div class="space-y-1 pt-1">
            <div class="flex justify-between text-[11px] text-zinc-400">
              <span>Inertial Mass (Weight)</span>
              <span id="label-assistant-weight" class="font-mono text-orange-400">${Math.round((state.toolSettings.assistantWeight ?? 0.65) * 100)}%</span>
            </div>
            <input id="slider-assistant-weight" type="range" min="10" max="95" value="${Math.round((state.toolSettings.assistantWeight ?? 0.65) * 100)}" class="w-full accent-orange-500 h-1 bg-zinc-700 rounded cursor-pointer" />
          </div>

          <div class="space-y-1">
            <div class="flex justify-between text-[11px] text-zinc-400">
              <span>Leash String Radius</span>
              <span id="label-assistant-radius" class="font-mono text-orange-400">${state.toolSettings.leashRadius ?? 18} px</span>
            </div>
            <input id="slider-assistant-radius" type="range" min="6" max="60" value="${state.toolSettings.leashRadius ?? 18}" class="w-full accent-orange-500 h-1 bg-zinc-700 rounded cursor-pointer" />
          </div>
        </div>
      </div>

      <!-- Taper Dynamics -->
      <div class="space-y-2 pt-2 border-t border-zinc-800">
        <span class="text-xs text-zinc-300 font-medium">Taper Dynamics</span>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex items-center gap-2 p-2 bg-zinc-800/40 border border-zinc-700/50 rounded-xl cursor-pointer text-xs">
            <input id="toggle-taper-start" type="checkbox" ${state.toolSettings.taperStart ? 'checked' : ''} class="accent-orange-500" />
            <span class="text-zinc-300">Taper Start</span>
          </label>
          <label class="flex items-center gap-2 p-2 bg-zinc-800/40 border border-zinc-700/50 rounded-xl cursor-pointer text-xs">
            <input id="toggle-taper-end" type="checkbox" ${state.toolSettings.taperEnd ? 'checked' : ''} class="accent-orange-500" />
            <span class="text-zinc-300">Taper End</span>
          </label>
        </div>
        <label class="flex items-center justify-between p-2 bg-zinc-800/40 border border-zinc-700/50 rounded-xl cursor-pointer text-xs">
          <span class="text-zinc-300">Pressure / Velocity Weight</span>
          <input id="toggle-draw-pressure" type="checkbox" ${state.toolSettings.pressure ? 'checked' : ''} class="accent-orange-500" />
        </label>
      </div>
    `;

    renderDrawPresetsList(document.getElementById('draw-presets-container'));

    // Wire sliders
    const sizeSlider = document.getElementById('slider-draw-size');
    sizeSlider?.addEventListener('input', (e) => {
      state.toolSettings.size = parseInt(e.target.value, 10);
      const lbl = document.getElementById('label-draw-size');
      if (lbl) lbl.textContent = `${state.toolSettings.size} px`;
    });

    const opSlider = document.getElementById('slider-draw-opacity');
    opSlider?.addEventListener('input', (e) => {
      state.toolSettings.opacity = parseInt(e.target.value, 10) / 100;
      const lbl = document.getElementById('label-draw-opacity');
      if (lbl) lbl.textContent = `${Math.round(state.toolSettings.opacity * 100)}%`;
    });

    const smoothSlider = document.getElementById('slider-draw-smoothing');
    smoothSlider?.addEventListener('input', (e) => {
      state.toolSettings.smoothing = parseInt(e.target.value, 10) / 100;
      const lbl = document.getElementById('label-draw-smoothing');
      if (lbl) lbl.textContent = `${Math.round(state.toolSettings.smoothing * 100)}%`;
    });

    panel.querySelectorAll('[data-smooth]').forEach((b) => {
      b.addEventListener('click', () => {
        const val = parseInt(b.dataset.smooth, 10);
        state.toolSettings.smoothing = val / 100;
        if (smoothSlider) smoothSlider.value = val;
        const lbl = document.getElementById('label-draw-smoothing');
        if (lbl) lbl.textContent = `${val}%`;
      });
    });

    document.getElementById('toggle-assistant-stabilizer')?.addEventListener('change', (e) => {
      state.toolSettings.assistantStabilizer = e.target.checked;
    });
    const weightSlider = document.getElementById('slider-assistant-weight');
    weightSlider?.addEventListener('input', (e) => {
      state.toolSettings.assistantWeight = parseInt(e.target.value, 10) / 100;
      const lbl = document.getElementById('label-assistant-weight');
      if (lbl) lbl.textContent = `${Math.round(state.toolSettings.assistantWeight * 100)}%`;
    });
    const radiusSlider = document.getElementById('slider-assistant-radius');
    radiusSlider?.addEventListener('input', (e) => {
      state.toolSettings.leashRadius = parseInt(e.target.value, 10);
      const lbl = document.getElementById('label-assistant-radius');
      if (lbl) lbl.textContent = `${state.toolSettings.leashRadius} px`;
    });

    document.getElementById('toggle-taper-start')?.addEventListener('change', (e) => {
      state.toolSettings.taperStart = e.target.checked;
    });
    document.getElementById('toggle-taper-end')?.addEventListener('change', (e) => {
      state.toolSettings.taperEnd = e.target.checked;
    });
    document.getElementById('toggle-draw-pressure')?.addEventListener('change', (e) => {
      state.toolSettings.pressure = e.target.checked;
    });

    return;
  }

  // Other tools (eraser, bucket, shapes)
  if (tool === 'eraser') {
    panel.innerHTML = `
      <div class="space-y-3">
        <div class="flex justify-between text-xs">
          <span class="text-zinc-300 font-medium">Eraser Diameter</span>
          <span class="font-mono text-orange-400 font-bold">${state.toolSettings.eraserSize || 24} px</span>
        </div>
        <input id="slider-eraser-size" type="range" min="2" max="150" value="${state.toolSettings.eraserSize || 24}" class="w-full accent-orange-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer" />
      </div>
    `;
    document.getElementById('slider-eraser-size')?.addEventListener('input', (e) => {
      state.toolSettings.eraserSize = parseInt(e.target.value, 10);
      updateToolPanelForCurrentTool();
    });
  } else if (tool === 'bucket' || tool === 'fill') {
    const isPrecision = state.toolSettings.fillStyleMode === 'precision';

    panel.innerHTML = `
      <div class="space-y-4">
        <!-- Mode Switcher (Segmented Pill) -->
        <div class="space-y-1.5">
          <label class="text-xs font-semibold uppercase tracking-wider text-orange-400">Fill Mode</label>
          <div class="segmented-pill-wrap">
            <button id="btn-fill-mode-precision" class="segmented-pill-item ${
              isPrecision ? 'active' : ''
            }">Precision Cel</button>
            <button id="btn-fill-mode-artistic" class="segmented-pill-item ${
              !isPrecision ? 'active' : ''
            }">Pop-Art Moat</button>
          </div>
        </div>

        <!-- General Settings -->
        <div class="space-y-2">
          <div class="flex justify-between text-xs">
            <span class="text-zinc-300 font-medium">Tolerance</span>
            <span class="font-mono text-orange-400 font-bold">${state.toolSettings.fillTolerance}</span>
          </div>
          <input id="slider-fill-tol" type="range" min="0" max="100" value="${state.toolSettings.fillTolerance}" class="w-full accent-orange-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer" />
        </div>

        ${
          isPrecision
            ? `
          <!-- PRECISION CONTROLS -->
          <div class="p-3 bg-zinc-850/60 rounded-xl border border-orange-500/30 space-y-3">
            <div class="text-[11px] font-bold text-orange-300">Clean Cel Shading</div>
            <div class="space-y-1">
              <div class="flex justify-between text-xs">
                <span class="text-zinc-300">Close Gap (Bridge Gaps)</span>
                <span class="font-mono text-amber-400 font-bold">${state.toolSettings.fillCloseGap} px</span>
              </div>
              <input id="slider-fill-gap" type="range" min="0" max="6" value="${state.toolSettings.fillCloseGap}" class="w-full accent-amber-500 h-1 bg-zinc-700 rounded cursor-pointer" />
            </div>

            <div class="space-y-1">
              <div class="flex justify-between text-xs">
                <span class="text-zinc-300">Halo Killer (Under-Paint)</span>
                <span class="font-mono text-emerald-400 font-bold">${state.toolSettings.fillBleed} px</span>
              </div>
              <input id="slider-fill-bleed" type="range" min="0" max="5" value="${state.toolSettings.fillBleed}" class="w-full accent-emerald-500 h-1 bg-zinc-700 rounded cursor-pointer" />
            </div>
          </div>
        `
            : `
          <!-- ARTISTIC MOAT CONTROLS -->
          <div class="p-3 bg-zinc-850/60 rounded-xl border border-amber-500/40 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-bold text-amber-300">Sticker Cutout / Pop-Art</span>
              <span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">Retro Vibe</span>
            </div>
            <div class="space-y-1">
              <div class="flex justify-between text-xs">
                <span class="text-zinc-300">Moat Width (Outline Gap)</span>
                <span class="font-mono text-amber-400 font-bold">${state.toolSettings.fillMoatWidth ?? 4} px</span>
              </div>
              <input id="slider-fill-moat" type="range" min="2" max="12" value="${state.toolSettings.fillMoatWidth ?? 4}" class="w-full accent-amber-500 h-1 bg-zinc-700 rounded cursor-pointer" />
            </div>
            <p class="text-[10px] text-zinc-400">Floats the fill with an intentional negative space buffer around all lineart curves.</p>
          </div>
        `
        }

        <!-- Sample Source -->
        <div class="flex items-center justify-between text-xs pt-1 border-t border-zinc-800">
          <span class="text-zinc-300 font-medium">Sample Source</span>
          <select id="select-fill-sample" class="bg-zinc-800 text-zinc-200 text-xs px-2 py-1 rounded border border-zinc-700 outline-none">
            <option value="all" ${state.toolSettings.fillSampleMode === 'all' ? 'selected' : ''}>All Visible Layers</option>
            <option value="active" ${state.toolSettings.fillSampleMode === 'active' ? 'selected' : ''}>Active Layer Only</option>
          </select>
        </div>
      </div>
    `;

    document.getElementById('btn-fill-mode-precision')?.addEventListener('click', () => {
      state.toolSettings.fillStyleMode = 'precision';
      updateToolPanelForCurrentTool();
    });
    document.getElementById('btn-fill-mode-artistic')?.addEventListener('click', () => {
      state.toolSettings.fillStyleMode = 'artistic';
      updateToolPanelForCurrentTool();
    });
    document.getElementById('slider-fill-tol')?.addEventListener('input', (e) => {
      state.toolSettings.fillTolerance = parseInt(e.target.value, 10);
      updateToolPanelForCurrentTool();
    });
    document.getElementById('slider-fill-gap')?.addEventListener('input', (e) => {
      state.toolSettings.fillCloseGap = parseInt(e.target.value, 10);
      updateToolPanelForCurrentTool();
    });
    document.getElementById('slider-fill-bleed')?.addEventListener('input', (e) => {
      state.toolSettings.fillBleed = parseInt(e.target.value, 10);
      updateToolPanelForCurrentTool();
    });
    document.getElementById('slider-fill-moat')?.addEventListener('input', (e) => {
      state.toolSettings.fillMoatWidth = parseInt(e.target.value, 10);
      updateToolPanelForCurrentTool();
    });
    document.getElementById('select-fill-sample')?.addEventListener('change', (e) => {
      state.toolSettings.fillSampleMode = e.target.value;
    });
  } else if (tool === 'lassofill') {
    panel.innerHTML = `
      <div class="space-y-3">
        <div class="flex items-center gap-2.5 p-2.5 rounded-xl bg-zinc-800/60 border border-zinc-700/60">
          <div class="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7l7-4 9 3 1 8-6 6-9-2L4 12z" /></svg>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="text-xs font-bold text-zinc-100">Lasso Fill</span>
            <span class="text-[10px] text-zinc-400">Draw any freehand loop to instantly fill with color</span>
          </div>
        </div>
        <div class="space-y-1">
          <div class="flex justify-between text-xs">
            <span class="text-zinc-300 font-medium">Fill Opacity</span>
            <span class="font-mono text-orange-400 font-bold">${Math.round((state.toolSettings.opacity ?? 1) * 100)}%</span>
          </div>
          <input id="slider-lasso-opacity" type="range" min="5" max="100" value="${Math.round((state.toolSettings.opacity ?? 1) * 100)}" class="w-full accent-orange-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer" />
        </div>
      </div>
    `;
    document.getElementById('slider-lasso-opacity')?.addEventListener('input', (e) => {
      state.toolSettings.opacity = parseInt(e.target.value, 10) / 100;
      updateToolPanelForCurrentTool();
    });
  } else if (tool === 'shape') {
    const activePreset = state.toolSettings.shapePreset || 'rectangle';
    const isRounded = activePreset === 'rounded-rect';
    const isPolygon = activePreset === 'polygon';
    const currentMode = state.toolSettings.shapeMode || 'stroke';
    const currentDash = state.toolSettings.strokeDash || 'solid';

    panel.innerHTML = `
      <div class="space-y-4">
        <!-- 1. Presets Header & Catalog -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-orange-400">Shape Studio</span>
            <span class="text-[10px] font-mono text-zinc-500">${SHAPE_PRESETS.length} PRESETS</span>
          </div>
          <div id="shape-presets-list" class="space-y-1.5 max-h-52 overflow-y-auto pr-1"></div>
        </div>

        <div class="h-px bg-zinc-800"></div>

        <!-- 2. Paint & Style Mode (Segmented Pill) -->
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-zinc-300">Style Mode</label>
          <div class="segmented-pill-wrap">
            <button id="btn-mode-stroke" class="segmented-pill-item ${
              currentMode === 'stroke' ? 'active' : ''
            }">Stroke</button>
            <button id="btn-mode-fill" class="segmented-pill-item ${
              currentMode === 'fill' ? 'active' : ''
            }">Fill</button>
            <button id="btn-mode-both" class="segmented-pill-item ${
              currentMode === 'both' ? 'active' : ''
            }">Both</button>
          </div>
        </div>

        <!-- 3. Stroke Width -->
        <div class="space-y-2">
          <div class="flex justify-between text-xs">
            <span class="text-zinc-300 font-medium">Stroke Width</span>
            <span class="font-mono text-orange-400 font-bold">${state.toolSettings.size} px</span>
          </div>
          <input id="slider-shape-size" type="range" min="1" max="64" value="${state.toolSettings.size}" class="w-full accent-orange-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer" />
        </div>

        <!-- 4. Opacity -->
        <div class="space-y-2">
          <div class="flex justify-between text-xs">
            <span class="text-zinc-300 font-medium">Opacity</span>
            <span class="font-mono text-orange-400 font-bold">${Math.round((state.toolSettings.opacity ?? 1) * 100)}%</span>
          </div>
          <input id="slider-shape-opacity" type="range" min="5" max="100" value="${Math.round((state.toolSettings.opacity ?? 1) * 100)}" class="w-full accent-orange-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer" />
        </div>

        <!-- 5. Line Dash Pattern (Segmented Pill) -->
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-zinc-300">Dash Pattern</label>
          <div class="segmented-pill-wrap">
            <button id="btn-dash-solid" class="segmented-pill-item ${
              currentDash === 'solid' ? 'active' : ''
            }">Solid</button>
            <button id="btn-dash-dashed" class="segmented-pill-item ${
              currentDash === 'dashed' ? 'active' : ''
            }">Dashed</button>
            <button id="btn-dash-dotted" class="segmented-pill-item ${
              currentDash === 'dotted' ? 'active' : ''
            }">Dotted</button>
          </div>
        </div>

        <!-- 6. Conditional Geometry Settings -->
        ${
          isRounded
            ? `
          <div class="space-y-2 pt-1 border-t border-zinc-800/80">
            <div class="flex justify-between text-xs">
              <span class="text-zinc-300 font-medium">Corner Radius</span>
              <span class="font-mono text-orange-400 font-bold">${state.toolSettings.cornerRadius || 12} px</span>
            </div>
            <input id="slider-shape-radius" type="range" min="1" max="64" value="${state.toolSettings.cornerRadius || 12}" class="w-full accent-orange-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer" />
          </div>
        `
            : ''
        }

        ${
          isPolygon
            ? `
          <div class="space-y-2 pt-1 border-t border-zinc-800/80">
            <div class="flex justify-between text-xs">
              <span class="text-zinc-300 font-medium">Polygon Sides</span>
              <span class="font-mono text-orange-400 font-bold">${state.toolSettings.polygonSides || 3}</span>
            </div>
            <input id="slider-polygon-sides" type="range" min="3" max="12" value="${state.toolSettings.polygonSides || 3}" class="w-full accent-orange-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer" />
          </div>
        `
            : ''
        }

        <!-- Tip card -->
        <div class="p-2.5 bg-zinc-800/40 rounded-xl border border-zinc-700/40 text-[10px] text-zinc-400 flex items-center gap-2">
          <kbd class="px-1 py-0.5 bg-zinc-900 rounded font-mono font-bold text-zinc-300 text-[9px]">Shift</kbd>
          <span>Hold to lock 1:1 aspect ratio or 45° angles.</span>
        </div>
      </div>
    `;

    renderShapePresetsList(document.getElementById('shape-presets-list'));

    // Event listeners
    document.getElementById('btn-mode-stroke')?.addEventListener('click', () => {
      state.toolSettings.shapeMode = 'stroke';
      updateToolPanelForCurrentTool();
    });
    document.getElementById('btn-mode-fill')?.addEventListener('click', () => {
      state.toolSettings.shapeMode = 'fill';
      updateToolPanelForCurrentTool();
    });
    document.getElementById('btn-mode-both')?.addEventListener('click', () => {
      state.toolSettings.shapeMode = 'both';
      updateToolPanelForCurrentTool();
    });

    document.getElementById('slider-shape-size')?.addEventListener('input', (e) => {
      state.toolSettings.size = parseInt(e.target.value, 10);
      updateToolPanelForCurrentTool();
    });

    document.getElementById('slider-shape-opacity')?.addEventListener('input', (e) => {
      state.toolSettings.opacity = parseInt(e.target.value, 10) / 100;
      updateToolPanelForCurrentTool();
    });

    document.getElementById('btn-dash-solid')?.addEventListener('click', () => {
      state.toolSettings.strokeDash = 'solid';
      updateToolPanelForCurrentTool();
    });
    document.getElementById('btn-dash-dashed')?.addEventListener('click', () => {
      state.toolSettings.strokeDash = 'dashed';
      updateToolPanelForCurrentTool();
    });
    document.getElementById('btn-dash-dotted')?.addEventListener('click', () => {
      state.toolSettings.strokeDash = 'dotted';
      updateToolPanelForCurrentTool();
    });

    document.getElementById('slider-shape-radius')?.addEventListener('input', (e) => {
      state.toolSettings.cornerRadius = parseInt(e.target.value, 10);
      updateToolPanelForCurrentTool();
    });

    document.getElementById('slider-polygon-sides')?.addEventListener('input', (e) => {
      state.toolSettings.polygonSides = parseInt(e.target.value, 10);
      updateToolPanelForCurrentTool();
    });
  } else {
    panel.innerHTML = `
      <div class="p-3 bg-zinc-800/40 rounded-xl border border-zinc-700/40 text-center text-xs text-zinc-500">
        This tool has no adjustable settings.
      </div>
    `;
  }
}

export function setupColorPalettes() {
  if (!elements.quickSwatchesGrid) return;
  const swatches = [
    '#000000', '#ffffff', '#ef4444', '#f97316', '#f59e0b', '#10b981',
    '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#71717a',
  ];
  elements.quickSwatchesGrid.innerHTML = '';
  swatches.forEach((hex) => {
    const btn = document.createElement('button');
    btn.className = 'w-7 h-7 rounded-lg border border-white/20 shadow-sm cursor-pointer transition hover:scale-110';
    btn.style.backgroundColor = hex;
    btn.addEventListener('click', () => {
      state.toolSettings.color = hex;
      if (elements.primaryColorPicker) elements.primaryColorPicker.value = hex;
    });
    elements.quickSwatchesGrid.appendChild(btn);
  });

  const presetPalettes = [
    {
      name: 'Anime Cel Shading',
      colors: ['#2b2d42', '#8d99ae', '#edf2f4', '#ef233c', '#d90429'],
    },
    {
      name: 'Character Skin Tones',
      colors: ['#ffdfba', '#ffd1a4', '#f1c27d', '#e0ac69', '#8d5524'],
    },
    {
      name: 'Cyberpunk Neon',
      colors: ['#0ff0fc', '#ff007f', '#ffe600', '#2d00f7', '#8900f2'],
    },
  ];

  if (elements.presetPalettesContainer) {
    elements.presetPalettesContainer.innerHTML = '';
    presetPalettes.forEach((p) => {
      const block = document.createElement('div');
      block.className = 'space-y-1.5';
      block.innerHTML = `<div class="text-[11px] font-semibold text-zinc-400">${p.name}</div>`;
      const row = document.createElement('div');
      row.className = 'flex gap-1.5 p-1.5 bg-zinc-800/40 rounded-xl border border-zinc-700/40';
      p.colors.forEach((c) => {
        const b = document.createElement('button');
        b.className = 'w-8 h-7 rounded-lg border border-white/10 shadow-xs cursor-pointer hover:scale-105 transition';
        b.style.backgroundColor = c;
        b.addEventListener('click', () => {
          state.toolSettings.color = c;
          if (elements.primaryColorPicker) elements.primaryColorPicker.value = c;
        });
        row.appendChild(b);
      });
      block.appendChild(row);
      elements.presetPalettesContainer.appendChild(block);
    });
  }
}

export function setToolByName(toolName) {
  state.currentTool = toolName;
  document.querySelectorAll('.tool-btn').forEach((btn) => {
    const isTarget = btn.getAttribute('data-tool') === toolName;
    btn.classList.toggle('active-tool', isTarget);
    btn.classList.toggle('text-orange-400', isTarget);
    btn.classList.toggle('bg-orange-500/15', isTarget);
    btn.classList.toggle('border', isTarget);
    btn.classList.toggle('border-orange-500/50', isTarget);
    btn.classList.toggle('shadow-md', isTarget);
    btn.classList.toggle('shadow-orange-500/20', isTarget);
    btn.classList.toggle('text-zinc-400', !isTarget);
  });
  if (elements.canvasContainer) {
    elements.canvasContainer.style.cursor =
      toolName === 'hand' ? 'grab' : toolName === 'move' ? 'move' : '';
  }
  updateToolPanelForCurrentTool();
}

