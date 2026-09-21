// src/js/state/domElements.js
const getEl = (id) => (typeof document !== 'undefined' && document ? document.getElementById(id) : null);

export const elements = {
  // Header
  projectNameInput: getEl('project-name-input'),
  headerResBadge: getEl('header-resolution-badge'),
  headerFpsBadge: getEl('header-fps-badge'),
  autosaveDot: getEl('autosave-dot'),
  autosaveText: getEl('autosave-text'),
  btnSaveProject: getEl('btn-save-project'),
  openProjectFileInput: getEl('open-project-file-input'),

  // Header Canvas Tools
  btnUndo: getEl('btn-undo'),
  btnRedo: getEl('btn-redo'),
  btnZoomOut: getEl('btn-zoom-out'),
  btnZoomIn: getEl('btn-zoom-in'),
  btnResetZoom: getEl('btn-reset-zoom'),
  btnFitScreen: getEl('btn-fit-screen'),
  zoomText: getEl('zoom-percentage-text'),
  btnToggleGrid: getEl('btn-toggle-grid'),
  btnFlipH: getEl('btn-flip-h'),
  btnOpenTemplates: getEl('btn-open-templates'),
  btnOpenShortcuts: getEl('btn-open-shortcuts'),
  btnOpenExport: getEl('btn-open-export'),

  // Canvas Stage & Overlays
  canvasContainer: getEl('studio-canvas-container'),
  viewportCanvas: getEl('viewport-canvas'),
  strokeCanvas: getEl('stroke-canvas'),
  cameraOverlay: getEl('camera-overlay'),
  cameraBorder: getEl('camera-border'),
  camLockIcon: getEl('cam-lock-icon'),
  selectionSvg: getEl('selection-svg'),
  selectionRect: getEl('selection-rect'),
  floatingSelectionOverlay: getEl('floating-selection-overlay'),
  refOverlaysContainer: getEl('reference-overlays-container'),
  brushCursor: getEl('brush-cursor-indicator'),

  // Status Bar
  statusCoords: getEl('status-coords'),
  statusZoom: getEl('status-zoom'),
  statusTimecode: getEl('status-timecode'),
  statusLayer: getEl('status-layer'),
  statusCanvasSize: getEl('status-canvas-size'),

  // Color Swatches
  primaryColorPicker: getEl('primary-color-picker'),
  secondaryColorPicker: getEl('secondary-color-picker'),
  btnSwapColors: getEl('btn-swap-colors'),

  // Tool Settings Panel
  toolPanelIcon: getEl('tool-panel-icon'),
  toolPanelName: getEl('tool-panel-name'),
  toolPanelDesc: getEl('tool-panel-desc'),
  sizeLabelText: getEl('size-label-text'),
  settingRowSize: getEl('setting-row-size'),
  settingRowOpacity: getEl('setting-row-opacity'),
  settingRowEraser: getEl('setting-row-eraser'),
  settingRowTolerance: getEl('setting-row-tolerance'),
  settingRowShapeFilled: getEl('setting-row-shapefilled'),
  settingRowEmpty: getEl('setting-row-empty'),

  sliderBrushSize: getEl('slider-brush-size'),
  brushSizeVal: getEl('brush-size-val'),
  sliderBrushOpacity: getEl('slider-brush-opacity'),
  brushOpacityVal: getEl('brush-opacity-val'),
  sliderEraserSize: getEl('slider-eraser-size'),
  eraserSizeVal: getEl('eraser-size-val'),
  sliderFillTolerance: getEl('slider-fill-tolerance'),
  fillToleranceVal: getEl('fill-tolerance-val'),
  toggleShapeFilled: getEl('toggle-shape-filled'),

  // Layers Stack
  layersListContainer: getEl('layers-list-container'),
  btnAddLayer: getEl('btn-add-layer'),
  btnDuplicateLayer: getEl('btn-duplicate-layer'),
  btnMergeLayer: getEl('btn-merge-layer'),
  btnDeleteLayer: getEl('btn-delete-layer'),
  sliderLayerOpacity: getEl('slider-layer-opacity'),
  layerOpacityVal: getEl('layer-opacity-val'),
  selectLayerBlend: getEl('select-layer-blend'),

  // References
  refFileInput: getEl('ref-file-input'),
  btnAddWalkGuide: getEl('btn-add-walk-guide'),
  btnAddArcsGuide: getEl('btn-add-arcs-guide'),
  refListContainer: getEl('reference-list-container'),
  floatingRefViewer: getEl('floating-reference-viewer'),
  floatingRefHeader: getEl('floating-ref-header'),
  floatingRefTitle: getEl('floating-ref-title'),
  floatingRefBody: getEl('floating-ref-body'),
  btnCloseFloatingRef: getEl('btn-close-floating-ref'),

  // Palettes
  quickSwatchesGrid: getEl('quick-swatches-grid'),
  presetPalettesContainer: getEl('preset-palettes-container'),

  // Inspector Panel Island & Rail
  studioSidepanel: getEl('studio-sidepanel'),
  studioRightRail: getEl('studio-right-rail'),
  btnToggleSidepanel: getEl('btn-toggle-sidepanel'),
  btnCloseSidepanel: getEl('btn-close-sidepanel'),
  iconSidepanelToggle: getEl('icon-sidepanel-toggle'),

  // Timeline
  studioTimeline: getEl('studio-timeline'),
  timelineHeaderBar: getEl('timeline-header-bar'),
  btnToggleTimeline: getEl('btn-toggle-timeline'),
  iconTimelineCollapse: getEl('icon-timeline-collapse'),
  labelTimelineCollapse: getEl('label-timeline-collapse'),
  btnFirstFrame: getEl('btn-first-frame'),
  btnPrevFrame: getEl('btn-prev-frame'),
  btnPlayPause: getEl('btn-play-pause'),
  iconPlay: getEl('icon-play'),
  iconPause: getEl('icon-pause'),
  btnNextFrame: getEl('btn-next-frame'),
  btnLastFrame: getEl('btn-last-frame'),
  btnToggleLoop: getEl('btn-toggle-loop'),
  currentFrameNum: getEl('current-frame-num'),
  totalFramesNum: getEl('total-frames-num'),
  selectFps: getEl('select-fps'),
  timecodeDisplay: getEl('timecode-display'),
  btnKeyCamera: getEl('btn-key-camera'),
  audioFileInput: getEl('audio-file-input'),
  waveformCanvas: getEl('waveform-canvas'),
  timelineWaveformWrap: getEl('timeline-waveform-wrap'),

  // Onion Skin
  btnToggleOnion: getEl('btn-toggle-onion'),
  onionPopover: getEl('onion-popover'),
  btnCloseOnionPop: getEl('btn-close-onion-pop'),
  sliderOnionPrev: getEl('slider-onion-prev'),
  onionPrevVal: getEl('onion-prev-val'),
  sliderOnionNext: getEl('slider-onion-next'),
  onionNextVal: getEl('onion-next-val'),
  sliderOnionOpacity: getEl('slider-onion-opacity'),
  onionOpacityVal: getEl('onion-opacity-val'),
  selectOnionMode: getEl('select-onion-mode'),
  pickerOnionPrev: getEl('picker-onion-prev'),
  pickerOnionNext: getEl('picker-onion-next'),

  // Frame Operations
  btnAddFrame: getEl('btn-add-frame'),
  btnDuplicateFrame: getEl('btn-duplicate-frame'),
  btnClearFrame: getEl('btn-clear-frame'),
  btnDeleteFrame: getEl('btn-delete-frame'),
  filmstripScrollArea: getEl('filmstrip-scroll-area'),

  // Modals
  exportModal: getEl('export-modal'),
  btnCloseExportModal: getEl('btn-close-export-modal'),
  btnCancelExport: getEl('btn-cancel-export'),
  btnRunExport: getEl('btn-run-export'),
  exportProgressWrap: getEl('export-progress-wrap'),
  exportProgressBar: getEl('export-progress-bar'),
  exportProgressNum: getEl('export-progress-num'),
  exportStatusLabel: getEl('export-status-label'),

  shortcutsModal: getEl('shortcuts-modal'),
  btnCloseShortcutsModal: getEl('btn-close-shortcuts-modal'),
  templatesModal: getEl('templates-modal'),
  btnCloseTemplatesModal: getEl('btn-close-templates-modal'),
  btnLoadBouncingBall: getEl('btn-load-bouncing-ball'),
};
