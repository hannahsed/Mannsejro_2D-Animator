// src/js/viewport/dualStabilizer.js
/**
 * DUAL-STAGE ASSISTANT STABILIZER
 * Stage 1: Adaptive Exponential Streamline (High-frequency tremor filter)
 * Stage 2: Heavy Inertial Leash Damper (Low-frequency arc stabilizer / Pulled String)
 */

export class DualStabilizer {
  constructor() {
    this.stage1Pt = null;       // Output of Streamline
    this.stage2Pt = null;       // Output of Inertial Leash (Pen Tip)
    this.rawPointer = null;     // Actual hardware cursor
    this.velocity = { x: 0, y: 0 };
  }

  reset(startWorldPt) {
    this.stage1Pt = { ...startWorldPt };
    this.stage2Pt = { ...startWorldPt };
    this.rawPointer = { ...startWorldPt };
    this.velocity = { x: 0, y: 0 };
  }

  /**
   * Processes a raw input coordinate through both stabilizer stages.
   * @param {Object} rawPt - { x, y, pressure }
   * @param {Object} settings - Tool settings with both stabilizers
   */
  process(rawPt, settings) {
    this.rawPointer = { ...rawPt };

    if (!this.stage1Pt || !this.stage2Pt) {
      this.reset(rawPt);
      return rawPt;
    }

    // ========================================================
    // STAGE 1: Adaptive Streamline (EMA Tremor Filter)
    // ========================================================
    const s1Strength = Math.max(0, Math.min(0.96, settings.smoothing ?? 0.5));
    const k1 = 1 - Math.pow(s1Strength, 0.7);

    this.stage1Pt = {
      x: this.stage1Pt.x + (rawPt.x - this.stage1Pt.x) * k1,
      y: this.stage1Pt.y + (rawPt.y - this.stage1Pt.y) * k1,
      pressure: rawPt.pressure ?? 1,
    };

    // If Assistant (Stage 2) is disabled, return Stage 1 directly
    if (!settings.assistantStabilizer) {
      this.stage2Pt = { ...this.stage1Pt };
      return this.stage1Pt;
    }

    // ========================================================
    // STAGE 2: Inertial Leash Damper (Weighted Pull-String)
    // ========================================================
    const leashRadius = settings.leashRadius ?? 16;      // Elastic string length
    const massWeight = settings.assistantWeight ?? 0.65; // 0 (light) to 0.95 (heavy mass)

    const dx = this.stage1Pt.x - this.stage2Pt.x;
    const dy = this.stage1Pt.y - this.stage2Pt.y;
    const dist = Math.hypot(dx, dy);

    if (dist > leashRadius) {
      // Pull pen tip towards the edge of the taut leash
      const angle = Math.atan2(dy, dx);
      const targetX = this.stage1Pt.x - Math.cos(angle) * leashRadius;
      const targetY = this.stage1Pt.y - Math.sin(angle) * leashRadius;

      // Spring-mass inertia with friction damping
      const friction = Math.max(0.05, 1 - massWeight * 0.92);
      this.velocity.x += (targetX - this.stage2Pt.x) * friction;
      this.velocity.y += (targetY - this.stage2Pt.y) * friction;

      this.stage2Pt.x += this.velocity.x;
      this.stage2Pt.y += this.velocity.y;

      // Damping velocity falloff
      this.velocity.x *= 0.35;
      this.velocity.y *= 0.35;
    } else {
      // Inside the deadzone: apply heavy resting drag
      this.velocity.x *= 0.1;
      this.velocity.y *= 0.1;
    }

    this.stage2Pt.pressure = this.stage1Pt.pressure;
    return { ...this.stage2Pt };
  }

  /**
   * Renders the visible elastic leash string guide on the stroke canvas.
   */
  renderGuide(ctx) {
    if (!this.rawPointer || !this.stage2Pt) return;

    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.85)'; // Flame Orange guide

    // Draw leash from current pen tip to raw cursor location
    ctx.moveTo(this.stage2Pt.x, this.stage2Pt.y);
    ctx.lineTo(this.rawPointer.x, this.rawPointer.y);
    ctx.stroke();

    // Draw leash tip anchor circle
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(249, 115, 22, 0.9)';
    ctx.beginPath();
    ctx.arc(this.stage2Pt.x, this.stage2Pt.y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

export const dualStabilizer = new DualStabilizer();
