// src/js/ui/artistPalettes.js
// Inspiring curated artist palettes, interactive HSB color disc, and image palette extractor

import { state } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { showToast } from './toast.js';
import { refreshQuickPaletteUI } from './quickPalette.js';

export const ARTIST_PALETTES = [
  {
    id: 'still-life',
    name: 'Still Life & Fruit',
    icon: '🍎',
    desc: 'Rich crimson, vermilion, ripe fruit tones, and warm earth shadows.',
    colors: [
      '#e63946', '#991b1b', '#450a0a', '#ea580c', '#fbbf24', '#fef08a',
      '#15803d', '#4d7c0f', '#78350f', '#451a03', '#ffffff', '#09090b',
    ]
  },
  {
    id: 'nature',
    name: 'Botanical & Nature',
    icon: '🌿',
    desc: 'Forest pines, lush moss, spring sprouts, and earthy tree bark.',
    colors: [
      '#14532d', '#16a34a', '#4ade80', '#bef264', '#84cc16', '#3f6212',
      '#713f12', '#a16207', '#38bdf8', '#fef08a', '#ffffff', '#1c1917',
    ]
  },
  {
    id: 'sunset',
    name: 'Sunset & Golden Hour',
    icon: '🌅',
    desc: 'Dramatic dusk indigos, mulberry violets, coral, and radiant amber.',
    colors: [
      '#1e1b4b', '#581c87', '#9333ea', '#f43f5e', '#fb7185', '#f97316',
      '#eab308', '#fed7aa', '#38bdf8', '#0f172a', '#ffffff', '#450a0a',
    ]
  },
  {
    id: 'masters',
    name: 'Old Masters Oil',
    icon: '🎨',
    desc: 'Traditional classical studio palette: ochres, umbers, ultramarine and crimson.',
    colors: [
      '#ca8a04', '#7c2d12', '#451a03', '#991b1b', '#1d4ed8', '#065f46',
      '#fef3c7', '#e2e8f0', '#0f172a', '#b45309', '#64748b', '#f8fafc',
    ]
  },
  {
    id: 'portrait',
    name: 'Portrait & Skin',
    icon: '👤',
    desc: 'Delicate undertones, warm ochres, rich tans, deep melanos, and blush accents.',
    colors: [
      '#fff1f2', '#fed7aa', '#fde047', '#f59e0b', '#d97706', '#9a3412',
      '#451a03', '#fb7185', '#e11d48', '#4c1d95', '#ffffff', '#1e1b4b',
    ]
  },
  {
    id: 'pastel',
    name: 'Pastel Dream / Gouache',
    icon: '🌸',
    desc: 'Soft, creamy, dreamy opaque gouache tints.',
    colors: [
      '#c084fc', '#93c5fd', '#86efac', '#fde047', '#fda4af', '#fef08a',
      '#e9d5ff', '#fed7aa', '#cbd5e1', '#f472b6', '#ffffff', '#334155',
    ]
  },
  {
    id: 'manga',
    name: 'Manga & Comic Inking',
    icon: '⛩️',
    desc: 'Deep Sumi black ink, clean screentone grays, and dynamic accent pops.',
    colors: [
      '#09090b', '#27272a', '#52525b', '#71717a', '#a1a1aa', '#e4e4e7',
      '#ffffff', '#06b6d4', '#dc2626', '#eab308', '#3b82f6', '#f43f5e',
    ]
  }
];

export const SAVED_ACTIVE_PALETTE_KEY = 'mannsejro_active_artist_palette';

export function getActiveArtistPaletteId() {
  try {
    return localStorage.getItem(SAVED_ACTIVE_PALETTE_KEY) || 'still-life';
  } catch (e) {
    return 'still-life';
  }
}

export function setActiveArtistPaletteId(id) {
  try {
    localStorage.setItem(SAVED_ACTIVE_PALETTE_KEY, id);
  } catch (e) {}
}

