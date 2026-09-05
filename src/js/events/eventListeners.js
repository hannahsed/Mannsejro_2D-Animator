// src/js/events/eventListeners.js
import { state, currentFrame, hasSelection, SHAPE_TOOLS } from '../state/appState.js';
import { elements } from '../state/domElements.js';
import { screenToWorld, zoomAtPointer, centerCameraInView, setupCameraHandles } from '../viewport/camera.js';
import { requestRender, sampleWorldColor } from '../render/renderEngine.js';
import { clearSelectionPixels } from '../render/strokeRenderer.js';
import { renderTimelineFilmstrip, setupFilmstripScroll } from '../timeline/filmstrip.js';
import { setFrameIndex, togglePlayback, stopPlayback } from '../timeline/playback.js';
import { addFrameAfter, duplicateFrameAt, clearFrameAt, deleteFrameAt } from '../timeline/frameOperations.js';
import { renderLayersList, setupLayersInteractions, mergeLayerDown, duplicateLayer, deleteLayer } from '../ui/layersUI.js';
import { setToolByName } from '../ui/colorPalettes.js';
import { undo, redo, saveHistoryState } from '../project/history.js';
import { exportProjectFile, updateHeaderInfo, isValidProject, confirmReplaceProject } from '../project/projectManager.js';
import { scheduleAutosave } from '../project/autosave.js';
import { showToast } from '../ui/toast.js';
import { copyTiles, floodFillTiles } from '../infiniteCanvas.js';
import { floodFill } from '../colorUtils.js';
import { exportVideo, exportSpritesheet, exportPngSequenceZip, exportAnimatedGif, exportCurrentFrameAsPng } from '../exportEngine.js';
import { createBouncingBallProject, createBlankProject } from '../templates.js';
import {
  renderReferenceList,
  renderReferenceOverlays,
  updateReferenceOverlaysTransform,
  updateFloatingRefViewer,
  fitReferenceToCamera,
  syncVideoReferences,
  setupFloatingRefDragging,
} from '../ui/referenceUI.js';
import { setupCanvasEvents } from './canvasEvents.js';
import { setupKeyboardEvents } from './keyboardEvents.js';

export function switchSidebarTab(tabName) {
  // Ensure sidepanel is visible
  if (elements.studioSidepanel) {
    elements.studioSidepanel.classList.remove('hidden', 'translate-x-[120%]', 'opacity-0', 'pointer-events-none');
    if (elements.iconSidepanelToggle) {
      elements.iconSidepanelToggle.style.transform = 'rotate(0deg)';
    }
  }

  // Update tab buttons inside segmented pill
  document.querySelectorAll('.tab-btn').forEach((b) => {
    const isTarget = b.getAttribute('data-tab') === tabName;
    b.classList.toggle('active', isTarget);
  });

  // Update rail icon buttons
  document.querySelectorAll('.rail-tab-btn').forEach((b) => {
    const isTarget = b.getAttribute('data-tab') === tabName;
    b.classList.toggle('active-tab', isTarget);
    b.classList.toggle('text-orange-400', isTarget);
    b.classList.toggle('bg-orange-500/15', isTarget);
    b.classList.toggle('border', isTarget);
    b.classList.toggle('border-orange-500/40', isTarget);
    b.classList.toggle('shadow-xs', isTarget);
    b.classList.toggle('text-zinc-400', !isTarget);
    b.classList.toggle('hover:bg-zinc-800', !isTarget);
  });

  // Show corresponding tab content
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
  const targetEl = document.getElementById(`tab-content-${tabName}`);
  if (targetEl) targetEl.classList.remove('hidden');
}

export function toggleSidepanel() {
  if (!elements.studioSidepanel) return;
  const isHidden = elements.studioSidepanel.classList.contains('hidden') || elements.studioSidepanel.classList.contains('opacity-0');
  if (isHidden) {
    elements.studioSidepanel.classList.remove('hidden', 'translate-x-[120%]', 'opacity-0', 'pointer-events-none');
    if (elements.iconSidepanelToggle) elements.iconSidepanelToggle.style.transform = 'rotate(0deg)';
  } else {
    elements.studioSidepanel.classList.add('translate-x-[120%]', 'opacity-0', 'pointer-events-none');
    if (elements.iconSidepanelToggle) elements.iconSidepanelToggle.style.transform = 'rotate(180deg)';
  }
}

let listenersInitialized = false;

