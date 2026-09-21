// src/js/render/propsLibrary.js
/**
 * PROCEDURAL ART PROPS & NATURE ENGINE
 * - Sky: Sun, Moon, Stars (Scatter-paint), Clouds, Lightning path.
 * - Vegetation: Grass (Brush scatter), Bushes, Flowers, Trees, Moss.
 * - Terrain: Rocks, Mountains, River paths.
 * - Available in both Vector Space (spline objects) and Pixel Space (tile baking).
 */
export const NATURE_PROPS = {
  sky: [
    { id: 'sun', name: 'Sun', icon: '☀️', type: 'stamp' },
    { id: 'moon', name: 'Crescent Moon', icon: '🌙', type: 'stamp' },
    { id: 'stars', name: 'Starfield Scatter', icon: '✨', type: 'scatter' },
    { id: 'cloud', name: 'Fluffy Cloud', icon: '☁️', type: 'stamp' },
    { id: 'lightning', name: 'Lightning Bolt', icon: '⚡', type: 'path' },
  ],
  flora: [
    { id: 'grass', name: 'Grass Field Scatter', icon: '🌱', type: 'scatter' },
    { id: 'bush', name: 'Lush Bush Cluster', icon: '🌳', type: 'scatter' },
    { id: 'flower', name: 'Wildflower', icon: '🌸', type: 'stamp' },
    { id: 'tree', name: 'Pine Tree', icon: '🌲', type: 'stamp' },
    { id: 'moss', name: 'Moss Texture', icon: '🌿', type: 'scatter' },
  ],
  terrain: [
    { id: 'rock', name: 'Boulder Rock', icon: '🪨', type: 'stamp' },
    { id: 'mountain', name: 'Mountain Ridge', icon: '⛰️', type: 'stamp' },
    { id: 'river', name: 'Winding River', icon: '🌊', type: 'path' },
  ]
};

/**
 * Draws a scatter-drag element (e.g. Grass or Stars) along a stroke trajectory
 */
