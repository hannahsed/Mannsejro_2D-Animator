// src/js/viewport/touchGestures.js
/**
 * MULTI-TOUCH GESTURE ENGINE
 * Two-finger pinch, pan, 2-finger Undo, 3-finger Redo.
 */

import { state } from '../state/appState.js';
import { zoomAtPointer } from './camera.js';
import { requestRender } from '../render/renderEngine.js';
import { commandManager } from '../project/commandManager.js';
import { clearStrokePreview } from '../render/strokeRenderer.js';
import { showToast } from '../ui/toast.js';

export class TouchGestureEngine {
  constructor(canvasContainer) {
    this.container = canvasContainer;
    this.activeTouches = new Map(); // id -> { x, y }
    this.gestureStartDist = 0;
    this.gestureStartZoom = 1;
    this.gestureMidpoint = { x: 0, y: 0 };
    this.isGesturing = false;

    this.touchStartTime = 0;
    this.maxTouchesInGesture = 0;
    this.hasMovedSignificantly = false;

    this.init();
  }

  init() {
    if (!this.container) return;
    this.container.addEventListener('pointerdown', (e) => this.onPointerDown(e), { passive: false });
    window.addEventListener('pointermove', (e) => this.onPointerMove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.onPointerUp(e), { passive: false });
    window.addEventListener('pointercancel', (e) => this.onPointerUp(e), { passive: false });
  }

  onPointerDown(e) {
    if (e.pointerType !== 'touch') return;

    this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activeTouches.size === 1) {
      this.touchStartTime = performance.now();
      this.maxTouchesInGesture = 1;
      this.hasMovedSignificantly = false;
    } else if (this.activeTouches.size === 2) {
      // Two fingers: abort in-flight stroke immediately
      if (state.isDrawing) {
        state.isDrawing = false;
        state.strokePoints = [];
        clearStrokePreview();
      }

      this.isGesturing = true;
      this.maxTouchesInGesture = Math.max(this.maxTouchesInGesture, 2);

      const [t1, t2] = Array.from(this.activeTouches.values());
      this.gestureStartDist = Math.hypot(t2.x - t1.x, t2.y - t1.y);
      this.gestureStartZoom = state.zoom;
      this.gestureMidpoint = {
        x: (t1.x + t2.x) / 2,
        y: (t1.y + t2.y) / 2
      };
    } else if (this.activeTouches.size === 3) {
      this.maxTouchesInGesture = Math.max(this.maxTouchesInGesture, 3);
    }
  }

  onPointerMove(e) {
    if (e.pointerType !== 'touch' || !this.activeTouches.has(e.pointerId)) return;

    this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activeTouches.size === 2 && this.isGesturing) {
      e.preventDefault();
      const [t1, t2] = Array.from(this.activeTouches.values());
      const currentDist = Math.hypot(t2.x - t1.x, t2.y - t1.y);
      const currentMid = {
        x: (t1.x + t2.x) / 2,
        y: (t1.y + t2.y) / 2
      };

      if (Math.abs(currentDist - this.gestureStartDist) > 10 || Math.hypot(currentMid.x - this.gestureMidpoint.x, currentMid.y - this.gestureMidpoint.y) > 8) {
        this.hasMovedSignificantly = true;
      }

      // 1. Two-finger Pan
      const dx = currentMid.x - this.gestureMidpoint.x;
      const dy = currentMid.y - this.gestureMidpoint.y;
      state.pan.x += dx;
      state.pan.y += dy;
      this.gestureMidpoint = currentMid;

      // 2. Two-finger Pinch-to-Zoom
      if (this.gestureStartDist > 0) {
        const scaleFactor = currentDist / this.gestureStartDist;
        const targetZoom = this.gestureStartZoom * scaleFactor;
        zoomAtPointer(currentMid.x, currentMid.y, targetZoom, null);
      }

      requestRender();
    }
  }

  onPointerUp(e) {
    if (e.pointerType !== 'touch') return;

    this.activeTouches.delete(e.pointerId);

    // If all fingers have lifted, evaluate quick tap gesture shortcuts
    if (this.activeTouches.size === 0) {
      const duration = performance.now() - this.touchStartTime;

      if (!this.hasMovedSignificantly && duration < 300) {
        if (this.maxTouchesInGesture === 2) {
          // TWO-FINGER TAP: UNDO (Industry Standard)
          commandManager.undo();
          showToast('↺ Undo (Two-Finger Tap)');
        } else if (this.maxTouchesInGesture === 3) {
          // THREE-FINGER TAP: REDO (Industry Standard)
          commandManager.redo();
          showToast('↻ Redo (Three-Finger Tap)');
        }
      }

      this.isGesturing = false;
      this.maxTouchesInGesture = 0;
      this.hasMovedSignificantly = false;
    }
  }
}
