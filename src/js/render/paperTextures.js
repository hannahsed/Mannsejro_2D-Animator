// src/js/render/paperTextures.js
// Procedural artist paper and canvas surface engine

export const PAPER_PRESETS = [
  {
    id: 'watercolor',
    name: 'Cold Press Watercolor',
    color: '#fcfaf5',
    toothIntensity: 0.14,
    scale: 1.5,
    desc: 'Organic grain and natural paper tooth for watercolor and pencils.'
  },
  {
    id: 'sketchbook',
    name: 'Rough Sketchbook',
    color: '#faf7f0',
    toothIntensity: 0.18,
    scale: 1.0,
    desc: 'Textured cream paper that catches graphite and charcoal dust.'
  },
  {
    id: 'canvas',
    name: 'Linen Canvas',
    color: '#f7f4ee',
    toothIntensity: 0.16,
    scale: 2.0,
    desc: 'Subtle cross-weave canvas fabric for oil and acrylic paintings.'
  },
  {
    id: 'bristol',
    name: 'Smooth Bristol',
    color: '#ffffff',
    toothIntensity: 0.02,
    scale: 1.0,
    desc: 'Ultra-smooth clean white surface for crisp manga inking and pen lines.'
  },
  {
    id: 'kraft',
    name: 'Toned Kraft Paper',
    color: '#d9c29d',
    toothIntensity: 0.22,
    scale: 1.2,
    desc: 'Warm mid-tone craft tan paper that makes dark ink and white gouache pop.'
  },
  {
    id: 'slate',
    name: 'Dark Charcoal Slate',
    color: '#1a1e24',
    toothIntensity: 0.15,
    scale: 1.2,
    desc: 'Deep textured dark paper for high-contrast pastels and neon.'
  }
];

const patternCache = new Map();

/**
 * Procedurally generates a seamless seamless grain texture tile
 */
function createGrainTile(preset) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = preset.color;
  ctx.fillRect(0, 0, size, size);

  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;
  const intensity = preset.toothIntensity || 0.1;
  const isLinen = preset.id === 'canvas';

  // Seeded deterministic noise
  let seed = 12345;
  function rnd() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      let noise = (rnd() - 0.5) * 2; // -1 to 1

      if (isLinen) {
        // Cross-weave pattern
        const weaveX = Math.sin(x * 0.4) * 0.6;
        const weaveY = Math.cos(y * 0.4) * 0.6;
        noise = (noise * 0.5) + (weaveX * weaveY);
      } else if (preset.id === 'watercolor') {
        // Softer mottled fibers
        const fiber = Math.sin(x * 0.15 + y * 0.1) * Math.cos(x * 0.1 - y * 0.15);
        noise = noise * 0.7 + fiber * 0.5;
      }

      const delta = Math.round(noise * intensity * 128);

      data[idx]     = Math.max(0, Math.min(255, data[idx] + delta));
      data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + delta));
      data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + delta));
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

export function getPaperPattern(ctx, presetId = 'sketchbook') {
  const preset = PAPER_PRESETS.find(p => p.id === presetId) || PAPER_PRESETS[1];
  if (!patternCache.has(preset.id)) {
    const tile = createGrainTile(preset);
    const pattern = ctx.createPattern(tile, 'repeat');
    patternCache.set(preset.id, { pattern, preset });
  }
  return patternCache.get(preset.id);
}

export let currentPaperPresetId = 'sketchbook';
export let paperTextureEnabled = true;

export function setPaperPreset(id) {
  if (PAPER_PRESETS.some(p => p.id === id)) {
    currentPaperPresetId = id;
    try {
      localStorage.setItem('mannsejro_paper_preset', id);
    } catch (e) {}
  }
}

export function togglePaperTexture(enabled) {
  paperTextureEnabled = enabled !== undefined ? enabled : !paperTextureEnabled;
  try {
    localStorage.setItem('mannsejro_paper_texture_enabled', String(paperTextureEnabled));
  } catch (e) {}
}

export function initPaperSettings() {
  try {
    const saved = localStorage.getItem('mannsejro_paper_preset');
    if (saved && PAPER_PRESETS.some(p => p.id === saved)) {
      currentPaperPresetId = saved;
    }
    const savedEnabled = localStorage.getItem('mannsejro_paper_texture_enabled');
    if (savedEnabled !== null) {
      paperTextureEnabled = savedEnabled === 'true';
    }
  } catch (e) {}
}
