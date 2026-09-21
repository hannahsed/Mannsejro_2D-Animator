// src/js/ui/quickPalette.js
// Inspiring, artist-centric Quick Palette dock with curated theme palettes, paper texture controls, and color tools.

import { state } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { showToast } from './toast.js';
import { ARTIST_PALETTES, getActiveArtistPaletteId, setActiveArtistPaletteId } from './artistPalettes.js';
import { PAPER_PRESETS, currentPaperPresetId, setPaperPreset, togglePaperTexture, paperTextureEnabled } from '../render/paperTextures.js';
import { renderViewport } from '../render/renderEngine.js';

const STORAGE_KEY = 'mannsejro_quick_palette_v3';

export class QuickPaletteManager {
  constructor() {
    this.activePaletteId = getActiveArtistPaletteId();
    this.swatches = this.loadSwatches();
    this.container = document.getElementById('quick-palette-dock');
    this.paletteMenuOpen = false;
    this.paperMenuOpen = false;
    this.init();
  }

  loadSwatches() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}

    // Fallback to active artist palette default
    const pal = ARTIST_PALETTES.find(p => p.id === this.activePaletteId) || ARTIST_PALETTES[0];
    return [...pal.colors];
  }

  saveSwatches() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.swatches));
    } catch (e) {}
  }

  applyArtistPalette(paletteId) {
    const pal = ARTIST_PALETTES.find(p => p.id === paletteId);
    if (!pal) return;

    this.activePaletteId = pal.id;
    setActiveArtistPaletteId(pal.id);
    this.swatches = [...pal.colors];
    this.saveSwatches();

    // Set first color as active
    state.toolSettings.color = this.swatches[0];
    if (elements.primaryColorPicker) elements.primaryColorPicker.value = this.swatches[0];

    this.paletteMenuOpen = false;
    this.render();
    showToast(`Loaded "${pal.name}" palette (${pal.icon})`);
  }

  init() {
    if (!this.container) return;

    // 1. EVENT SHIELD: Completely prevent canvas from stealing clicks or drawing dots
    const stopPropagationEvents = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'touchstart'];
    stopPropagationEvents.forEach(evt => {
      this.container.addEventListener(evt, (e) => {
        e.stopPropagation();
      });
    });

    // 2. Mouse-Wheel Cycling through colors
    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.cycleColor(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    // 3. Number key shortcuts (1 - 9)
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= Math.min(9, this.swatches.length) && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        this.selectColorByIndex(num - 1);
      }
    });

    // Close popups on click outside
    window.addEventListener('click', (e) => {
      if (this.paletteMenuOpen || this.paperMenuOpen) {
        if (!this.container.contains(e.target)) {
          this.paletteMenuOpen = false;
          this.paperMenuOpen = false;
          this.render();
        }
      }
    });

    this.render();
  }

  selectColorByIndex(idx) {
    if (idx < 0 || idx >= this.swatches.length) return;
    const color = this.swatches[idx];
    state.toolSettings.color = color;
    if (elements.primaryColorPicker) elements.primaryColorPicker.value = color;
    this.updateActiveIndicators();
    showToast(`Color ${idx + 1}: ${color}`);
  }

  cycleColor(direction) {
    const cur = (state.toolSettings.color || '').toLowerCase();
    let idx = this.swatches.findIndex(c => c.toLowerCase() === cur);
    if (idx === -1) idx = 0;
    let nextIdx = (idx + direction + this.swatches.length) % this.swatches.length;
    this.selectColorByIndex(nextIdx);
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = '';

    const activePal = ARTIST_PALETTES.find(p => p.id === this.activePaletteId) || ARTIST_PALETTES[0];
    const activePaper = PAPER_PRESETS.find(p => p.id === currentPaperPresetId) || PAPER_PRESETS[1];

    // =========================================================================
    // 1. PALETTE THEME PICKER BUTTON
    // =========================================================================
    const palBtnWrap = document.createElement('div');
    palBtnWrap.className = 'relative shrink-0';

    const palBtn = document.createElement('button');
    palBtn.className = 'px-2 py-1 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-sm transition hover:border-orange-500/50';
    palBtn.title = 'Choose Curated Artist Palette';
    palBtn.innerHTML = `<span>${activePal.icon}</span> <span class="hidden sm:inline text-[11px] font-medium truncate max-w-[85px]">${activePal.name}</span> <span class="text-[9px] text-slate-400">▾</span>`;
    palBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.paperMenuOpen = false;
      this.paletteMenuOpen = !this.paletteMenuOpen;
      this.render();
    });
    palBtnWrap.appendChild(palBtn);

    // Palette Dropdown Menu
    if (this.paletteMenuOpen) {
      const menu = document.createElement('div');
      menu.className = 'absolute bottom-full left-0 mb-2 w-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-2 z-50 flex flex-col gap-1 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100';
      menu.innerHTML = `<div class="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold border-b border-slate-800 mb-1">Artist Color Palettes</div>`;

      ARTIST_PALETTES.forEach(pal => {
        const isSelected = pal.id === this.activePaletteId;
        const item = document.createElement('button');
        item.className = `w-full text-left px-2.5 py-1.5 rounded-xl flex items-center justify-between text-xs transition cursor-pointer ${
          isSelected ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40 font-semibold' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`;

        // Preview swatches mini strip
        const swatchesHtml = pal.colors.slice(0, 5).map(c => 
          `<span class="w-2.5 h-2.5 rounded-full inline-block border border-black/30" style="background-color: ${c}"></span>`
        ).join('');

        item.innerHTML = `
          <div class="flex items-center gap-1.5 truncate">
            <span>${pal.icon}</span>
            <span class="truncate">${pal.name}</span>
          </div>
          <div class="flex items-center gap-0.5 shrink-0 ml-2">
            ${swatchesHtml}
          </div>
        `;

        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.applyArtistPalette(pal.id);
        });

        menu.appendChild(item);
      });

      palBtnWrap.appendChild(menu);
    }
    this.container.appendChild(palBtnWrap);

    // =========================================================================
    // 2. PAPER TEXTURE SELECTOR BUTTON
    // =========================================================================
    const paperBtnWrap = document.createElement('div');
    paperBtnWrap.className = 'relative shrink-0';

    const paperBtn = document.createElement('button');
    paperBtn.className = `px-2 py-1 rounded-xl border text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-sm transition ${
      paperTextureEnabled 
        ? 'bg-amber-950/40 border-amber-500/50 text-amber-200 hover:bg-amber-900/50' 
        : 'bg-slate-800/90 border-slate-700 text-slate-400 hover:bg-slate-700/90'
    }`;
    paperBtn.title = 'Canvas Surface & Paper Tooth';
    paperBtn.innerHTML = `<span>📜</span> <span class="hidden md:inline text-[11px] truncate max-w-[80px]">${activePaper.name.split(' ')[0]}</span> <span class="text-[9px] text-slate-400">▾</span>`;
    paperBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.paletteMenuOpen = false;
      this.paperMenuOpen = !this.paperMenuOpen;
      this.render();
    });
    paperBtnWrap.appendChild(paperBtn);

    // Paper Dropdown Menu
    if (this.paperMenuOpen) {
      const pMenu = document.createElement('div');
      pMenu.className = 'absolute bottom-full left-0 mb-2 w-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-2 z-50 flex flex-col gap-1 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100';

      const toggleRow = document.createElement('div');
      toggleRow.className = 'px-2 py-1 flex items-center justify-between border-b border-slate-800 mb-1 text-[11px] text-slate-300 font-medium';
      toggleRow.innerHTML = `
        <span>Paper Texture</span>
        <button id="qp-toggle-paper" class="px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
          paperTextureEnabled ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'
        }">${paperTextureEnabled ? 'ON' : 'OFF'}</button>
      `;
      toggleRow.querySelector('#qp-toggle-paper').addEventListener('click', (e) => {
        e.stopPropagation();
        togglePaperTexture();
        state.toolSettings.paperTexture = paperTextureEnabled;
        renderViewport();
        this.render();
      });
      pMenu.appendChild(toggleRow);

      PAPER_PRESETS.forEach(preset => {
        const isSelected = preset.id === currentPaperPresetId;
        const item = document.createElement('button');
        item.className = `w-full text-left px-2.5 py-1.5 rounded-xl flex items-center justify-between text-xs transition cursor-pointer ${
          isSelected ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 font-semibold' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`;
        item.innerHTML = `
          <div>
            <div class="font-medium">${preset.name}</div>
            <div class="text-[9px] text-slate-400 line-clamp-1">${preset.desc}</div>
          </div>
          <span class="w-4 h-4 rounded-full shrink-0 ml-2 border border-slate-600 shadow-inner" style="background-color: ${preset.color}"></span>
        `;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          setPaperPreset(preset.id);
          state.toolSettings.paperPreset = preset.id;
          renderViewport();
          this.paperMenuOpen = false;
          this.render();
          showToast(`Paper: ${preset.name}`);
        });
        pMenu.appendChild(item);
      });

      paperBtnWrap.appendChild(pMenu);
    }
    this.container.appendChild(paperBtnWrap);

    // Vertical divider
    const sep0 = document.createElement('div');
    sep0.className = 'w-px h-6 bg-slate-700/80 mx-1 shrink-0';
    this.container.appendChild(sep0);

    // =========================================================================
    // 3. PRIMARY & SECONDARY PICKER WITH DIRECT COLOR WHEEL INPUT
    // =========================================================================
    const primaryWrap = document.createElement('div');
    primaryWrap.className = 'relative w-8 h-8 shrink-0 flex items-center justify-center cursor-pointer';
    primaryWrap.title = 'Click to open Color Picker | Click ⇄ to swap (X)';

    const hiddenColorInput = document.createElement('input');
    hiddenColorInput.type = 'color';
    hiddenColorInput.value = state.toolSettings.color;
    hiddenColorInput.className = 'absolute inset-0 opacity-0 cursor-pointer w-full h-full z-20';
    hiddenColorInput.addEventListener('input', (e) => {
      state.toolSettings.color = e.target.value;
      if (elements.primaryColorPicker) elements.primaryColorPicker.value = e.target.value;
      this.updateActiveIndicators();
    });

    primaryWrap.innerHTML = `
      <div id="qp-primary-swatch" class="absolute top-0 left-0 w-5.5 h-5.5 rounded-lg border-2 border-white shadow-lg z-10 transition-transform hover:scale-105" style="background-color: ${state.toolSettings.color};"></div>
      <div id="qp-secondary-swatch" class="absolute bottom-0 right-0 w-4 h-4 rounded-md border border-slate-500 shadow-sm z-0" style="background-color: ${state.toolSettings.secondaryColor || '#ffffff'};"></div>
    `;
    primaryWrap.appendChild(hiddenColorInput);
    this.container.appendChild(primaryWrap);

    // Swap Button (⇄)
    const swapBtn = document.createElement('button');
    swapBtn.title = 'Swap Primary & Secondary (X)';
    swapBtn.className = 'px-1 text-xs font-mono text-slate-400 hover:text-orange-400 cursor-pointer transition';
    swapBtn.innerHTML = '⇄';
    swapBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      elements.btnSwapColors?.click();
      this.updateActiveIndicators();
    });
    this.container.appendChild(swapBtn);

    // Vertical divider
    const sep = document.createElement('div');
    sep.className = 'w-px h-6 bg-slate-700/80 mx-1 shrink-0';
    this.container.appendChild(sep);

    // =========================================================================
    // 4. CURATED 32px QUICK SWATCHES
    // =========================================================================
    const swatchesWrap = document.createElement('div');
    swatchesWrap.className = 'flex items-center gap-1.5 overflow-x-auto py-1 px-0.5 max-w-[280px] sm:max-w-[420px] scrollbar-none';

    this.swatches.forEach((colorHex, idx) => {
      const isSelected = (state.toolSettings.color || '').toLowerCase() === colorHex.toLowerCase();
      const btn = document.createElement('button');
      btn.dataset.swatchIdx = idx;
      btn.title = `[${idx + 1}] ${colorHex} — Click to switch, Right-click to delete`;
      
      btn.className = `relative w-7 h-7 rounded-xl border transition-all duration-150 shrink-0 cursor-pointer shadow-sm hover:scale-115 active:scale-95 ${
        isSelected 
          ? 'border-white ring-2 ring-orange-500 shadow-lg shadow-orange-500/30 scale-110 z-10' 
          : 'border-white/20 hover:border-white/60'
      }`;
      btn.style.backgroundColor = colorHex;

      if (idx < 9) {
        const numTag = document.createElement('span');
        numTag.className = 'absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-slate-900/90 border border-slate-700 text-slate-300 rounded-full text-[8px] font-mono font-bold flex items-center justify-center pointer-events-none';
        numTag.textContent = idx + 1;
        btn.appendChild(numTag);
      }

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectColorByIndex(idx);
      });

      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.swatches.length <= 3) {
          showToast('Keep at least 3 quick colors');
          return;
        }
        this.swatches.splice(idx, 1);
        this.saveSwatches();
        this.render();
        showToast('Color removed from Quick Palette');
      });

      swatchesWrap.appendChild(btn);
    });
    this.container.appendChild(swatchesWrap);

    // =========================================================================
    // 5. ADD COLOR (+) BUTTON
    // =========================================================================
    const addBtn = document.createElement('button');
    addBtn.title = 'Pin active color to Quick Palette (+)';
    addBtn.className = 'w-7 h-7 rounded-xl bg-slate-800/90 hover:bg-orange-500/25 border border-slate-700 hover:border-orange-500/60 text-slate-200 hover:text-orange-300 flex items-center justify-center text-sm font-bold transition-all shrink-0 ml-0.5 cursor-pointer shadow-sm';
    addBtn.innerHTML = '+';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = state.toolSettings.color;
      if (!this.swatches.some(c => c.toLowerCase() === cur.toLowerCase())) {
        this.swatches.push(cur);
        this.saveSwatches();
        this.render();
        showToast(`Pinned ${cur} to Quick Palette!`);
      } else {
        showToast('Color is already in your quick swatches');
      }
    });
    this.container.appendChild(addBtn);
  }

  updateActiveIndicators() {
    const primary = document.getElementById('qp-primary-swatch');
    const secondary = document.getElementById('qp-secondary-swatch');
    if (primary) primary.style.backgroundColor = state.toolSettings.color;
    if (secondary) secondary.style.backgroundColor = state.toolSettings.secondaryColor || '#ffffff';

    if (!this.container) return;
    const cur = (state.toolSettings.color || '').toLowerCase();

    this.container.querySelectorAll('[data-swatch-idx]').forEach(btn => {
      const idx = parseInt(btn.dataset.swatchIdx, 10);
      const isSelected = cur === this.swatches[idx]?.toLowerCase();

      btn.classList.toggle('border-white', isSelected);
      btn.classList.toggle('ring-2', isSelected);
      btn.classList.toggle('ring-orange-500', isSelected);
      btn.classList.toggle('shadow-lg', isSelected);
      btn.classList.toggle('scale-110', isSelected);
      btn.classList.toggle('border-white/20', !isSelected);
    });
  }
}

let quickPalInstance = null;
export function initQuickPalette() {
  if (!quickPalInstance) {
    quickPalInstance = new QuickPaletteManager();
  }
  return quickPalInstance;
}

export function refreshQuickPaletteUI() {
  quickPalInstance?.updateActiveIndicators();
}