// -------------------------------------------------------------
// Color Math Helpers (Hex <-> HSV <-> RGB)
// -------------------------------------------------------------
export function hexToRgb(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

export function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, v = max;
  const d = max - min;
  s = max === 0 ? 0 : d / max;
  if (max === min) {
    h = 0;
  } else {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, v: v * 100 };
}

export function hsvToRgb(h, s, v) {
  h = (h % 360 + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  v = Math.max(0, Math.min(100, v)) / 100;

  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;

  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  return {
    r: (r + m) * 255,
    g: (g + m) * 255,
    b: (b + m) * 255
  };
}

export function hsvToHex(h, s, v) {
  const rgb = hsvToRgb(h, s, v);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

// -------------------------------------------------------------
// Calculate Color Harmonies
// -------------------------------------------------------------
export function calculateHarmonies(hex) {
  const rgb = hexToRgb(hex);
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

  return {
    complement: hsvToHex((hsv.h + 180) % 360, hsv.s, hsv.v),
    triadic1: hsvToHex((hsv.h + 120) % 360, hsv.s, hsv.v),
    triadic2: hsvToHex((hsv.h + 240) % 360, hsv.s, hsv.v),
    analogous1: hsvToHex((hsv.h + 30) % 360, hsv.s, hsv.v),
    analogous2: hsvToHex((hsv.h + 330) % 360, hsv.s, hsv.v),
    splitComp1: hsvToHex((hsv.h + 150) % 360, hsv.s, hsv.v),
    splitComp2: hsvToHex((hsv.h + 210) % 360, hsv.s, hsv.v),
  };
}

// -------------------------------------------------------------
// Image Dominant Palette Extractor
// -------------------------------------------------------------
export async function extractPaletteFromImage(fileOrUrl, count = 8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const w = Math.min(100, img.width);
      const h = Math.min(100, img.height);
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);

      const imgData = ctx.getImageData(0, 0, w, h).data;
      const buckets = new Map();

      // Sample every 4th pixel
      for (let i = 0; i < imgData.length; i += 16) {
        const r = imgData[i];
        const g = imgData[i + 1];
        const b = imgData[i + 2];
        const a = imgData[i + 3];
        if (a < 128) continue; // Skip transparent

        // Quantize to 32 steps
        const qr = Math.round(r / 32) * 32;
        const qg = Math.round(g / 32) * 32;
        const qb = Math.round(b / 32) * 32;
        const hex = rgbToHex(qr, qg, qb);
        buckets.set(hex, (buckets.get(hex) || 0) + 1);
      }

      const sorted = Array.from(buckets.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, count)
        .map(entry => entry[0]);

      resolve(sorted.length > 0 ? sorted : ['#1e293b', '#ea580c', '#38bdf8', '#22c55e', '#ffffff']);
    };
    img.onerror = () => reject(new Error('Failed to load image for extraction'));

    if (typeof fileOrUrl === 'string') {
      img.src = fileOrUrl;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => { img.src = e.target.result; };
      reader.readAsDataURL(fileOrUrl);
    }
  });
}