export function paintScatterProp(ctx, propId, points, color = '#22c55e', size = 16) {
  if (!points || points.length === 0) return;
  ctx.save();

  if (propId === 'grass') {
    ctx.strokeStyle = color || '#22c55e';
    ctx.lineWidth = Math.max(1, size * 0.12);
    ctx.lineCap = 'round';
    for (const pt of points) {
      // Procedural grass tuft (3 blades)
      const h = size * (0.8 + Math.random() * 0.4);
      for (let blade = -1; blade <= 1; blade++) {
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.quadraticCurveTo(
          pt.x + blade * 6, pt.y - h * 0.6,
          pt.x + blade * 10 + (Math.random() - 0.5) * 4, pt.y - h
        );
        ctx.stroke();
      }
    }
  } else if (propId === 'stars') {
    ctx.fillStyle = color || '#fef08a';
    for (const pt of points) {
      const r = (size * 0.25) * (0.5 + Math.random() * 0.5);
      ctx.beginPath();
      ctx.arc(pt.x + (Math.random() - 0.5) * 12, pt.y + (Math.random() - 0.5) * 12, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (propId === 'bush') {
    ctx.fillStyle = color || '#15803d';
    for (const pt of points) {
      const r = size * (0.6 + Math.random() * 0.4);
      ctx.beginPath();
      ctx.arc(pt.x + (Math.random() - 0.5) * 8, pt.y + (Math.random() - 0.5) * 8, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (propId === 'moss') {
    ctx.fillStyle = color || '#4ade80';
    for (const pt of points) {
      for (let k = 0; k < 4; k++) {
        ctx.fillRect(pt.x + (Math.random() - 0.5) * 10, pt.y + (Math.random() - 0.5) * 10, 2, 2);
      }
    }
  }

  ctx.restore();
}

/**
 * Draws a stamp prop at center point
 */
export function paintStampProp(ctx, propId, centerPt, color = '#f97316', size = 32) {
  if (!centerPt) return;
  ctx.save();
  ctx.translate(centerPt.x, centerPt.y);

  if (propId === 'sun') {
    ctx.fillStyle = color || '#f59e0b';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Sun rays
    ctx.strokeStyle = color || '#f59e0b';
    ctx.lineWidth = Math.max(1.5, size * 0.08);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (size * 0.6), Math.sin(a) * (size * 0.6));
      ctx.lineTo(Math.cos(a) * (size * 0.85), Math.sin(a) * (size * 0.85));
      ctx.stroke();
    }
  } else if (propId === 'moon') {
    ctx.fillStyle = color || '#e0f2fe';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(size * 0.22, -size * 0.1, size * 0.45, 0, Math.PI * 2);
    ctx.fill();
  } else if (propId === 'cloud') {
    ctx.fillStyle = color || '#f8fafc';
    ctx.beginPath();
    ctx.arc(-size * 0.3, 0, size * 0.25, 0, Math.PI * 2);
    ctx.arc(0, -size * 0.15, size * 0.35, 0, Math.PI * 2);
    ctx.arc(size * 0.3, 0, size * 0.25, 0, Math.PI * 2);
    ctx.fill();
  } else if (propId === 'tree') {
    // Trunk
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-size * 0.08, 0, size * 0.16, size * 0.5);
    // Pine layers
    ctx.fillStyle = color || '#15803d';
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.6);
    ctx.lineTo(size * 0.35, -size * 0.15);
    ctx.lineTo(-size * 0.35, -size * 0.15);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, -size * 0.3);
    ctx.lineTo(size * 0.45, size * 0.15);
    ctx.lineTo(-size * 0.45, size * 0.15);
    ctx.closePath();
    ctx.fill();
  } else if (propId === 'rock') {
    ctx.fillStyle = color || '#64748b';
    ctx.beginPath();
    ctx.moveTo(-size * 0.4, size * 0.3);
    ctx.lineTo(-size * 0.3, -size * 0.2);
    ctx.lineTo(size * 0.2, -size * 0.35);
    ctx.lineTo(size * 0.45, size * 0.1);
    ctx.lineTo(size * 0.35, size * 0.3);
    ctx.closePath();
    ctx.fill();
  } else if (propId === 'mountain') {
    ctx.fillStyle = color || '#475569';
    ctx.beginPath();
    ctx.moveTo(-size * 0.6, size * 0.4);
    ctx.lineTo(0, -size * 0.5);
    ctx.lineTo(size * 0.6, size * 0.4);
    ctx.closePath();
    ctx.fill();
    // Snow cap
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.5);
    ctx.lineTo(size * 0.2, -size * 0.18);
    ctx.lineTo(-size * 0.2, -size * 0.18);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Flattened registry for UI inspector list
 */
export const PROPS_REGISTRY = [
  { id: 'sun', name: 'Sun', icon: '☀️', category: 'sky', type: 'stamp' },
  { id: 'moon', name: 'Crescent Moon', icon: '🌙', category: 'sky', type: 'stamp' },
  { id: 'stars', name: 'Starfield Scatter', icon: '✨', category: 'sky', type: 'scatter' },
  { id: 'cloud', name: 'Fluffy Cloud', icon: '☁️', category: 'sky', type: 'stamp' },
  { id: 'grass', name: 'Grass Tuft Scatter', icon: '🌱', category: 'flora', type: 'scatter' },
  { id: 'bush', name: 'Lush Bush Cluster', icon: '🌳', category: 'flora', type: 'scatter' },
  { id: 'flower', name: 'Wildflower', icon: '🌸', category: 'flora', type: 'stamp' },
  { id: 'tree', name: 'Pine Tree', icon: '🌲', category: 'flora', type: 'stamp' },
  { id: 'moss', name: 'Moss Texture', icon: '🌿', category: 'flora', type: 'scatter' },
  { id: 'rock', name: 'Boulder Rock', icon: '🪨', category: 'terrain', type: 'stamp' },
  { id: 'mountain', name: 'Mountain Ridge', icon: '⛰️', category: 'terrain', type: 'stamp' },
];

/**
 * Stamps a prop directly at the center of the active project canvas
 */
export function stampPropAtCenter(propId) {
  import('../state/appState.js').then(({ state, currentFrame }) => {
    import('../project/commandManager.js').then(({ commandManager, AddStrokeCommand }) => {
      import('../render/renderEngine.js').then(({ requestRender }) => {
        const frame = currentFrame();
        if (!frame) return;
        const centerX = (state.project?.width || 1920) / 2;
        const centerY = (state.project?.height || 1080) / 2;

        const stroke = {
          id: `prop_${Date.now()}`,
          isStampProp: true,
          propId: propId || 'tree',
          center: { x: centerX, y: centerY },
          points: [{ x: centerX, y: centerY }],
          settings: {
            color: state.toolSettings?.color || '#22c55e',
            size: state.toolSettings?.size || 64,
          },
          tool: 'props',
        };

        const cmd = new AddStrokeCommand(frame.id, state.activeLayerId, stroke);
        commandManager.execute(cmd);
        requestRender();
      });
    });
  });
}

/**
 * Scatters a prop across an area
 */
export function scatterPropAcrossArea(propId, points) {
  import('../state/appState.js').then(({ state, currentFrame }) => {
    import('../project/commandManager.js').then(({ commandManager, AddStrokeCommand }) => {
      import('../render/renderEngine.js').then(({ requestRender }) => {
        const frame = currentFrame();
        if (!frame) return;

        const stroke = {
          id: `prop_scatter_${Date.now()}`,
          isScatterProp: true,
          propId: propId || 'grass',
          points: points || [],
          settings: {
            color: state.toolSettings?.color || '#22c55e',
            size: state.toolSettings?.size || 24,
          },
          tool: 'props',
        };

        const cmd = new AddStrokeCommand(frame.id, state.activeLayerId, stroke);
        commandManager.execute(cmd);
        requestRender();
      });
    });
  });
}
