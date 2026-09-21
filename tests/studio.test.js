// tests/studio.test.js
import { describe, it, expect } from 'vitest';
import { simplifyStrokePoints } from '../src/js/geometry/strokeSimplifier.js';
import { evaluateProjectivePoint, computePerspectiveCenter } from '../src/js/viewport/perspectiveRectangleStudio.js';
import { hexToRgb, hexToRgba, rgbaToHex } from '../src/js/colorUtils.js';
import { CommandManager } from '../src/js/project/commandManager.js';

describe('Geometry: Stroke Simplifier (Ramer-Douglas-Peucker)', () => {
  it('preserves collinear endpoints while eliminating redundant points', () => {
    // 5 perfectly collinear points on a horizontal line
    const points = [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 25, y: 0, pressure: 0.5 },
      { x: 50, y: 0, pressure: 0.5 },
      { x: 75, y: 0, pressure: 0.5 },
      { x: 100, y: 0, pressure: 0.5 }
    ];

    const simplified = simplifyStrokePoints(points, 0.5);
    // Should reduce 5 points down to just start and end
    expect(simplified.length).toBe(2);
    expect(simplified[0].x).toBe(0);
    expect(simplified[1].x).toBe(100);
  });

  it('retains critical curve peaks above threshold', () => {
    // A distinct triangle apex
    const points = [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 50, y: 80, pressure: 0.5 },
      { x: 100, y: 0, pressure: 0.5 }
    ];

    const simplified = simplifyStrokePoints(points, 0.5);
    // Must keep all 3 points to preserve visual apex
    expect(simplified.length).toBe(3);
    expect(simplified[1].y).toBe(80);
  });

  it('handles small arrays with 0, 1, or 2 points gracefully', () => {
    expect(simplifyStrokePoints([])).toEqual([]);
    const single = [{ x: 10, y: 10, pressure: 1 }];
    expect(simplifyStrokePoints(single)).toEqual(single);
    const pair = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    expect(simplifyStrokePoints(pair)).toEqual(pair);
  });

  it('retains points where pen pressure changed significantly even on collinear lines', () => {
    const points = [
      { x: 0, y: 0, pressure: 0.1 },
      { x: 50, y: 0, pressure: 0.95 }, // Sharp pressure spike
      { x: 100, y: 0, pressure: 0.1 }
    ];
    const simplified = simplifyStrokePoints(points, 0.5);
    // Pressure spike should be preserved
    expect(simplified.length).toBe(3);
    expect(simplified[1].pressure).toBe(0.95);
  });

  it('strips high-frequency micro-jitter within tolerance epsilon', () => {
    const points = [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 20, y: 0.1, pressure: 0.5 },
      { x: 40, y: -0.1, pressure: 0.5 },
      { x: 60, y: 0.15, pressure: 0.5 },
      { x: 80, y: -0.05, pressure: 0.5 },
      { x: 100, y: 0, pressure: 0.5 }
    ];
    const simplified = simplifyStrokePoints(points, 1.0);
    expect(simplified.length).toBe(2);
  });
});

describe('Projective Geometry: Perspective Interpolation', () => {
  const nodes = [
    { x: 0, y: 0 },     // Top-Left
    { x: 100, y: 0 },   // Top-Right
    { x: 150, y: 100 }, // Bottom-Right (trapezoid flare)
    { x: -50, y: 100 }  // Bottom-Left
  ];

  it('correctly maps normalized (0,0) and (1,1) UV boundaries', () => {
    const tl = evaluateProjectivePoint(nodes, 0, 0);
    expect(tl.x).toBeCloseTo(0);
    expect(tl.y).toBeCloseTo(0);

    const br = evaluateProjectivePoint(nodes, 1, 1);
    expect(br.x).toBeCloseTo(150);
    expect(br.y).toBeCloseTo(100);
  });

  it('computes true perspective center at diagonal intersection', () => {
    const center = computePerspectiveCenter(nodes);
    // Intersection of (0,0)->(150,100) and (100,0)->(-50,100)
    expect(center.x).toBeCloseTo(50);
    expect(center.y).toBeCloseTo(33.33, 1);
  });

  it('correctly maps normalized (1,0) and (0,1) opposing corners', () => {
    const tr = evaluateProjectivePoint(nodes, 1, 0);
    expect(tr.x).toBeCloseTo(100);
    expect(tr.y).toBeCloseTo(0);

    const bl = evaluateProjectivePoint(nodes, 0, 1);
    expect(bl.x).toBeCloseTo(-50);
    expect(bl.y).toBeCloseTo(100);
  });

  it('returns safe fallback for degenerate or null node sets', () => {
    expect(evaluateProjectivePoint(null, 0.5, 0.5)).toEqual({ x: 0, y: 0 });
    expect(computePerspectiveCenter([])).toEqual({ x: 0, y: 0 });
  });
});

describe('Color Math: Conversion & Alpha Parsing', () => {
  it('accurately parses 6-digit hex strings into RGB', () => {
    const rgb = hexToRgb('#f97316'); // Brand Flame Orange
    expect(rgb.r).toBe(249);
    expect(rgb.g).toBe(115);
    expect(rgb.b).toBe(22);
  });

  it('formats RGBA strings with fractional alpha', () => {
    const rgba = hexToRgba('#ffffff', 0.5);
    expect(rgba).toBe('rgba(255, 255, 255, 0.5)');
  });

  it('accurately parses 3-digit shorthand hex strings', () => {
    const rgb = hexToRgb('#0cf');
    expect(rgb.r).toBe(0);
    expect(rgb.g).toBe(204);
    expect(rgb.b).toBe(255);
  });

  it('converts RGB triplet back to valid hex format', () => {
    const hex = rgbaToHex(249, 115, 22);
    expect(hex.toLowerCase()).toBe('#f97316');
  });
});