// -------------------------------------------------------------
// Render Complete Color Studio Tab
// -------------------------------------------------------------
export function renderColorStudioTab(container) {
  if (!container) return;

  const currentColor = state.toolSettings?.color || '#38bdf8';
  const rgb = hexToRgb(currentColor);
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  const harmonies = calculateHarmonies(currentColor);
  const activePaletteId = getActiveArtistPaletteId();

  container.innerHTML = `
    <div class="space-y-4 select-none pb-6">
      
      <!-- 1. HEADER & CURRENT COLOR PREVIEW -->
      <div class="spec-header text-sky-400 flex items-center justify-between">
        <span>Color Studio</span>
        <span class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">HSB & Palette Lab</span>
      </div>

      <!-- Active Color Big Badge & Hex/RGB inputs -->
      <div class="spec-card space-y-2.5">
        <div class="flex items-center gap-3">
          <div class="relative w-12 h-12 rounded-xl overflow-hidden shadow-inner border-2 border-white/20 shrink-0">
            <div id="cs-current-color-preview" class="w-full h-full" style="background-color: ${currentColor};"></div>
          </div>
          <div class="flex-1 space-y-1">
            <div class="flex items-center justify-between text-xs font-mono">
              <span class="text-slate-400">HEX</span>
              <input id="cs-hex-input" type="text" value="${currentColor.toUpperCase()}" class="w-24 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-right font-bold text-white uppercase focus:border-sky-500 outline-none" />
            </div>
            <div class="flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>RGB</span>
              <span>${rgb.r}, ${rgb.g}, ${rgb.b}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. INTERACTIVE HSB COLOR DISC -->
      <div class="spec-card space-y-2">
        <div class="spec-header text-slate-200">HSB Color Wheel</div>
        <div class="flex justify-center relative py-1">
          <canvas id="cs-color-disc" width="200" height="200" class="w-48 h-48 rounded-full shadow-lg border border-slate-700/80 cursor-crosshair"></canvas>
          <div id="cs-disc-needle" class="absolute w-3.5 h-3.5 rounded-full border-2 border-white bg-transparent pointer-events-none shadow-md -translate-x-1/2 -translate-y-1/2"></div>
        </div>

        <!-- Continuous Sliders: Hue, Saturation, Brightness -->
        <div class="space-y-2 pt-2 border-t border-slate-800 text-xs">
          <div>
            <div class="flex justify-between font-mono text-[10px] text-slate-300 mb-0.5">
              <span>Hue</span>
              <span id="cs-val-hue">${Math.round(hsv.h)}°</span>
            </div>
            <input id="cs-slider-hue" type="range" min="0" max="360" value="${Math.round(hsv.h)}" class="w-full h-2 rounded-lg cursor-pointer appearance-none" style="background: linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000);" />
          </div>

          <div>
            <div class="flex justify-between font-mono text-[10px] text-slate-300 mb-0.5">
              <span>Saturation</span>
              <span id="cs-val-sat">${Math.round(hsv.s)}%</span>
            </div>
            <input id="cs-slider-sat" type="range" min="0" max="100" value="${Math.round(hsv.s)}" class="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer" />
          </div>

          <div>
            <div class="flex justify-between font-mono text-[10px] text-slate-300 mb-0.5">
              <span>Brightness</span>
              <span id="cs-val-bri">${Math.round(hsv.v)}%</span>
            </div>
            <input id="cs-slider-bri" type="range" min="0" max="100" value="${Math.round(hsv.v)}" class="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer" />
          </div>
        </div>
      </div>

      <!-- 3. COLOR HARMONIES -->
      <div class="spec-card space-y-2">
        <div class="spec-header text-slate-200">Dynamic Color Harmonies</div>
        <div class="grid grid-cols-4 gap-1.5 pt-1">
          <button data-cs-apply="${harmonies.complement}" title="Complementary" class="p-1.5 rounded-lg border border-slate-700/60 text-center hover:scale-105 transition">
            <div class="w-full h-5 rounded" style="background-color: ${harmonies.complement};"></div>
            <span class="text-[8px] text-slate-400 block mt-1">Comp</span>
          </button>
          <button data-cs-apply="${harmonies.triadic1}" title="Triadic A" class="p-1.5 rounded-lg border border-slate-700/60 text-center hover:scale-105 transition">
            <div class="w-full h-5 rounded" style="background-color: ${harmonies.triadic1};"></div>
            <span class="text-[8px] text-slate-400 block mt-1">Triad A</span>
          </button>
          <button data-cs-apply="${harmonies.analogous1}" title="Analogous A" class="p-1.5 rounded-lg border border-slate-700/60 text-center hover:scale-105 transition">
            <div class="w-full h-5 rounded" style="background-color: ${harmonies.analogous1};"></div>
            <span class="text-[8px] text-slate-400 block mt-1">Analog</span>
          </button>
          <button data-cs-apply="${harmonies.splitComp1}" title="Split Comp A" class="p-1.5 rounded-lg border border-slate-700/60 text-center hover:scale-105 transition">
            <div class="w-full h-5 rounded" style="background-color: ${harmonies.splitComp1};"></div>
            <span class="text-[8px] text-slate-400 block mt-1">Split</span>
          </button>
        </div>
      </div>

      <!-- 4. IMAGE-TO-PALETTE EXTRACTOR -->
      <div class="spec-card space-y-2">
        <div class="spec-header text-slate-200">Image Palette Extractor</div>
        <label class="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-dashed border-slate-700 bg-slate-950/60 hover:bg-slate-950 text-slate-300 hover:text-white cursor-pointer transition text-xs font-semibold">
          <span>📷 Drop Image / Click to Extract</span>
          <input id="cs-img-extractor-input" type="file" accept="image/*" class="hidden" />
        </label>
        <div id="cs-extracted-swatches" class="grid grid-cols-8 gap-1 pt-1 hidden">
          <!-- Extracted colors populate here -->
        </div>
      </div>

      <!-- 5. CURATED ARTIST PALETTES -->
      <div class="spec-card space-y-2.5">
        <div class="spec-header text-slate-200">Curated Master Palettes</div>
        <div class="space-y-2 max-h-64 overflow-y-auto pr-1">
          ${ARTIST_PALETTES.map(p => `
            <div class="p-2 rounded-xl border ${activePaletteId === p.id ? 'bg-sky-500/10 border-sky-500/50' : 'bg-slate-950/60 border-slate-800'} space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="font-bold text-slate-200 flex items-center gap-1.5">
                  <span>${p.icon}</span>
                  <span>${p.name}</span>
                </span>
                <button data-load-palette="${p.id}" class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${activePaletteId === p.id ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}">
                  ${activePaletteId === p.id ? 'Active' : 'Select'}
                </button>
              </div>
              <div class="grid grid-cols-6 gap-1">
                ${p.colors.map(c => `
                  <button data-cs-apply="${c}" class="w-full h-5 rounded border border-white/10 hover:scale-110 transition shadow-xs" style="background-color: ${c};" title="${c}"></button>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

    </div>
  `;

  // Draw HSB Disc
  drawColorDisc();
  setupDiscEvents();
  setupSliderEvents();
  setupPaletteExtractorEvents();

  // Color apply buttons
  container.querySelectorAll('[data-cs-apply]').forEach(btn => {
    btn.addEventListener('click', () => {
      applyColor(btn.dataset.csApply);
    });
  });

  // Load palette button
  container.querySelectorAll('[data-load-palette]').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.dataset.loadPalette;
      setActiveArtistPaletteId(pid);
      renderColorStudioTab(container);
      showToast(`Loaded ${ARTIST_PALETTES.find(x => x.id === pid)?.name} Palette`);
    });
  });

  // Hex input
  const hexInput = container.querySelector('#cs-hex-input');
  if (hexInput) {
    hexInput.addEventListener('change', (e) => {
      let val = e.target.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9A-F]{6}$/i.test(val)) {
        applyColor(val);
      }
    });
  }

  function applyColor(hex) {
    state.toolSettings.color = hex;
    if (elements.primaryColorPicker) elements.primaryColorPicker.value = hex;
    refreshQuickPaletteUI();
    renderColorStudioTab(container);
  }

  function drawColorDisc() {
    const canvas = container.querySelector('#cs-color-disc');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const radius = width / 2 - 2;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.hypot(dx, dy);
        const idx = (y * width + x) * 4;

        if (dist <= radius) {
          let angle = Math.atan2(dy, dx) * (180 / Math.PI);
          if (angle < 0) angle += 360;
          const sat = (dist / radius) * 100;
          const rgbCol = hsvToRgb(angle, sat, hsv.v);

          data[idx] = rgbCol.r;
          data[idx + 1] = rgbCol.g;
          data[idx + 2] = rgbCol.b;
          data[idx + 3] = 255;
        } else {
          data[idx + 3] = 0;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Position needle
    const needle = container.querySelector('#cs-disc-needle');
    if (needle) {
      const angleRad = (hsv.h * Math.PI) / 180;
      const dist = (hsv.s / 100) * 96;
      const nx = 96 + Math.cos(angleRad) * dist;
      const ny = 96 + Math.sin(angleRad) * dist;
      needle.style.left = `${nx}px`;
      needle.style.top = `${ny}px`;
    }
  }

  function setupDiscEvents() {
    const canvas = container.querySelector('#cs-color-disc');
    if (!canvas) return;
    let isDragging = false;

    const handleDiscPointer = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const radius = rect.width / 2;

      let angle = Math.atan2(dy, dx) * (180 / Math.PI);
      if (angle < 0) angle += 360;
      const sat = Math.min(100, (dist / radius) * 100);

      const newHex = hsvToHex(angle, sat, hsv.v);
      state.toolSettings.color = newHex;
      if (elements.primaryColorPicker) elements.primaryColorPicker.value = newHex;
      refreshQuickPaletteUI();

      // Quick update without full redraw
      const preview = container.querySelector('#cs-current-color-preview');
      if (preview) preview.style.backgroundColor = newHex;
      const hexInp = container.querySelector('#cs-hex-input');
      if (hexInp) hexInp.value = newHex.toUpperCase();
    };

    canvas.addEventListener('pointerdown', (e) => {
      isDragging = true;
      handleDiscPointer(e);
    });

    window.addEventListener('pointermove', (e) => {
      if (isDragging) handleDiscPointer(e);
    });

    window.addEventListener('pointerup', () => {
      if (isDragging) {
        isDragging = false;
        renderColorStudioTab(container);
      }
    });
  }

  function setupSliderEvents() {
    const sHue = container.querySelector('#cs-slider-hue');
    const sSat = container.querySelector('#cs-slider-sat');
    const sBri = container.querySelector('#cs-slider-bri');

    const updateLive = () => {
      const h = parseInt(sHue?.value || 0, 10);
      const s = parseInt(sSat?.value || 100, 10);
      const v = parseInt(sBri?.value || 100, 10);
      const newHex = hsvToHex(h, s, v);

      hsv.h = h;
      hsv.s = s;
      hsv.v = v;

      state.toolSettings.color = newHex;
      if (elements.primaryColorPicker) elements.primaryColorPicker.value = newHex;

      const preview = container.querySelector('#cs-current-color-preview');
      if (preview) preview.style.backgroundColor = newHex;
      const hexInp = container.querySelector('#cs-hex-input');
      if (hexInp) hexInp.value = newHex.toUpperCase();

      const lH = container.querySelector('#cs-val-hue');
      if (lH) lH.textContent = `${h}°`;
      const lS = container.querySelector('#cs-val-sat');
      if (lS) lS.textContent = `${s}%`;
      const lB = container.querySelector('#cs-val-bri');
      if (lB) lB.textContent = `${v}%`;

      drawColorDisc();
    };

    const commitChange = () => {
      refreshQuickPaletteUI();
      renderColorStudioTab(container);
    };

    sHue?.addEventListener('input', updateLive);
    sSat?.addEventListener('input', updateLive);
    sBri?.addEventListener('input', updateLive);

    sHue?.addEventListener('change', commitChange);
    sSat?.addEventListener('change', commitChange);
    sBri?.addEventListener('change', commitChange);
  }

  function setupPaletteExtractorEvents() {
    const fileInput = container.querySelector('#cs-img-extractor-input');
    const swatchesGrid = container.querySelector('#cs-extracted-swatches');
    if (!fileInput || !swatchesGrid) return;

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const extracted = await extractPaletteFromImage(file, 8);
        swatchesGrid.innerHTML = '';
        swatchesGrid.classList.remove('hidden');
        extracted.forEach(hex => {
          const btn = document.createElement('button');
          btn.className = 'w-full h-6 rounded border border-white/20 hover:scale-110 transition shadow-xs';
          btn.style.backgroundColor = hex;
          btn.title = `Extracted: ${hex}`;
          btn.addEventListener('click', () => applyColor(hex));
          swatchesGrid.appendChild(btn);
        });
        showToast('Extracted 8 dominant palette swatches!');
      } catch (err) {
        showToast('Could not extract palette from image', 'error');
      }
    });
  }
}
