// src/js/state/appState.js
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 32;

export const SHAPE_TOOLS = new Set(['shape']);
export const INK_TOOLS = new Set(['draw', 'pencil', 'brush', 'pen', 'marker', 'eraser', 'lassofill']);

export const SHAPE_PRESETS = [
  {
    id: 'rectangle',
    name: 'Rectangle',
    badge: 'Box',
    desc: 'Sharp architectural bounding box & framing.',
    icon: '<rect x="3" y="3" width="18" height="18" rx="1" stroke-width="2" />',
  },
  {
    id: 'rounded-rect',
    name: 'Rounded Card',
    badge: 'UI',
    desc: 'Smooth corner rectangle for panels and buttons.',
    icon: '<rect x="3" y="3" width="18" height="18" rx="5" stroke-width="2" />',
  },
  {
    id: 'ellipse',
    name: 'Circle / Ellipse',
    badge: 'Round',
    desc: 'Smooth circular forms and animation squash balls.',
    icon: '<circle cx="12" cy="12" r="9" stroke-width="2" />',
  },
  {
    id: 'line',
    name: 'Straight Ruler',
    badge: 'Line',
    desc: 'Crisp line with angle snapping (Hold Shift for 45°).',
    icon: '<line x1="4" y1="20" x2="20" y2="4" stroke-width="2" stroke-linecap="round" />',
  },
  {
    id: 'arrow',
    name: 'Motion Arrow',
    badge: 'Arc',
    desc: 'Animation anticipation vector & motion path guide.',
    icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />',
  },
  {
    id: 'polygon',
    name: 'Triangle / Polygon',
    badge: 'Poly',
    desc: 'Regular polygon with customizable side counts.',
    icon: '<polygon points="12 3 21 19 3 19" stroke-width="2" stroke-linejoin="round" />',
  },
  {
    id: 'star',
    name: 'Impact Burst / Star',
    badge: 'FX',
    desc: 'Action impact spark and anime explosion flare.',
    icon: '<polygon points="12 2 15 8.5 22 9.3 17 14 18.5 21 12 17.5 5.5 21 7 14 2 9.3 9 8.5 12 2" stroke-width="2" stroke-linejoin="round" />',
  },
];

export const DRAW_PRESETS = [
  {
    id: 'studio-ink',
    name: 'Studio Inker',
    badge: 'Pro',
    desc: 'Clean, balanced inking with natural taper and silky stabilization.',
    size: 5,
    opacity: 1,
    smoothing: 0.65,
    taperStart: true,
    taperEnd: true,
    taperLength: 0.25,
    pressure: true,
    composite: 'source-over',
  },
  {
    id: 'tapered-fineliner',
    name: 'Tapered Fineliner',
    badge: 'Anime',
    desc: 'Sharp needle-point ends for fast manga lineart and clean contour inbetweens.',
    size: 3,
    opacity: 1,
    smoothing: 0.5,
    taperStart: true,
    taperEnd: true,
    taperLength: 0.4,
    pressure: true,
    composite: 'source-over',
  },
  {
    id: 'rough-pencil',
    name: 'Rough Pencil',
    badge: 'Sketch',
    desc: 'Light, responsive rough layout pencil with subtle softness and quick response.',
    size: 4,
    opacity: 0.75,
    smoothing: 0.2,
    taperStart: true,
    taperEnd: false,
    taperLength: 0.15,
    pressure: true,
    composite: 'source-over',
  },
  {
    id: 'dynamic-calligraphy',
    name: 'Dynamic Brush Pen',
    badge: 'Thick/Thin',
    desc: 'Dramatic weight variation driven by stroke speed and tablet pressure.',
    size: 10,
    opacity: 1,
    smoothing: 0.6,
    taperStart: true,
    taperEnd: true,
    taperLength: 0.35,
    pressure: true,
    composite: 'source-over',
  },
  {
    id: 'cel-marker',
    name: 'Cel Shading Marker',
    badge: 'Cel',
    desc: 'Semi-transparent multiply wash for cel shadows, highlights, and blocking.',
    size: 14,
    opacity: 0.65,
    smoothing: 0.3,
    taperStart: false,
    taperEnd: false,
    taperLength: 0,
    pressure: false,
    composite: 'multiply',
  },
  {
    id: 'lazy-streamline',
    name: 'Lazy Rope Streamline',
    badge: 'Steady',
    desc: 'Maximum curve stabilization for drawing perfect arcs and circles with zero jitter.',
    size: 6,
    opacity: 1,
    smoothing: 0.9,
    taperStart: true,
    taperEnd: true,
    taperLength: 0.3,
    pressure: true,
    composite: 'source-over',
  },
  {
    id: 'freehand-sketch',
    name: 'Raw Freehand',
    badge: 'Raw',
    desc: 'Zero artificial smoothing. 1:1 instantaneous response for gestural posing.',
    size: 4,
    opacity: 1,
    smoothing: 0,
    taperStart: false,
    taperEnd: false,
    taperLength: 0,
    pressure: false,
    composite: 'source-over',
  },
];