describe('Command Pattern: Undo, Redo & Stack Lifecycle', () => {
  class MockCommand {
    constructor(val, tracker) {
      this.val = val;
      this.tracker = tracker;
      this.disposed = false;
    }
    execute() {
      this.tracker.value += this.val;
    }
    undo() {
      this.tracker.value -= this.val;
    }
    redo() {
      this.tracker.value += this.val;
    }
    dispose() {
      this.disposed = true;
    }
  }

  it('executes commands and updates state value', async () => {
    const tracker = { value: 0 };
    const cm = new CommandManager(10);
    const cmd = new MockCommand(10, tracker);

    await cm.execute(cmd);
    expect(tracker.value).toBe(10);
    expect(cm.undoStack.length).toBe(1);
    expect(cm.redoStack.length).toBe(0);
  });

  it('correctly reverts changes on undo', async () => {
    const tracker = { value: 0 };
    const cm = new CommandManager(10);
    await cm.execute(new MockCommand(5, tracker));
    await cm.execute(new MockCommand(15, tracker));
    expect(tracker.value).toBe(20);

    await cm.undo();
    expect(tracker.value).toBe(5);
    expect(cm.undoStack.length).toBe(1);
    expect(cm.redoStack.length).toBe(1);
  });

  it('re-applies changes on redo', async () => {
    const tracker = { value: 0 };
    const cm = new CommandManager(10);
    await cm.execute(new MockCommand(7, tracker));
    await cm.undo();
    expect(tracker.value).toBe(0);

    await cm.redo();
    expect(tracker.value).toBe(7);
    expect(cm.undoStack.length).toBe(1);
    expect(cm.redoStack.length).toBe(0);
  });

  it('clears redo stack when a new command is executed after an undo', async () => {
    const tracker = { value: 0 };
    const cm = new CommandManager(10);
    await cm.execute(new MockCommand(10, tracker));
    await cm.undo();
    expect(cm.redoStack.length).toBe(1);

    await cm.execute(new MockCommand(25, tracker));
    expect(cm.redoStack.length).toBe(0);
    expect(tracker.value).toBe(25);
  });

  it('enforces maximum stack depth and disposes evicted commands', async () => {
    const tracker = { value: 0 };
    const cm = new CommandManager(3); // Small capacity of 3
    const first = new MockCommand(1, tracker);

    await cm.execute(first);
    await cm.execute(new MockCommand(2, tracker));
    await cm.execute(new MockCommand(3, tracker));
    expect(cm.undoStack.length).toBe(3);
    expect(first.disposed).toBe(false);

    // 4th command should evict and dispose the first
    await cm.execute(new MockCommand(4, tracker));
    expect(cm.undoStack.length).toBe(3);
    expect(first.disposed).toBe(true);
  });
});

describe('Project Integrity & Persistence Validation', () => {
  it('validates project structural soundness', async () => {
    const { isProjectStructurallySound } = await import('../src/js/persistence.js');
    expect(isProjectStructurallySound(null)).toBe(false);
    expect(isProjectStructurallySound({})).toBe(false);
    expect(isProjectStructurallySound({ width: 1920, height: 1080 })).toBe(false);

    const validProj = {
      id: 'proj_test',
      name: 'Valid Animation',
      width: 1920,
      height: 1080,
      fps: 24,
      layers: [{ id: 'layer_1', name: 'Ink' }],
      frames: [{ id: 'f1', duration: 1, layerData: { layer_1: { tiles: {}, strokes: [] } } }]
    };
    expect(isProjectStructurallySound(validProj)).toBe(true);
  });

  it('generates pristine blank project templates with unique IDs', async () => {
    const { createBlankProject } = await import('../src/js/templates.js');
    const p1 = createBlankProject('Hero_Walk', 1920, 1080, 24);
    const p2 = createBlankProject('Hero_Run', 1280, 720, 12);

    expect(p1.id).toBeDefined();
    expect(p2.id).toBeDefined();
    expect(p1.name).toBe('Hero_Walk');
    expect(p1.width).toBe(1920);
    expect(p1.height).toBe(1080);
    expect(p1.fps).toBe(24);
    expect(p1.frames.length).toBe(1);
    expect(p1.layers.length).toBeGreaterThanOrEqual(1);
  });

  it('cloneProjectFast produces an immutable deep snapshot of stroke and layer states', async () => {
    const { cloneProjectFast } = await import('../src/js/persistence.js');
    const original = {
      id: 'proj_stroke_test',
      name: 'Stroke Snapshot Test',
      width: 1920,
      height: 1080,
      fps: 24,
      layers: [
        { id: 'layer_1', name: 'Ink Layer', opacity: 1, visible: true }
      ],
      frames: [
        {
          id: 'frame_1',
          duration: 1,
          layerData: {
            layer_1: {
              tiles: { '0,0': 'data:image/png;base64,sampleTileData' },
              strokes: [{ id: 's1', points: [{ x: 10, y: 10, pressure: 0.8 }, { x: 20, y: 20, pressure: 0.9 }] }]
            }
          }
        }
      ]
    };

    const snapshot = cloneProjectFast(original);
    expect(snapshot).toEqual(original);
    expect(snapshot).not.toBe(original);

    // Mutating original (e.g. user draws another stroke or deletes a layer)
    original.layers[0].opacity = 0.5;
    original.frames[0].layerData.layer_1.strokes.push({ id: 's2', points: [] });

    // Snapshot MUST remain unchanged, guaranteeing thread-safe background serialization
    expect(snapshot.layers[0].opacity).toBe(1);
    expect(snapshot.frames[0].layerData.layer_1.strokes.length).toBe(1);
  });
});

