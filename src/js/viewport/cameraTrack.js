// src/js/viewport/cameraTrack.js
/**
 * KEYFRAMED MULTIPLANE CAMERA SYSTEM
 * Interpolates Pan, Zoom, and Rotation across keyframes with cubic easing.
 */

import { state } from '../state/appState.js';
import { worldToScreen } from './camera.js';
import { showToast } from '../ui/toast.js';

export class CameraTrack {
  /**
   * Retrieves or initializes the project camera track data.
   */
  static getTrack(project) {
    if (!project) {
      return {
        enabled: false,
        keyframes: []
      };
    }
    if (!project.cameraTrack) {
      project.cameraTrack = {
        enabled: false,
        keyframes: [
          {
            frame: 0,
            x: project.width / 2,
            y: project.height / 2,
            scale: 1.0,
            rotation: 0.0,
            easing: 'easeInOut' // 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
          }
        ]
      };
    }
    return project.cameraTrack;
  }

  /**
   * Adds or updates a camera keyframe at the current timeline frame.
   */
  static setKeyframeAtCurrent(project, currentFrameIndex) {
    if (!project) return;
    const track = this.getTrack(project);
    track.enabled = true;
    const cam = project.camera || { x: project.width / 2, y: project.height / 2, scale: 1.0, rotation: 0.0 };

    const existingIdx = track.keyframes.findIndex((k) => k.frame === currentFrameIndex);
    const keyData = {
      frame: currentFrameIndex,
      x: cam.x,
      y: cam.y,
      scale: cam.scale || 1.0,
      rotation: cam.rotation || 0.0,
      easing: 'easeInOut'
    };

    if (existingIdx !== -1) {
      track.keyframes[existingIdx] = keyData;
      showToast(`Updated Camera Keyframe at Frame ${currentFrameIndex + 1}`);
    } else {
      track.keyframes.push(keyData);
      track.keyframes.sort((a, b) => a.frame - b.frame);
      showToast(`Added Camera Keyframe at Frame ${currentFrameIndex + 1} (◆)`);
    }
  }

  /**
   * Removes a camera keyframe if one exists on this frame.
   */
  static removeKeyframeAt(project, frameIndex) {
    if (!project) return;
    const track = this.getTrack(project);
    const initialLen = track.keyframes.length;
    track.keyframes = track.keyframes.filter((k) => k.frame !== frameIndex);
    if (track.keyframes.length < initialLen) {
      showToast(`Removed Camera Keyframe at Frame ${frameIndex + 1}`);
    }
  }

  /**
   * Evaluates the camera transform for any frame index using cubic easing.
   */
  static evaluate(project, frameIndex) {
    if (!project) {
      return { x: 400, y: 300, scale: 1, rotation: 0 };
    }
    const track = this.getTrack(project);

    // If keyframed camera is disabled or empty, return static camera
    if (!track.enabled || !track.keyframes || track.keyframes.length === 0) {
      return project.camera || { x: project.width / 2, y: project.height / 2, scale: 1, rotation: 0 };
    }

    const kfs = track.keyframes;

    // Single keyframe
    if (kfs.length === 1) {
      return { ...kfs[0] };
    }

    // Before first keyframe
    if (frameIndex <= kfs[0].frame) {
      return { ...kfs[0] };
    }

    // After last keyframe
    if (frameIndex >= kfs[kfs.length - 1].frame) {
      return { ...kfs[kfs.length - 1] };
    }

    // Find bounding keyframe span
    let prev = kfs[0];
    let next = kfs[1];
    for (let i = 0; i < kfs.length - 1; i++) {
      if (frameIndex >= kfs[i].frame && frameIndex <= kfs[i + 1].frame) {
        prev = kfs[i];
        next = kfs[i + 1];
        break;
      }
    }

    const span = next.frame - prev.frame;
    const progress = span === 0 ? 0 : (frameIndex - prev.frame) / span;

    // Apply cubic Bézier acceleration
    const t = this.applyEasing(progress, prev.easing || 'easeInOut');

    return {
      x: prev.x + (next.x - prev.x) * t,
      y: prev.y + (next.y - prev.y) * t,
      scale: prev.scale + (next.scale - prev.scale) * t,
      rotation: prev.rotation + (next.rotation - prev.rotation) * t
    };
  }

  static applyEasing(t, type) {
    switch (type) {
      case 'linear':
        return t;
      case 'easeIn':
        return t * t * t;
      case 'easeOut':
        return (--t) * t * t + 1;
      case 'easeInOut':
      default:
        return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
    }
  }

  /**
   * Renders the camera motion path trajectory on the canvas workspace.
   */
  static renderMotionPath(ctx, project) {
    if (!project) return;
    const track = this.getTrack(project);
    if (!track.enabled || !track.keyframes || track.keyframes.length < 2) return;

    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    const totalFrames = project.frames?.length || 12;

    // Sample camera path across timeline
    for (let f = 0; f < totalFrames; f += 1) {
      const cam = this.evaluate(project, f);
      const scr = worldToScreen(cam.x, cam.y);
      if (f === 0) ctx.moveTo(scr.x, scr.y);
      else ctx.lineTo(scr.x, scr.y);
    }
    ctx.stroke();

    // Render keyframe diamonds [◆]
    ctx.setLineDash([]);
    for (const kf of track.keyframes) {
      const scr = worldToScreen(kf.x, kf.y);
      ctx.fillStyle = '#f97316';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(scr.x, scr.y - 7);
      ctx.lineTo(scr.x + 7, scr.y);
      ctx.lineTo(scr.x, scr.y + 7);
      ctx.lineTo(scr.x - 7, scr.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }
}
