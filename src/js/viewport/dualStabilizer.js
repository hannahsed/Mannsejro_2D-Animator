// src/js/viewport/dualStabilizer.js
import { state } from '../state/appState.js';

/**
 * VELOCITY-COMPENSATED DUAL-STAGE STREAMLINE STABILIZER
 * Stage 1: Dynamic Tremor Filter (Adaptive Exponential Moving Average)
 * Stage 2: Inertial Elastic Spring Damper (Silky Arc Pull-String)
 */
export class DualStabilizer {
  constructor() {
    this.history = [];
    this.stage1Pt = null;
    this.stage2Pt = null;
    this.rawPointer = null;
    this.velocity = { x: 0, y: 0 };
    this.lastTime = 0;
  }

  reset(startWorldPt) {
    if (startWorldPt && typeof startWorldPt.x === 'number' && typeof startWorldPt.y === 'number') {
      const init = {
        x: startWorldPt.x,
        y: startWorldPt.y,
        pressure: startWorldPt.pressure ?? 0.75,
      };
      this.stage1Pt = { ...init };
      this.stage2Pt = { ...init };
      this.rawPointer = { ...init };
      this.history = [{ ...init }];
    } else {
      this.stage1Pt = null;
      this.stage2Pt = null;
      this.rawPointer = null;
      this.history = [];
    }
    this.velocity = { x: 0, y: 0 };
    this.lastTime = performance.now();
  }

  /**
   * Processes a raw stylus/mouse point into a smooth, steady stabilized coordinate.
   */
  process(rawPt, settings = {}) {
    this.rawPointer = { ...rawPt };

    if (!this.stage1Pt || !this.stage2Pt) {
      this.reset(rawPt);
      return { ...rawPt };
    }

    const now = performance.now();
    const dt = Math.max(1, Math.min(32, now - (this.lastTime || now)));
    this.lastTime = now;

    // Decent default smoothing: 0.60 (60%)
    const smoothingLevel = Math.max(0, Math.min(0.95, settings.smoothing ?? 0.60));

    if (smoothingLevel <= 0.02) {
      this.stage1Pt = { ...rawPt };
      this.stage2Pt = { ...rawPt };
      return { ...rawPt };
    }

    const dx = rawPt.x - this.stage1Pt.x;
    const dy = rawPt.y - this.stage1Pt.y;
    const dist = Math.hypot(dx, dy);
    const speed = dist / dt; // world units per ms

    // Velocity compensation: fast flicks remain responsive, slow lines get maximum smoothing
    const speedFactor = Math.min(1, speed / 3.0);
    const adaptiveSmoothing = smoothingLevel * (1 - speedFactor * 0.45);

    // Stage 1: Exponential Tremor Filter
    const k1 = Math.max(0.08, 1 - Math.pow(adaptiveSmoothing, 0.65));
    this.stage1Pt.x += dx * k1;
    this.stage1Pt.y += dy * k1;

    const rawPres = rawPt.pressure ?? 0.75;
    this.stage1Pt.pressure += (rawPres - this.stage1Pt.pressure) * 0.35;

    // Stage 2: Inertial Elastic Spring Damper
    const s2Weight = Math.min(0.85, smoothingLevel * 1.1);
    const springK = Math.max(0.12, 1 - s2Weight);

    const s2dx = this.stage1Pt.x - this.stage2Pt.x;
    const s2dy = this.stage1Pt.y - this.stage2Pt.y;

    this.velocity.x = (this.velocity.x + s2dx * springK) * 0.45;
    this.velocity.y = (this.velocity.y + s2dy * springK) * 0.45;

    this.stage2Pt.x += this.velocity.x;
    this.stage2Pt.y += this.velocity.y;
    this.stage2Pt.pressure = this.stage1Pt.pressure;

    return {
      x: this.stage2Pt.x,
      y: this.stage2Pt.y,
      pressure: this.stage2Pt.pressure,
    };
  }

  /**
   * Catches up the lagging pen tip smoothly to release point without angular fishhook kinks.
   */
  flush() {
    if (!this.rawPointer || !this.stage2Pt) return [];

    const steps = [];
    const dx = this.rawPointer.x - this.stage2Pt.x;
    const dy = this.rawPointer.y - this.stage2Pt.y;
    const totalDist = Math.hypot(dx, dy);

    if (totalDist > 0.8) {
      // Limit count and follow exiting momentum tangent
      const count = Math.min(4, Math.max(2, Math.ceil(totalDist / 6)));
      const pStartPres = this.stage2Pt.pressure ?? 0.75;
      const pEndPres = this.rawPointer.pressure ?? pStartPres;

      const vx = this.velocity ? this.velocity.x * 2 : dx / count;
      const vy = this.velocity ? this.velocity.y * 2 : dy / count;

      for (let i = 1; i <= count; i++) {
        const t = i / count;
        // Cubic Hermite transition respecting velocity tangent
        const t2 = t * t;
        const t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;

        const x = h00 * this.stage2Pt.x + h10 * vx + h01 * this.rawPointer.x;
        const y = h00 * this.stage2Pt.y + h10 * vy + h01 * this.rawPointer.y;
        const pressure = pStartPres + (pEndPres - pStartPres) * t;

        steps.push({ x, y, pressure });
      }
      this.stage2Pt.x = this.rawPointer.x;
      this.stage2Pt.y = this.rawPointer.y;
    }

    return steps;
  }
}

export const dualStabilizer = new DualStabilizer();
