// src/main.js
import { state } from './js/state/appState.js';
import { elements } from './js/state/domElements.js';
import { centerCameraInView } from './js/viewport/camera.js';
import { requestRender } from './js/render/renderEngine.js';
import { renderTimelineFilmstrip } from './js/timeline/filmstrip.js';
import { renderLayersList } from './js/ui/layersUI.js';
import { renderReferenceList, updateReferenceOverlaysTransform, updateFloatingRefViewer } from './js/ui/referenceUI.js';
import { setupColorPalettes, updateToolPanelForCurrentTool } from './js/ui/colorPalettes.js';
import { setupEventListeners } from './js/events/eventListeners.js';
import { setupCanvasContextMenu } from './js/ui/canvasContextMenu.js';
import { saveHistoryState } from './js/project/history.js';
import { updateHeaderInfo } from './js/project/projectManager.js';
import { setupCrashGuardLifecycleHooks } from './js/project/autosave.js';
import { initHardwareWatchdog } from './js/project/hardwareWatchdog.js';
import { setupZenMode } from './js/ui/zenMode.js';
import { SplashLauncher } from './js/ui/splashLauncher.js';

export async function loadProject(project) {
  state.project = project;
  state.currentFrameIndex = 0;
  state.activeLayerId = project.layers[project.layers.length - 1].id;
  state.zoom = 1;
  centerCameraInView();
  if (elements.zoomText) elements.zoomText.textContent = '100%';
  if (elements.statusZoom) elements.statusZoom.textContent = '100%';
  updateHeaderInfo();
  requestRender();
  renderTimelineFilmstrip();
  renderLayersList();
  renderReferenceList();
  updateReferenceOverlaysTransform();
  updateFloatingRefViewer();
  saveHistoryState();
}

async function initApp() {
  // 1. Initialize hardware crash guard & watchdog
  setupCrashGuardLifecycleHooks();
  initHardwareWatchdog();
  setupZenMode();

  // 2. Setup studio event listeners and palettes
  setupEventListeners(loadProject);
  setupCanvasContextMenu();
  setupColorPalettes();
  updateToolPanelForCurrentTool();

  // 3. Instantiate the Interactive Studio Launcher
  new SplashLauncher(async (chosenProject) => {
    await loadProject(chosenProject);
  });
}

initApp();

