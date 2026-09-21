// src/main.js
import { state } from './js/state/appState.js';
import { elements } from './js/state/domElements.js';
import { centerCameraInView } from './js/viewport/camera.js';
import { requestRender } from './js/render/renderEngine.js';
import { renderTimelineFilmstrip, renderTimelineWaveform, setupTimelineCollapse } from './js/timeline/filmstrip.js';
import { renderLayersList } from './js/ui/layersUI.js';
import { renderReferenceList, updateReferenceOverlaysTransform, updateFloatingRefViewer } from './js/ui/referenceUI.js';
import { setupColorPalettes, updateToolPanelForCurrentTool } from './js/ui/colorPalettes.js';
import { setupEventListeners } from './js/events/eventListeners.js';
import { setupCanvasContextMenu } from './js/ui/canvasContextMenu.js';
import { commandManager } from './js/project/commandManager.js';
import { resetHistoryTracking } from './js/project/history.js';
import { updateHeaderInfo } from './js/project/projectManager.js';
import { setupCrashGuardLifecycleHooks, scheduleAutosave, updateAutosaveIndicator } from './js/project/autosave.js';
import { initHardwareWatchdog } from './js/project/hardwareWatchdog.js';
import { setupZenMode } from './js/ui/zenMode.js';
import { SplashLauncher } from './js/ui/splashLauncher.js';
import { initFloatingNotes } from './js/ui/floatingNotes.js';
import { initQuickPalette, refreshQuickPaletteUI } from './js/ui/quickPalette.js';
import { setupDesktopMenuListeners } from './js/desktop/fileBridge.js';
import { TouchGestureEngine } from './js/viewport/touchGestures.js';
import { applyTranslationsToDOM } from './js/i18n/i18n.js';
import { crashReporter } from './js/telemetry/crashReporter.js';
import { saveProjectToLibrary } from './js/persistence.js';
import { restoreProjectMedia } from './js/storage/mediaVault.js';
import { hardResetPerspectiveStudio } from './js/viewport/perspectiveRectangleStudio.js';
import { cancelNodeTool } from './js/viewport/nodeTool.js';
import { clearSelection } from './js/viewport/selectTool.js';
import { cancelPolygonStudio } from './js/viewport/polygonStudio.js';

export async function loadProject(project) {
  // CRITICAL FIX: Hard-reset all active interactive tool singletons so ghost shapes never leak
  hardResetPerspectiveStudio();
  cancelNodeTool();
  clearSelection();
  cancelPolygonStudio();

  crashReporter.recordBreadcrumb(`Loading project "${project.name || 'Untitled'}"`);
  state.project = project;

  // 1. REVIVE ALL REFERENCE IMAGES FROM MEDIA VAULT
  await restoreProjectMedia(project);

  // 2. RESTORE PERSISTENT UNDO HISTORY ACROSS PROJECT RELOAD
  await commandManager.restoreHistoryForProject(project.id);
  resetHistoryTracking(project);

  // 3. REGISTER IN PERSISTENCE VAULT & VERIFY AUTO-SAVE ACTIVE
  try {
    await saveProjectToLibrary(project, true);
    updateAutosaveIndicator('saved');
  } catch (e) {
    console.warn('[CrashGuard] Could not register active project in library:', e);
  }

  state.currentFrameIndex = 0;
  state.activeLayerId = project.layers[project.layers.length - 1].id;
  state.zoom = 1;
  centerCameraInView();

  if (elements.zoomText) elements.zoomText.textContent = '100%';
  if (elements.statusZoom) elements.statusZoom.textContent = '100%';

  updateHeaderInfo();
  requestRender();
  renderTimelineFilmstrip();
  renderTimelineWaveform();
  renderLayersList();
  renderReferenceList();
  updateReferenceOverlaysTransform();
  updateFloatingRefViewer();
  refreshQuickPaletteUI();

  // Guarantees autosave heartbeat is active immediately
  scheduleAutosave(false);
}

async function initApp() {
  // 1. Initialize Global Crash Boundary immediately
  crashReporter.init();
  crashReporter.recordBreadcrumb('Bootstrapping Studio Engine');

  // Hardware crash guard & watchdog
  setupCrashGuardLifecycleHooks();
  initHardwareWatchdog();
  setupZenMode();
  initQuickPalette();
  initFloatingNotes();

  // 2. Setup studio event listeners and palettes
  setupEventListeners(loadProject);
  setupCanvasContextMenu();
  setupColorPalettes();
  setupTimelineCollapse();
  updateToolPanelForCurrentTool();
  setupDesktopMenuListeners(loadProject);

  // Initialize Touch Gestures (Pinch-zoom, 2-finger Undo, 3-finger Redo)
  new TouchGestureEngine(elements.canvasContainer);

  // Apply active language strings
  applyTranslationsToDOM();

  window.addEventListener('resize', () => {
    renderTimelineWaveform();
  });

  // 3. Instantiate the Interactive Studio Launcher
  const launcher = new SplashLauncher(async (chosenProject) => {
    await loadProject(chosenProject);
  });
  window.__splashLauncher = launcher;

  document.getElementById('btn-open-library')?.addEventListener('click', () => {
    launcher.show();
  });

  crashReporter.recordBreadcrumb('Studio Ready for User Input');
}

initApp();
