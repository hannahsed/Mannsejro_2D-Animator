// src/js/state/domElements.js
export const elements = {
  // Header
  projectNameInput: document.getElementById('project-name-input'),
  headerResBadge: document.getElementById('header-resolution-badge'),
  headerFpsBadge: document.getElementById('header-fps-badge'),
  autosaveDot: document.getElementById('autosave-dot'),
  autosaveText: document.getElementById('autosave-text'),
  btnSaveProject: document.getElementById('btn-save-project'),
  openProjectFileInput: document.getElementById('open-project-file-input'),

  // Header Canvas Tools
  btnUndo: document.getElementById('btn-undo'),
  btnRedo: document.getElementById('btn-redo'),
  btnZoomOut: document.getElementById('btn-zoom-out'),
  btnZoomIn: document.getElementById('btn-zoom-in'),
  btnResetZoom: document.getElementById('btn-reset-zoom'),
  btnFitScreen: document.getElementById('btn-fit-screen'),
  zoomText: document.getElementById('zoom-percentage-text'),
  btnToggleGrid: document.getElementById('btn-toggle-grid'),
  btnFlipH: document.getElementById('btn-flip-h'),
  btnOpenTemplates: document.getElementById('btn-open-templates'),
  btnOpenShortcuts: document.getElementById('btn-open-shortcuts'),
  btnOpenExport: document.getElementById('btn-open-export'),

  // Canvas Stage & Overlays
  canvasContainer: document.getElementById('studio-canvas-container'),
  viewportCanvas: document.getElementById('viewport-canvas'),
  strokeCanvas: document.getElementById('stroke-canvas'),
  cameraOverlay: document.getElementById('camera-overlay'),
  cameraBorder: document.getElementById('camera-border'),
  camLockIcon: document.getElementById('cam-lock-icon'),
  selectionSvg: document.getElementById('selection-svg'),
  selectionRect: document.getElementById('selection-rect'),
  floatingSelectionOverlay: document.getElementById('floating-selection-overlay'),
  refOverlaysContainer: document.getElementById('reference-overlays-container'),
  brushCursor: document.getElementById('brush-cursor-indicator'),

  // Status Bar
  statusCoords: document.getElementById('status-coords'),
  statusZoom: document.getElementById('status-zoom'),
  statusTimecode: document.getElementById('status-timecode'),
  statusLayer: document.getElementById('status-layer'),
  statusCanvasSize: document.getElementById('status-canvas-size'),

  // Color Swatches
  primaryColorPicker: document.getElementById('primary-color-picker'),
  secondaryColorPicker: document.getElementById('secondary-color-picker'),
  btnSwapColors: document.getElementById('btn-swap-colors'),

  // Tool Settings Panel
  toolPanelIcon: document.getElementById('tool-panel-icon'),
  toolPanelName: document.getElementById('tool-panel-name'),
  toolPanelDesc: document.getElementById('tool-panel-desc'),
  sizeLabelText: document.getElementById('size-label-text'),
  settingRowSize: document.getElementById('setting-row-size'),
  settingRowOpacity: document.getElementById('setting-row-opacity'),
  settingRowEraser: document.getElementById('setting-row-eraser'),
  settingRowTolerance: document.getElementById('setting-row-tolerance'),
  settingRowShapeFilled: document.getElementById('setting-row-shapefilled'),
  settingRowEmpty: document.getElementById('setting-row-empty'),

  sliderBrushSize: document.getElementById('slider-brush-size'),
  brushSizeVal: document.getElementById('brush-size-val'),
  sliderBrushOpacity: document.getElementById('slider-brush-opacity'),
  brushOpacityVal: document.getElementById('brush-opacity-val'),
  sliderEraserSize: document.getElementById('slider-eraser-size'),
  eraserSizeVal: document.getElementById('eraser-size-val'),
  sliderFillTolerance: document.getElementById('slider-fill-tolerance'),
  fillToleranceVal: document.getElementById('fill-tolerance-val'),
  toggleShapeFilled: document.getElementById('toggle-shape-filled'),

  // Layers Stack
  layersListContainer: document.getElementById('layers-list-container'),
  btnAddLayer: document.getElementById('btn-add-layer'),
  btnDuplicateLayer: document.getElementById('btn-duplicate-layer'),
  btnMergeLayer: document.getElementById('btn-merge-layer'),
  btnDeleteLayer: document.getElementById('btn-delete-layer'),
  sliderLayerOpacity: document.getElementById('slider-layer-opacity'),
  layerOpacityVal: document.getElementById('layer-opacity-val'),
  selectLayerBlend: document.getElementById('select-layer-blend'),

  // References
  refFileInput: document.getElementById('ref-file-input'),
  btnAddWalkGuide: document.getElementById('btn-add-walk-guide'),
  btnAddArcsGuide: document.getElementById('btn-add-arcs-guide'),
  refListContainer: document.getElementById('reference-list-container'),
  floatingRefViewer: document.getElementById('floating-reference-viewer'),
  floatingRefHeader: document.getElementById('floating-ref-header'),
  floatingRefTitle: document.getElementById('floating-ref-title'),
  floatingRefBody: document.getElementById('floating-ref-body'),
  btnCloseFloatingRef: document.getElementById('btn-close-floating-ref'),

  // Palettes
  quickSwatchesGrid: document.getElementById('quick-swatches-grid'),
  presetPalettesContainer: document.getElementById('preset-palettes-container'),

  // Inspector Panel Island & Rail
  studioSidepanel: document.getElementById('studio-sidepanel'),
  studioRightRail: document.getElementById('studio-right-rail'),
  btnToggleSidepanel: document.getElementById('btn-toggle-sidepanel'),
  btnCloseSidepanel: document.getElementById('btn-close-sidepanel'),
  iconSidepanelToggle: document.getElementById('icon-sidepanel-toggle'),

  // Timeline
  btnFirstFrame: document.getElementById('btn-first-frame'),
  btnPrevFrame: document.getElementById('btn-prev-frame'),
  btnPlayPause: document.getElementById('btn-play-pause'),
  iconPlay: document.getElementById('icon-play'),
  iconPause: document.getElementById('icon-pause'),
  btnNextFrame: document.getElementById('btn-next-frame'),
  btnLastFrame: document.getElementById('btn-last-frame'),
  btnToggleLoop: document.getElementById('btn-toggle-loop'),
  currentFrameNum: document.getElementById('current-frame-num'),
  totalFramesNum: document.getElementById('total-frames-num'),
  selectFps: document.getElementById('select-fps'),
  timecodeDisplay: document.getElementById('timecode-display'),

  // Onion Skin
  btnToggleOnion: document.getElementById('btn-toggle-onion'),
  onionPopover: document.getElementById('onion-popover'),
  btnCloseOnionPop: document.getElementById('btn-close-onion-pop'),
  sliderOnionPrev: document.getElementById('slider-onion-prev'),
  onionPrevVal: document.getElementById('onion-prev-val'),
  sliderOnionNext: document.getElementById('slider-onion-next'),
  onionNextVal: document.getElementById('onion-next-val'),
  sliderOnionOpacity: document.getElementById('slider-onion-opacity'),
  onionOpacityVal: document.getElementById('onion-opacity-val'),
  selectOnionMode: document.getElementById('select-onion-mode'),
  pickerOnionPrev: document.getElementById('picker-onion-prev'),
  pickerOnionNext: document.getElementById('picker-onion-next'),

  // Frame Operations
  btnAddFrame: document.getElementById('btn-add-frame'),
  btnDuplicateFrame: document.getElementById('btn-duplicate-frame'),
  btnClearFrame: document.getElementById('btn-clear-frame'),
  btnDeleteFrame: document.getElementById('btn-delete-frame'),
  filmstripScrollArea: document.getElementById('filmstrip-scroll-area'),

  // Modals
  exportModal: document.getElementById('export-modal'),
  btnCloseExportModal: document.getElementById('btn-close-export-modal'),
  btnCancelExport: document.getElementById('btn-cancel-export'),
  btnRunExport: document.getElementById('btn-run-export'),
  exportProgressWrap: document.getElementById('export-progress-wrap'),
  exportProgressBar: document.getElementById('export-progress-bar'),
  exportProgressNum: document.getElementById('export-progress-num'),
  exportStatusLabel: document.getElementById('export-status-label'),

  shortcutsModal: document.getElementById('shortcuts-modal'),
  btnCloseShortcutsModal: document.getElementById('btn-close-shortcuts-modal'),
  templatesModal: document.getElementById('templates-modal'),
  btnCloseTemplatesModal: document.getElementById('btn-close-templates-modal'),
  btnLoadBouncingBall: document.getElementById('btn-load-bouncing-ball'),
};
