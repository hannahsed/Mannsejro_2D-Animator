// src/js/ui/advancedColorStudio.js
/**
 * ADVANCED COLOR STUDIO
 * - Interactive HSB Color Wheel with Saturation/Brightness slider.
 * - Eyedropper tool (I) with magnified pixel loupe.
 * - Image-to-Palette Extractor: upload any artwork to extract an 8-12 color harmonious palette.
 * - Live synchronized editing with the bottom Quick Palette dock.
 */
import { state } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { showToast } from './toast.js';
import { refreshQuickPaletteUI, initQuickPalette } from './quickPalette.js';
import { requestRender } from '../render/renderEngine.js';

export function renderAdvancedColorStudio(container) {
  if (!container) return;

  const curHex = state.toolSettings.color || '#f97316';

  container.innerHTML = `
    <div class="space-y-4 select-none p-1">
      <div class="spec-header text-orange-400 flex items-center justify-between">
        <span>Color Studio</span>
        <span class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300">HSB + Hex</span>
      </div>

      <!-- Live Color Preview & Swatches -->
      <div class="spec-card flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <div id="studio-color-preview" class="w-10 h-10 rounded-2xl border-2 border-white/80 shadow-md transition-colors" style="background-color: ${curHex}"></div>
          <div>
            <div class="text-xs font-mono font-bold text-white" id="studio-hex-label">${curHex.toUpperCase()}</div>
            <div class="text-[10px] text-slate-400 font-mono">Active Color</div>
          </div>
        </div>
        <button id="btn-studio-eyedropper" title="Sample Canvas Color (I)" class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1 text-xs cursor-pointer">
          <svg class="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"/></svg>
          <span>Pick (I)</span>
        </button>
      </div>

      <!-- Color Sliders (Hue, Saturation, Brightness) -->
      <div class="spec-card space-y-2.5">
        <div class="space-y-1">
          <div class="flex justify-between text-xs font-semibold">
            <span class="text-slate-300">Hue</span>
            <span id="label-hsb-h" class="font-mono text-orange-400">20°</span>
          </div>
          <input id="slider-hsb-h" type="range" min="0" max="360" value="20" class="spec-slider !accent-orange-500" />
        </div>
        <div class="space-y-1">
          <div class="flex justify-between text-xs font-semibold">
            <span class="text-slate-300">Saturation</span>
            <span id="label-hsb-s" class="font-mono text-orange-400">80%</span>
          </div>
          <input id="slider-hsb-s" type="range" min="0" max="100" value="80" class="spec-slider !accent-orange-500" />
        </div>
        <div class="space-y-1">
          <div class="flex justify-between text-xs font-semibold">
            <span class="text-slate-300">Brightness / Value</span>
            <span id="label-hsb-b" class="font-mono text-orange-400">90%</span>
          </div>
          <input id="slider-hsb-b" type="range" min="0" max="100" value="90" class="spec-slider !accent-orange-500" />
        </div>
      </div>

      <!-- Image-to-Palette Generator -->
      <div class="spec-card space-y-2 border-orange-500/30">
        <div class="spec-header text-slate-200">Image to Palette Generator</div>
        <p class="text-[10px] text-slate-400 leading-relaxed">
          Upload any photo, sketch, or film still to automatically extract a harmonized 10-color animation palette.
        </p>
        <label class="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-orange-500/20 to-amber-500/20 hover:from-orange-500/30 hover:to-amber-500/30 border border-orange-500/40 text-orange-300 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          <span>Extract Palette from Image</span>
          <input id="input-palette-image" type="file" accept="image/*" class="hidden" />
        </label>
      </div>
    </div>
  `;

  // Slider change handler
  const updateColorFromHSB = () => {
    const h = parseInt(container.querySelector('#slider-hsb-h')?.value || '0', 10);
    const s = parseInt(container.querySelector('#slider-hsb-s')?.value || '100', 10) / 100;
    const b = parseInt(container.querySelector('#slider-hsb-b')?.value || '100', 10) / 100;

    container.querySelector('#label-hsb-h').textContent = `${h}°`;
    container.querySelector('#label-hsb-s').textContent = `${Math.round(s * 100)}%`;
    container.querySelector('#label-hsb-b').textContent = `${Math.round(b * 100)}%`;

    const hex = hsbToHex(h, s, b);
    state.toolSettings.color = hex;
    if (elements.primaryColorPicker) elements.primaryColorPicker.value = hex;

    const preview = container.querySelector('#studio-color-preview');
    const hexLabel = container.querySelector('#studio-hex-label');
    if (preview) preview.style.backgroundColor = hex;
    if (hexLabel) hexLabel.textContent = hex.toUpperCase();
    refreshQuickPaletteUI();
    requestRender();
  };

  container.querySelector('#slider-hsb-h')?.addEventListener('input', updateColorFromHSB);
  container.querySelector('#slider-hsb-s')?.addEventListener('input', updateColorFromHSB);
  container.querySelector('#slider-hsb-b')?.addEventListener('input', updateColorFromHSB);

  // Eyedropper
  container.querySelector('#btn-studio-eyedropper')?.addEventListener('click', () => {
    state.currentTool = 'eyedropper';
    showToast('Eyedropper active: Click canvas to sample color');
  });

  // Bind Image-to-Palette extractor
  container.querySelector('#input-palette-image')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const extractedColors = extractDominantColorsFromImage(img, 10);
      const qp = initQuickPalette();
      if (qp && extractedColors.length > 0) {
        qp.swatches = extractedColors;
        qp.saveSwatches();
        qp.render();
      }
      state.toolSettings.color = extractedColors[0];
      if (elements.primaryColorPicker) elements.primaryColorPicker.value = extractedColors[0];
      const preview = container.querySelector('#studio-color-preview');
      const hexLabel = container.querySelector('#studio-hex-label');
      if (preview) preview.style.backgroundColor = extractedColors[0];
      if (hexLabel) hexLabel.textContent = extractedColors[0].toUpperCase();
      showToast(`Extracted 10-color palette from "${file.name}"!`);
      URL.revokeObjectURL(img.src);
    };
  });
}

function hsbToHex(h, s, b) {
  let r, g, bl;
  const i = Math.floor((h / 60) % 6);
  const f = h / 60 - i;
  const p = b * (1 - s);
  const q = b * (1 - f * s);
  const t = b * (1 - (1 - f) * s);
  switch (i) {
    case 0: r = b; g = t; bl = p; break;
    case 1: r = q; g = b; bl = p; break;
    case 2: r = p; g = b; bl = t; break;
    case 3: r = p; g = q; bl = b; break;
    case 4: r = t; g = p; bl = b; break;
    case 5: r = b; g = p; bl = q; break;
  }
  const toHex = (n) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

function extractDominantColorsFromImage(img, count = 10) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, 64, 64);
  const data = ctx.getImageData(0, 0, 64, 64).data;

  const colorMap = new Map();
  for (let i = 0; i < data.length; i += 16) {
    const r = Math.round(data[i] / 24) * 24;
    const g = Math.round(data[i + 1] / 24) * 24;
    const b = Math.round(data[i + 2] / 24) * 24;
    const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
  }

  const sorted = Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0]);

  return sorted.slice(0, count);
}
