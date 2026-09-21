// src/js/state/appState.js
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 32;

export const SHAPE_TOOLS = new Set(['shape']);
export const INK_TOOLS = new Set(['pencil', 'vector-pen', 'graphite', 'soft-brush', 'smear', 'blur']);

// -------------------------------------------------------------
// 1. VECTOR SPACE TOOLS & PRESETS
// -------------------------------------------------------------
export const VECTOR_TOOLS = [
  { id: 'vector-pen', name: 'Vector Pen', icon: 'pen', hotkey: 'P', desc: 'Resolution-independent spline inking' },
  { id: 'shape', name: 'Perspective & Shapes', icon: 'shape', hotkey: 'U', desc: '2D Rect, Perspective Quad & 3D Box' },
  { id: 'vector-edit', name: 'Node Selector', icon: 'select', hotkey: 'A', desc: 'Select and manipulate vector curves' },
  { id: 'vector-fill', name: 'Vector Fill', icon: 'fill', hotkey: 'G', desc: 'Fill enclosed vector boundary' },
];

export const VECTOR_PRESETS = [
  {
    id: 'fine-strokes',
    name: 'Fine Strokes (Vector)',
    badge: 'Vector',
    desc: 'Resolution-independent spline strokes that never pixelate at any zoom level',
    defaultSpace: 'vector',
    size: 4,
    opacity: 1.0,
    taperStart: true,
    taperEnd: true,
    taperLength: 0.22,
    interpolationMode: 'both',
    smoothing: 0.60,
  },
  {
    id: 'precision-ink',
    name: 'Precision Inking',
    badge: 'Contour',
    desc: 'Watertight Bézier outline contours with graceful end flick',
    defaultSpace: 'vector',
    size: 3,
    opacity: 1.0,
    taperStart: false,
    taperEnd: true,
    taperLength: 0.18,
    interpolationMode: 'end',
    smoothing: 0.70,
  },
  {
    id: 'clean-lineart',
    name: 'Clean Lineart',
    badge: 'Dynamic',
    desc: 'Uniform line weight with responsive pressure curve',
    defaultSpace: 'vector',
    size: 2.5,
    opacity: 1.0,
    taperStart: false,
    taperEnd: false,
    taperLength: 0.15,
    interpolationMode: 'none',
    smoothing: 0.50,
  },
];

// Backwards compatibility aliases
export const DRAW_TOOL_PRESETS = VECTOR_PRESETS;

// -------------------------------------------------------------
// 2. PIXEL SPACE TOOLS & PRESETS
// -------------------------------------------------------------
export const PIXEL_TOOLS = [
  { id: 'graphite', name: 'Graphite Pencil', icon: 'pencil', hotkey: 'B', desc: 'Multi-grade lead with paper grain catch' },
  { id: 'pixel-shape', name: 'Raster Shapes & Lines', icon: 'shape', hotkey: 'U', desc: 'Bakes lines, rects & perspective directly to canvas tiles' },
  { id: 'soft-brush', name: 'Soft Airbrush', icon: 'brush', hotkey: 'S', desc: 'Velvety Gaussian diffusion shading' },
  { id: 'smear', name: 'Smudge / Smear', icon: 'smear', hotkey: 'R', desc: 'Finger-paint blend & wet pigment smudge' },
  { id: 'blur', name: 'Soften / Blur', icon: 'blur', hotkey: 'O', desc: 'Local box blur for soft transitions' },
  { id: 'pixel-fill', name: 'Smart Flood Fill', icon: 'bucket', hotkey: 'G', desc: 'Tile fill with morphological gap close' },
  { id: 'eraser', name: 'Raster Eraser', icon: 'eraser', hotkey: 'E', desc: 'Direct destination-out pixel removal' },
];

export const PIXEL_PRESETS = [
  {
    id: 'graphite',
    name: 'Graphite Lead',
    badge: '2B Lead',
    desc: 'Multi-grade authentic graphite lead with organic paper tooth catch',
    defaultSpace: 'pixel',
    size: 3,
    opacity: 0.85,
    pencilGrade: '2B',
    pencilTooth: 0.85,
    pencilTip: 'point',
    smoothing: 0.35,
  },
  {
    id: 'chisel-shading',
    name: 'Chisel Shading',
    badge: 'Broad Chisel',
    desc: 'Wide angled graphite lead for rapid planar shading and value blocking',
    defaultSpace: 'pixel',
    size: 8,
    opacity: 0.65,
    pencilGrade: '4B',
    pencilTooth: 0.75,
    pencilTip: 'broad',
    smoothing: 0.40,
  },
  {
    id: 'rough-grain',
    name: 'Rough Tooth Grain',
    badge: 'Heavy Grain',
    desc: 'Intensified paper tooth catch for organic sketches and charcoal texture',
    defaultSpace: 'pixel',
    size: 4,
    opacity: 0.90,
    pencilGrade: '6B',
    pencilTooth: 1.0,
    pencilTip: 'point',
    smoothing: 0.20,
  },
];

