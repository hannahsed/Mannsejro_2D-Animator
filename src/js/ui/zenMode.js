// src/js/ui/zenMode.js
import { elements } from '../state/domElements.js';
import { requestRender } from '../render/renderEngine.js';
import { showToast } from './toast.js';

let isZenMode = false;
let zenPillEl = null;

export function setupZenMode() {
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      toggleZenMode();
    }
  });
}

export function toggleZenMode() {
  isZenMode = !isZenMode;

  const header = document.getElementById('studio-header');
  const toolbar = document.getElementById('studio-toolbar');
  const sidepanel = document.getElementById('studio-sidepanel');
  const timeline = document.getElementById('studio-timeline');

  const els = [header, toolbar, sidepanel, timeline];

  els.forEach((el) => {
    if (!el) return;
    el.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease';
  });

  if (isZenMode) {
    if (header) header.style.transform = 'translateY(-100%)';
    if (toolbar) toolbar.style.transform = 'translateX(-100%)';
    if (sidepanel) sidepanel.style.transform = 'translateX(100%)';
    if (timeline) timeline.style.transform = 'translateY(100%)';

    showZenFloatingPill();
    showToast('Zen Focus Mode (Press Tab to exit)', 'info');
  } else {
    els.forEach((el) => {
      if (el) el.style.transform = '';
    });
    hideZenFloatingPill();
  }

  setTimeout(() => requestRender(), 260);
}

function showZenFloatingPill() {
  if (!zenPillEl) {
    zenPillEl = document.createElement('div');
    zenPillEl.className =
      'fixed top-3 left-1/2 -translate-x-1/2 z-[100] px-3 py-1 bg-zinc-900/80 backdrop-blur-md border border-zinc-700/80 rounded-full text-[11px] font-mono text-zinc-300 shadow-2xl flex items-center gap-3 select-none pointer-events-auto';
    zenPillEl.innerHTML = `
      <span class="flex items-center gap-1.5 text-indigo-400 font-bold">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]"></span> ZEN
      </span>
      <span class="text-zinc-500">|</span>
      <span>Press <kbd class="px-1 py-0.5 bg-zinc-800 rounded font-bold text-white">Tab</kbd> to exit</span>
    `;
    document.body.appendChild(zenPillEl);
  }
  zenPillEl.classList.remove('hidden');
}

function hideZenFloatingPill() {
  if (zenPillEl) zenPillEl.classList.add('hidden');
}