export const BLEND_MODES = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn', label: 'Color Burn' },
  { value: 'hard-light', label: 'Hard Light' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
];

export const COLOR_TAGS = [
  { id: null, label: 'None', hex: 'transparent' },
  { id: 'red', label: 'Red', hex: '#ef4444' },
  { id: 'orange', label: 'Orange', hex: '#f97316' },
  { id: 'amber', label: 'Amber', hex: '#f59e0b' },
  { id: 'green', label: 'Green', hex: '#10b981' },
  { id: 'cyan', label: 'Cyan', hex: '#06b6d4' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
  { id: 'purple', label: 'Purple', hex: '#a855f7' },
  { id: 'pink', label: 'Pink', hex: '#ec4899' },
];

export const state = {
  project: null,
  currentFrameIndex: 0,
  activeLayerId: null,
  isPlaying: false,
  loop: true,
  currentTool: 'draw',

  // Layer Solo visibility memory { [layerId]: previousVisibleState }
  soloMemory: null,

  toolSettings: {
    // Shape presets
    shapePreset: 'rectangle',
    shapeMode: 'stroke', // 'stroke' | 'fill' | 'both'
    cornerRadius: 12,
    polygonSides: 3,
    strokeDash: 'solid', // 'solid' | 'dashed' | 'dotted'
    // Draw / General
    preset: 'studio-ink',
    size: 5,
    opacity: 1,
    smoothing: 0.5,
    assistantStabilizer: true,
    assistantWeight: 0.65,
    leashRadius: 18,
    showLeashGuide: true,
    taperStart: true,
    taperEnd: true,
    taperLength: 0.25,
    pressure: true,
    composite: 'source-over',
    fillStyleMode: 'precision',
    fillMoatWidth: 4,
    fillTolerance: 32,
    fillCloseGap: 3,
    fillBleed: 2,
    fillSampleMode: 'all',
    shapeFilled: false,
    color: '#3b82f6',
    secondaryColor: '#000000',
    eraserSize: 24,
    fontSize: 32,
  },

  onionSkin: {
    enabled: true,
    prevFrames: 2,
    nextFrames: 1,
    prevColor: '#ef4444',
    nextColor: '#10b981',
    opacity: 0.45,
    mode: 'tint',
  },

  loopIn: 0,
  loopOut: -1,

  // Viewport
  zoom: 1,
  pan: { x: 0, y: 0 },

  // Selection
  isDrawing: false,
  isSelecting: false,
  selectStart: null,
  selectionMarquee: null,
  floatingSelection: null,

  isPanning: false,
  isSpacePressed: false,
  spacePanUsed: false,
  tempEyedropper: false,

  dragStartPoint: null,
  lastPointerWorld: null,
  strokePoints: [],

  historyStack: [],
  historyIndex: -1,
  showGrid: false,
  flipH: false,
  shiftPressed: false,
};

export const playbackTimer = { id: null };
export const renderTokenState = { token: 0 };
export const renderScheduledState = { scheduled: false };

export const shiftTraceState = {
  active: false,
  frameIndex: null, // target frame to shift & trace (defaults to previous frame if null)
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  scale: 1,
  opacity: 0.4,
  color: '#3b82f6', // 40% blue tint
};

export function currentFrame() {
  if (!state.project || !state.project.frames) return null;
  return state.project.frames[state.currentFrameIndex] || state.project.frames[0];
}

export function hasFloatingSelection() {
  return Boolean(state.floatingSelection && state.floatingSelection.canvas);
}

export function hasSelection() {
  return hasFloatingSelection() || Boolean(state.selectionMarquee && state.selectionMarquee.w >= 1 && state.selectionMarquee.h >= 1);
}