// Backwards compatibility aliases
export const TEXTURE_TOOL_PRESETS = PIXEL_PRESETS;
export const PENCIL_PRESETS = [...VECTOR_PRESETS, ...PIXEL_PRESETS];

export const PENCIL_GRADES = [
  { id: '2H', name: '2H Hard', desc: 'Light, crisp silvery tone' },
  { id: 'HB', name: 'HB Drafting', desc: 'Balanced sketching graphite' },
  { id: '2B', name: '2B Medium Soft', desc: 'Rich lead with natural tooth catch' },
  { id: '4B', name: '4B Soft Carbon', desc: 'Dark velvety graphite' },
  { id: '6B', name: '6B Matte Carbon', desc: 'Deep black carbon deposit' },
];

export const BLEND_MODES = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
];

export const COLOR_TAGS = [
  { id: null, label: 'None', hex: 'transparent' },
  { id: 'white', label: 'White', hex: '#ffffff' },
  { id: 'gray', label: 'Gray', hex: '#64748b' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
  { id: 'sky', label: 'Sky', hex: '#0ea5e9' },
  { id: 'orange', label: 'Orange', hex: '#f97316' },
  { id: 'deep-orange', label: 'Rust', hex: '#ea580c' },
];

export const state = {
  project: null,
  currentFrameIndex: 0,
  activeLayerId: null,
  isPlaying: false,
  loop: true,

  // PRIMARY ARCHITECTURAL SPLIT:
  engineMode: 'vector',         // 'vector' | 'pixel'
  currentTool: 'vector-pen',    // In Vector: 'vector-pen', 'shape', 'vector-fill'
                                // In Pixel:  'graphite', 'soft-brush', 'smear', 'blur', 'pixel-fill', 'eraser'

  soloMemory: null,

  toolSettings: {
    // Engine Alignment
    strokeSpace: 'vector',      // 'vector' (Splines) | 'pixel' (512px Tiles)
    
    // Vector Space Settings
    vectorPreset: 'fine-strokes',
    pencilPreset: 'fine-strokes',
    drawPreset: 'fine-strokes',
    interpolationMode: 'both',  // 'both' | 'start' | 'end' | 'none'
    taperStart: true,
    taperEnd: true,
    taperLength: 0.22,
    smoothing: 0.60,            // Streamline Tremor Filter (Default: 60%)
    stabilizerRope: 0.0,        // Inertial Rope Damper (0% - 100%)

    // Pixel Space Settings
    pixelPreset: 'graphite',
    texturePreset: 'graphite',
    pencilGrade: '2B',
    pencilTooth: 0.85,
    pencilTip: 'point',         // 'point' | 'broad'
    paperPreset: 'sketchbook',
    paperTexture: true,
    blurStrength: 0.50,
    smearStrength: 0.65,
    eraserSize: 24,
    fillTolerance: 32,
    fillCloseGap: 2,
    fillBleed: 2,

    // Shared Parameters
    size: 4,
    opacity: 1.0,
    pressure: true,
    pressureCurve: 0.8,
    color: '#1e293b',
    secondaryColor: '#ffffff',

    // Shape & Line Geometry Workflow
    shapeType: 'rectangle',    // 'line' | 'rectangle' | 'ellipse' | 'perspective'
    activeShapeType: 'rectangle',
    rectSubMode: 'perspective',
    rectMode: 'standard',      // 'standard' | 'perspective' | 'cube'
    shapeMode: 'both',         // 'stroke' | 'fill' | 'both'
    cornerRadius: 0,
    strokeDash: 'solid',       // 'solid' | 'dashed' | 'dotted'
    lineCap: 'round',          // 'round' | 'butt'
    cubeVisibility: 'shaded3',
    cubeExtrusion: 80,
    rectSubdivisions: 1,
    rectDiagonals: false,
    perspectiveImage: null,
    perspectiveImageName: null,
  },

  onionSkin: {
    enabled: true,
    prevFrames: 2,
    nextFrames: 1,
    prevColor: '#f97316',
    nextColor: '#3b82f6',
    opacity: 0.45,
    mode: 'tint',
  },
  loopIn: 0,
  loopOut: -1,
  zoom: 1,
  pan: { x: 0, y: 0 },
  isDrawing: false,
  isPanning: false,
  isSpacePressed: false,
  spacePanUsed: false,
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
  frameIndex: null,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  scale: 1,
  opacity: 0.4,
  color: '#3b82f6',
};

export function currentFrame() {
  if (!state.project || !state.project.frames) return null;
  return state.project.frames[state.currentFrameIndex] || state.project.frames[0];
}

export function hasFloatingSelection() {
  return false;
}

export function hasSelection() {
  return false;
}
