// src/js/viewport/stylusHardware.js
/**
 * 240Hz HARDWARE STYLUS DISPATCHER
 * Eliminates curve faceting on fast tablet strokes.
 */

import { state } from '../state/appState.js';
import { screenToWorld } from './camera.js';
import { dualStabilizer } from './dualStabilizer.js';

export class StylusHardwareEngine {
  constructor(canvasContainer, onProcessPoint) {
    this.container = canvasContainer;
    this.onProcessPoint = onProcessPoint;
    this.activePointerId = null;
    this.init();
  }

  init() {
    if (!this.container) return;
    // Disable default browser touch / panning gestures on the drawing canvas
    this.container.style.touchAction = 'none';

    // Prevent Windows Ink from arbitrating a "Press and Hold" right-click
    this.container.addEventListener('MSHoldVisual', (e) => e.preventDefault());
    this.container.addEventListener('contextmenu', (e) => {
      if (state.isDrawing) e.preventDefault();
    });
  }

  /**
   * Processes a raw pointermove event, extracting sub-frame coalesced points.
   */
  handlePointerMove(e) {
    if (!state.isDrawing) return [];

    // Extract all hardware points buffered by the digitizer since the last frame
    const events = typeof e.getCoalescedEvents === 'function' 
      ? e.getCoalescedEvents() 
      : [e];

    const processedPoints = [];

    for (const subEvent of events) {
      const world = screenToWorld(subEvent.clientX, subEvent.clientY);
      const pressure = this.extractPressure(e, subEvent, world);
      this.lastPoint = { ...world };

      const isEraser = e.pointerType === 'eraser' || 
                       subEvent.pointerType === 'eraser' || 
                       (typeof e.buttons === 'number' && (e.buttons & 32) !== 0);

      const rawPt = {
        x: world.x,
        y: world.y,
        pressure,
        isEraser,
        tiltX: subEvent.tiltX || 0,
        tiltY: subEvent.tiltY || 0,
        twist: subEvent.twist || 0
      };

      // Run through dual-stage stabilization engine
      const stabilized = dualStabilizer.process(rawPt, state.toolSettings);
      processedPoints.push(stabilized);
      if (typeof this.onProcessPoint === 'function') {
        this.onProcessPoint(stabilized);
      }
    }

    return processedPoints;
  }

  extractPressure(e, subEvent, worldPt) {
    if (!state.toolSettings.pressure) return 1.0;

    const sub = subEvent || e;
    
    // Hardware Stylus Digitizer
    if ((e.pointerType === 'pen' || sub.pointerType === 'pen') && typeof sub.pressure === 'number' && sub.pressure > 0) {
      const gamma = state.toolSettings.pressureCurve ?? 0.8;
      return Math.pow(Math.max(0.02, Math.min(1.0, sub.pressure)), gamma);
    }

    // Mouse / Trackpad: derive dynamic pressure from stroke velocity
    if (this.lastPoint && worldPt) {
      const dist = Math.hypot(worldPt.x - this.lastPoint.x, worldPt.y - this.lastPoint.y);
      const speed = Math.min(50, dist);
      // Fast movements taper down; slow steady strokes deposit heavier weight
      return Math.max(0.25, 1.1 - (speed / 50) * 0.6);
    }
    return 0.75;
  }
}