export function setupEventListeners(loadProjectFn) {
  if (listenersInitialized) return;
  listenersInitialized = true;

  // Project Name
  if (elements.projectNameInput) {
    elements.projectNameInput.addEventListener('input', (e) => {
      if (state.project) {
        state.project.name = e.target.value;
        scheduleAutosave();
      }
    });
  }

  // Save / Open
  if (elements.btnSaveProject) {
    elements.btnSaveProject.addEventListener('click', exportProjectFile);
  }
  if (elements.openProjectFileInput) {
    elements.openProjectFileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const project =
          parsed && parsed.format === 'animation-studio-project' && parsed.project
            ? parsed.project
            : parsed;
        if (!isValidProject(project)) {
          showToast('Invalid project file', 'error');
          return;
        }
        if (!confirmReplaceProject(`Open "${project.name || 'imported project'}"`)) return;
        if (loadProjectFn) loadProjectFn(project);
      } catch (err) {
        showToast('Failed to parse project file', 'error');
      } finally {
        e.target.value = '';
      }
    });
  }

  // Undo / Redo
  if (elements.btnUndo) elements.btnUndo.addEventListener('click', undo);
  if (elements.btnRedo) elements.btnRedo.addEventListener('click', redo);

  // Zoom / Viewport
  if (elements.btnZoomIn) {
    elements.btnZoomIn.addEventListener('click', () => {
      if (!elements.canvasContainer) return;
      const rect = elements.canvasContainer.getBoundingClientRect();
      zoomAtPointer(rect.left + rect.width / 2, rect.top + rect.height / 2, state.zoom * 1.25, requestRender);
    });
  }
  if (elements.btnZoomOut) {
    elements.btnZoomOut.addEventListener('click', () => {
      if (!elements.canvasContainer) return;
      const rect = elements.canvasContainer.getBoundingClientRect();
      zoomAtPointer(rect.left + rect.width / 2, rect.top + rect.height / 2, state.zoom / 1.25, requestRender);
    });
  }
  if (elements.btnResetZoom) {
    elements.btnResetZoom.addEventListener('click', () => {
      state.zoom = 1;
      centerCameraInView();
      if (elements.zoomText) elements.zoomText.textContent = '100%';
      if (elements.statusZoom) elements.statusZoom.textContent = '100%';
      requestRender();
    });
  }
  if (elements.btnFitScreen) {
    elements.btnFitScreen.addEventListener('click', () => {
      state.zoom = 1;
      centerCameraInView();
      if (elements.zoomText) elements.zoomText.textContent = '100%';
      if (elements.statusZoom) elements.statusZoom.textContent = '100%';
      requestRender();
    });
  }
  if (elements.btnToggleGrid) {
    elements.btnToggleGrid.addEventListener('click', () => {
      state.showGrid = !state.showGrid;
      requestRender();
    });
  }
  if (elements.btnFlipH) {
    elements.btnFlipH.addEventListener('click', () => {
      state.flipH = !state.flipH;
      requestRender();
    });
  }

  // Tool Buttons
  document.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tool = btn.getAttribute('data-tool');
      if (tool) {
        setToolByName(tool);
        switchSidebarTab('tool');
      }
    });
  });

  // Colors & Sliders
  if (elements.primaryColorPicker) {
    elements.primaryColorPicker.addEventListener('input', (e) => {
      state.toolSettings.color = e.target.value;
    });
  }
  if (elements.secondaryColorPicker) {
    elements.secondaryColorPicker.addEventListener('input', (e) => {
      state.toolSettings.secondaryColor = e.target.value;
    });
  }
  if (elements.btnSwapColors) {
    elements.btnSwapColors.addEventListener('click', () => {
      const tmp = state.toolSettings.color;
      state.toolSettings.color = state.toolSettings.secondaryColor;
      state.toolSettings.secondaryColor = tmp;
      if (elements.primaryColorPicker) elements.primaryColorPicker.value = state.toolSettings.color;
      if (elements.secondaryColorPicker) elements.secondaryColorPicker.value = state.toolSettings.secondaryColor;
    });
  }
  if (elements.sliderBrushSize) {
    elements.sliderBrushSize.addEventListener('input', (e) => {
      state.toolSettings.size = parseInt(e.target.value, 10);
      if (elements.brushSizeVal) elements.brushSizeVal.textContent = `${state.toolSettings.size} px`;
    });
  }
  if (elements.sliderBrushOpacity) {
    elements.sliderBrushOpacity.addEventListener('input', (e) => {
      state.toolSettings.opacity = parseInt(e.target.value, 10) / 100;
      if (elements.brushOpacityVal) elements.brushOpacityVal.textContent = `${Math.round(state.toolSettings.opacity * 100)}%`;
    });
  }
  if (elements.sliderEraserSize) {
    elements.sliderEraserSize.addEventListener('input', (e) => {
      state.toolSettings.eraserSize = parseInt(e.target.value, 10);
      if (elements.eraserSizeVal) elements.eraserSizeVal.textContent = `${state.toolSettings.eraserSize} px`;
    });
  }
  if (elements.sliderFillTolerance) {
    elements.sliderFillTolerance.addEventListener('input', (e) => {
      state.toolSettings.fillTolerance = parseInt(e.target.value, 10);
      if (elements.fillToleranceVal) elements.fillToleranceVal.textContent = state.toolSettings.fillTolerance;
    });
  }
  if (elements.toggleShapeFilled) {
    elements.toggleShapeFilled.addEventListener('change', (e) => {
      state.toolSettings.shapeFilled = e.target.checked;
    });
  }

  // Sidebar Tabs & Rail Buttons
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      if (targetTab) switchSidebarTab(targetTab);
    });
  });

  document.querySelectorAll('.rail-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      if (targetTab) switchSidebarTab(targetTab);
    });
  });

  if (elements.btnToggleSidepanel) {
    elements.btnToggleSidepanel.addEventListener('click', toggleSidepanel);
  }
  if (elements.btnCloseSidepanel) {
    elements.btnCloseSidepanel.addEventListener('click', toggleSidepanel);
  }

  // Layer Operations
  if (elements.btnAddLayer) {
    elements.btnAddLayer.addEventListener('click', () => {
      if (!state.project) return;
      const newId = `layer_${Date.now()}`;
      state.project.layers.push({
        id: newId,
        name: `Layer ${state.project.layers.length + 1}`,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'source-over',
        clippingMask: false,
        alphaLocked: false,
        colorTag: null,
      });
      state.project.frames.forEach((f) => {
        f.layerData[newId] = { tiles: {} };
      });
      state.activeLayerId = newId;
      renderLayersList();
      requestRender();
      saveHistoryState();
    });
  }
  if (elements.btnDuplicateLayer) {
    elements.btnDuplicateLayer.addEventListener('click', () => {
      if (state.activeLayerId) duplicateLayer(state.activeLayerId);
    });
  }
  if (elements.btnMergeLayer) {
    elements.btnMergeLayer.addEventListener('click', () => {
      if (state.activeLayerId) mergeLayerDown(state.activeLayerId);
    });
  }
  if (elements.btnDeleteLayer) {
    elements.btnDeleteLayer.addEventListener('click', () => {
      if (state.activeLayerId) deleteLayer(state.activeLayerId);
    });
  }
  if (elements.sliderLayerOpacity) {
    elements.sliderLayerOpacity.addEventListener('input', (e) => {
      const active = state.project?.layers.find((l) => l.id === state.activeLayerId);
      if (active) {
        active.opacity = parseInt(e.target.value, 10) / 100;
        if (elements.layerOpacityVal) elements.layerOpacityVal.textContent = `${Math.round(active.opacity * 100)}%`;
        requestRender();
      }
    });
  }
  if (elements.selectLayerBlend) {
    elements.selectLayerBlend.addEventListener('change', (e) => {
      const active = state.project?.layers.find((l) => l.id === state.activeLayerId);
      if (active) {
        active.blendMode = e.target.value;
        requestRender();
      }
    });
  }

  // Timeline playback controls
  if (elements.btnPlayPause) elements.btnPlayPause.addEventListener('click', togglePlayback);
  if (elements.btnFirstFrame) elements.btnFirstFrame.addEventListener('click', () => setFrameIndex(0));
  if (elements.btnPrevFrame) elements.btnPrevFrame.addEventListener('click', () => setFrameIndex(state.currentFrameIndex - 1));
  if (elements.btnNextFrame) elements.btnNextFrame.addEventListener('click', () => setFrameIndex(state.currentFrameIndex + 1));
  if (elements.btnLastFrame) elements.btnLastFrame.addEventListener('click', () => setFrameIndex(state.project.frames.length - 1));
  if (elements.btnToggleLoop) {
    elements.btnToggleLoop.addEventListener('click', () => {
      state.loop = !state.loop;
      elements.btnToggleLoop.classList.toggle('text-indigo-400', state.loop);
    });
  }
  if (elements.selectFps) {
    elements.selectFps.addEventListener('change', (e) => {
      state.project.fps = parseInt(e.target.value, 10);
      if (elements.headerFpsBadge) elements.headerFpsBadge.textContent = `${state.project.fps} FPS`;
    });
  }
  if (elements.btnToggleOnion) {
    elements.btnToggleOnion.addEventListener('click', () => {
      state.onionSkin.enabled = !state.onionSkin.enabled;
      elements.btnToggleOnion.classList.toggle('bg-indigo-950/80', state.onionSkin.enabled);
      requestRender();
    });
  }

  // Onion skin slider adjustments
  if (elements.sliderOnionPrev) {
    elements.sliderOnionPrev.addEventListener('input', (e) => {
      state.onionSkin.prevFrames = parseInt(e.target.value, 10);
      if (elements.onionPrevVal) elements.onionPrevVal.textContent = state.onionSkin.prevFrames;
      requestRender();
    });
  }
  if (elements.sliderOnionNext) {
    elements.sliderOnionNext.addEventListener('input', (e) => {
      state.onionSkin.nextFrames = parseInt(e.target.value, 10);
      if (elements.onionNextVal) elements.onionNextVal.textContent = state.onionSkin.nextFrames;
      requestRender();
    });
  }
  if (elements.sliderOnionOpacity) {
    elements.sliderOnionOpacity.addEventListener('input', (e) => {
      state.onionSkin.opacity = parseInt(e.target.value, 10) / 100;
      if (elements.onionOpacityVal) elements.onionOpacityVal.textContent = `${Math.round(state.onionSkin.opacity * 100)}%`;
      requestRender();
    });
  }

  // Frame Operations
  if (elements.btnAddFrame) elements.btnAddFrame.addEventListener('click', () => addFrameAfter(state.currentFrameIndex));
  if (elements.btnDuplicateFrame) elements.btnDuplicateFrame.addEventListener('click', () => duplicateFrameAt(state.currentFrameIndex));
  if (elements.btnClearFrame) elements.btnClearFrame.addEventListener('click', () => clearFrameAt(state.currentFrameIndex));
  if (elements.btnDeleteFrame) elements.btnDeleteFrame.addEventListener('click', () => deleteFrameAt(state.currentFrameIndex));

  // Setup modular Canvas and Keyboard event systems
  setupCanvasEvents();
  setupKeyboardEvents();

  // Modals & Export setup
  if (elements.btnOpenExport) {
    elements.btnOpenExport.addEventListener('click', () => {
      elements.exportModal.classList.remove('hidden');
    });
  }
  if (elements.btnCloseExportModal) {
    elements.btnCloseExportModal.addEventListener('click', () => {
      elements.exportModal.classList.add('hidden');
    });
  }
  if (elements.btnCancelExport) {
    elements.btnCancelExport.addEventListener('click', () => {
      elements.exportModal.classList.add('hidden');
    });
  }

  let selectedExportType = 'video';
  document.querySelectorAll('.export-type-btn').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.export-type-btn').forEach((btn) => {
        btn.classList.remove('active-export', 'border-indigo-500', 'bg-indigo-950/60', 'text-indigo-300');
        btn.classList.add('border-zinc-700/60', 'bg-zinc-800/50', 'text-zinc-400');
      });
      b.classList.add('active-export', 'border-indigo-500', 'bg-indigo-950/60', 'text-indigo-300');
      b.classList.remove('border-zinc-700/60', 'bg-zinc-800/50', 'text-zinc-400');
      selectedExportType = b.getAttribute('data-export-type') || 'video';
    });
  });

  if (elements.btnRunExport) {
    elements.btnRunExport.addEventListener('click', async () => {
      if (!state.project) return;
      elements.exportProgressWrap.classList.remove('hidden');
      elements.btnRunExport.disabled = true;
      const onProg = (p) => {
        elements.exportProgressBar.style.width = `${p}%`;
        elements.exportProgressNum.textContent = `${p}%`;
      };
      try {
        if (selectedExportType === 'frame') {
          elements.exportStatusLabel.textContent = 'Rendering Current Keyframe PNG...';
          await exportCurrentFrameAsPng(
            state.project,
            state.project.frames[state.currentFrameIndex],
            `${state.project.name.toLowerCase().replace(/\s+/g, '_')}_frame_${state.currentFrameIndex + 1}.png`
          );
          onProg(100);
        } else if (selectedExportType === 'video' || selectedExportType === 'gif') {
          elements.exportStatusLabel.textContent = 'Rendering WebM Video Loop...';
          await exportVideo(state.project, onProg);
        } else if (selectedExportType === 'spritesheet') {
          elements.exportStatusLabel.textContent = 'Assembling Spritesheet...';
          await exportSpritesheet(state.project, 4);
          onProg(100);
        } else if (selectedExportType === 'zip') {
          elements.exportStatusLabel.textContent = 'Archiving PNG Sequence...';
          await exportPngSequenceZip(state.project, onProg);
        }
      } catch (err) {
        showToast('Export failed: ' + err.message, 'error');
      } finally {
        setTimeout(() => {
          elements.exportProgressWrap.classList.add('hidden');
          elements.exportModal.classList.add('hidden');
          elements.btnRunExport.disabled = false;
        }, 1000);
      }
    });
  }

  // Backdrop click dismissal for all modals
  [elements.exportModal, elements.templatesModal, elements.shortcutsModal].forEach((modal) => {
    if (!modal) return;
    modal.addEventListener('pointerdown', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });

  if (elements.btnOpenShortcuts) {
    elements.btnOpenShortcuts.addEventListener('click', () => {
      elements.shortcutsModal.classList.remove('hidden');
    });
  }
  if (elements.btnCloseShortcutsModal) {
    elements.btnCloseShortcutsModal.addEventListener('click', () => {
      elements.shortcutsModal.classList.add('hidden');
    });
  }

  if (elements.btnOpenTemplates) {
    elements.btnOpenTemplates.addEventListener('click', () => {
      elements.templatesModal.classList.remove('hidden');
    });
  }
  if (elements.btnCloseTemplatesModal) {
    elements.btnCloseTemplatesModal.addEventListener('click', () => {
      elements.templatesModal.classList.add('hidden');
    });
  }

  if (elements.btnLoadBouncingBall) {
    elements.btnLoadBouncingBall.addEventListener('click', async () => {
      if (loadProjectFn) {
        await loadProjectFn(await createBouncingBallProject());
      }
      elements.templatesModal.classList.add('hidden');
    });
  }

  document.querySelectorAll('.tpl-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = btn.getAttribute('data-name') || 'New Canvas';
      const w = parseInt(btn.getAttribute('data-w') || '1280', 10);
      const h = parseInt(btn.getAttribute('data-h') || '720', 10);
      const fps = parseInt(btn.getAttribute('data-fps') || '24', 10);
      if (loadProjectFn) {
        await loadProjectFn(createBlankProject(name, w, h, fps));
      }
      elements.templatesModal.classList.add('hidden');
    });
  });

  // Reference file input
  if (elements.refFileInput) {
    elements.refFileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const url = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video');

      const ref = {
        id: `ref_${Date.now()}`,
        name: file.name,
        type: isVideo ? 'video' : 'image',
        url,
        visible: true,
        mode: 'overlay',
        opacity: 0.6,
        blendMode: 'normal',
        scale: 1,
        x: state.project.camera?.x || 640,
        y: state.project.camera?.y || 360,
        rotation: 0,
        flipH: false,
        flipV: false,
        locked: false,
        width: 640,
        height: 360,
        duration: null,
        timeOffset: 0,
        playbackRate: 1,
      };

      const finalize = () => {
        fitReferenceToCamera(ref);
        if (!state.project.referenceMedia) state.project.referenceMedia = [];
        state.project.referenceMedia.push(ref);
        renderReferenceList();
        updateReferenceOverlaysTransform();
        saveHistoryState();
        showToast(`Imported "${file.name}" (Fitted to camera)`);
      };

      if (isVideo) {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.src = url;
        v.onloadedmetadata = () => {
          ref.width = v.videoWidth || 640;
          ref.height = v.videoHeight || 360;
          ref.duration = isFinite(v.duration) ? v.duration : null;
          finalize();
        };
        v.onerror = finalize;
      } else {
        const img = new Image();
        img.onload = () => {
          ref.width = img.naturalWidth || 640;
          ref.height = img.naturalHeight || 360;
          finalize();
        };
        img.onerror = finalize;
        img.src = url;
      }

      e.target.value = '';
    });
  }

  if (elements.btnCloseFloatingRef) {
    elements.btnCloseFloatingRef.addEventListener('click', () => {
      const floatRef = (state.project?.referenceMedia || []).find((r) => r.mode === 'floating');
      if (floatRef) floatRef.mode = 'overlay';
      renderReferenceList();
      updateReferenceOverlaysTransform();
      updateFloatingRefViewer();
    });
  }

  // Built-in Animation Guides (Walk Cycle & Timing Arcs)
  const createGuideCanvas = (type) => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 360;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 640, 360);

    if (type === 'walk') {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('WALK CYCLE GUIDE (8-POSE STANDARD)', 20, 30);

      // Draw ground line
      ctx.beginPath();
      ctx.moveTo(30, 300);
      ctx.lineTo(610, 300);
      ctx.strokeStyle = '#64748b';
      ctx.stroke();

      const poses = ['Contact', 'Down', 'Pass', 'Up', 'Contact', 'Down', 'Pass', 'Up'];
      poses.forEach((p, i) => {
        const x = 50 + i * 70;
        const headY = (i % 2 === 1) ? 140 : 120;
        // Head
        ctx.beginPath();
        ctx.arc(x, headY, 14, 0, Math.PI * 2);
        ctx.strokeStyle = '#38bdf8';
        ctx.stroke();
        // Torso
        ctx.beginPath();
        ctx.moveTo(x, headY + 14);
        ctx.lineTo(x, 220);
        ctx.stroke();
        // Legs
        ctx.beginPath();
        ctx.moveTo(x, 220);
        ctx.lineTo(x - 18, 300);
        ctx.moveTo(x, 220);
        ctx.lineTo(x + 18, 300);
        ctx.strokeStyle = '#818cf8';
        ctx.stroke();

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '10px monospace';
        ctx.fillText(p, x - 18, 325);
        ctx.fillText(`#${i + 1}`, x - 8, 340);
      });
    } else {
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 3;
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('TIMING ARCS & SQUASH / STRETCH', 20, 30);

      // Draw curved trajectory
      ctx.beginPath();
      ctx.moveTo(50, 260);
      ctx.quadraticCurveTo(320, 60, 590, 260);
      ctx.strokeStyle = '#a855f7';
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Squash and stretch balls
      const stops = [
        { x: 50, y: 260, rx: 24, ry: 10, rot: 0, label: 'Contact (Squash)' },
        { x: 140, y: 190, rx: 14, ry: 24, rot: -0.5, label: 'Stretch' },
        { x: 320, y: 110, rx: 18, ry: 18, rot: 0, label: 'Apex (Normal)' },
        { x: 500, y: 190, rx: 14, ry: 24, rot: 0.5, label: 'Stretch' },
        { x: 590, y: 260, rx: 24, ry: 10, rot: 0, label: 'Squash' },
      ];
      stops.forEach((s) => {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, s.rx, s.ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = '#f43f5e';
        ctx.fillStyle = 'rgba(244, 63, 94, 0.2)';
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '10px monospace';
        ctx.fillText(s.label, s.x - 30, s.y + 35);
      });
    }

    return c.toDataURL('image/png');
  };

  const addBuiltinGuide = (name, type) => {
    const dataUrl = createGuideCanvas(type);
    const ref = {
      id: `ref_guide_${Date.now()}`,
      name,
      type: 'image',
      url: dataUrl,
      visible: true,
      mode: 'overlay',
      opacity: 0.65,
      blendMode: 'screen',
      scale: 1,
      x: state.project.camera?.x || 640,
      y: state.project.camera?.y || 360,
      rotation: 0,
      flipH: false,
      flipV: false,
      locked: false,
      width: 640,
      height: 360,
      duration: null,
      timeOffset: 0,
      playbackRate: 1,
    };
    fitReferenceToCamera(ref);
    if (!state.project.referenceMedia) state.project.referenceMedia = [];
    state.project.referenceMedia.push(ref);
    renderReferenceList();
    updateReferenceOverlaysTransform();
    saveHistoryState();
    showToast(`Added built-in guide: ${name}`);
  };

  if (elements.btnAddWalkGuide) {
    elements.btnAddWalkGuide.addEventListener('click', () => addBuiltinGuide('Walk Cycle Guide', 'walk'));
  }
  if (elements.btnAddArcsGuide) {
    elements.btnAddArcsGuide.addEventListener('click', () => addBuiltinGuide('Timing Arcs Guide', 'arcs'));
  }

  window.addEventListener('resize', () => requestRender());
  setupCameraHandles(requestRender, renderTimelineFilmstrip);
  setupLayersInteractions();
  setupFloatingRefDragging();
  setupFilmstripScroll();
}
