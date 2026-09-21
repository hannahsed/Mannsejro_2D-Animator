// src/js/audio/audioEngine.js
/**
 * AUDIO & LIP-SYNC ENGINE
 * Frame-accurate scrubbing and waveform display with pop-free gain envelopes.
 */

import { state } from '../state/appState.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.audioBuffer = null;
    this.peakData = null; // Pre-calculated downsampled peaks for 60fps waveform
    this.activeSource = null;
    this.activeGain = null;
    this.playStartTime = 0;
    this.playStartFrame = 0;
    this.fileName = '';
  }

  initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Loads and decodes an audio file (.mp3, .wav, .ogg).
   */
  async loadAudio(fileOrBlob) {
    this.initContext();
    if (!this.ctx) throw new Error('Web Audio API not supported in this environment');

    this.fileName = fileOrBlob.name || 'Audio Track';
    const arrayBuffer = await fileOrBlob.arrayBuffer();
    this.audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    
    // Pre-calculate waveform peak data
    this.precomputePeaks();
    return {
      duration: this.audioBuffer.duration,
      sampleRate: this.audioBuffer.sampleRate,
      name: this.fileName
    };
  }

  /**
   * Generates peak mipmap so drawing waveforms takes < 1ms regardless of track length.
   */
  precomputePeaks() {
    if (!this.audioBuffer) return;
    const channelData = this.audioBuffer.getChannelData(0); // Primary channel
    const totalSamples = channelData.length;
    const bins = 2000; // Resolution bins for smooth timeline rendering
    const step = Math.floor(totalSamples / bins);

    this.peakData = new Float32Array(bins);

    for (let i = 0; i < bins; i++) {
      let max = 0;
      const start = i * step;
      const end = Math.min(start + step, totalSamples);
      for (let j = start; j < end; j += 4) { // Sub-sample for fast calculation
        const abs = Math.abs(channelData[j]);
        if (abs > max) max = abs;
      }
      this.peakData[i] = max;
    }
  }

  /**
   * Frame-by-Frame Scrubbing:
   * Plays a micro-slice (single frame duration) with a smooth cosine gain
   * envelope to prevent speaker pops and clicks.
   */
  scrubToFrame(frameIndex, fps = 24) {
    if (!this.audioBuffer) return;
    this.initContext();
    if (!this.ctx) return;
    this.stopPlayback();

    const startTime = frameIndex / (fps || 24);
    if (startTime >= this.audioBuffer.duration) return;

    // Slice duration: 1 full frame plus 25ms overlap for audible phoneme context
    const sliceDuration = (1 / (fps || 24)) + 0.025;

    const source = this.ctx.createBufferSource();
    source.buffer = this.audioBuffer;

    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    // Pop-free envelope: quick 3ms attack, linear sustain, 5ms smooth cosine decay
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.85, now + 0.003);
    gain.gain.setValueAtTime(0.85, Math.max(now + 0.003, now + sliceDuration - 0.005));
    gain.gain.exponentialRampToValueAtTime(0.001, now + sliceDuration);

    source.connect(gain);
    gain.connect(this.ctx.destination);

    source.start(now, startTime, sliceDuration);
    this.activeSource = source;
    this.activeGain = gain;
  }

  /**
   * Synchronized Timeline Playback
   */
  startPlayback(startFrame, fps = 24) {
    if (!this.audioBuffer) return;
    this.initContext();
    if (!this.ctx) return;
    this.stopPlayback();

    const offsetSeconds = startFrame / (fps || 24);
    if (offsetSeconds >= this.audioBuffer.duration) return;

    const source = this.ctx.createBufferSource();
    source.buffer = this.audioBuffer;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(1.0, this.ctx.currentTime);

    source.connect(gain);
    gain.connect(this.ctx.destination);

    source.start(0, offsetSeconds);
    this.activeSource = source;
    this.activeGain = gain;
    this.playStartTime = this.ctx.currentTime;
    this.playStartFrame = startFrame;
  }

  stopPlayback() {
    if (this.activeSource) {
      try {
        this.activeSource.stop();
        this.activeSource.disconnect();
      } catch (e) {}
      this.activeSource = null;
    }
    if (this.activeGain) {
      try {
        this.activeGain.disconnect();
      } catch (e) {}
      this.activeGain = null;
    }
  }

  /**
   * Renders the waveform visually into a canvas element below the filmstrip.
   */
  renderWaveformToCanvas(canvas, totalFrames = 12, fps = 24, currentFrame = 0) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width || canvas.width || 300));
    const h = Math.max(1, Math.round(rect.height || canvas.height || 24));

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Background track
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(0, 0, w, h);

    const midY = h / 2;

    if (this.peakData && this.audioBuffer) {
      const totalSeconds = (totalFrames || 1) / (fps || 24);
      const audioSeconds = this.audioBuffer.duration;

      // Draw waveform bars
      ctx.fillStyle = '#f97316'; // Brand Flame Orange
      const barCount = this.peakData.length;
      const widthFactor = (audioSeconds / totalSeconds);

      ctx.beginPath();
      for (let i = 0; i < barCount; i++) {
        const peak = this.peakData[i];
        const x = (i / barCount) * (w * widthFactor);
        if (x > w) break;

        const barHeight = Math.max(1, peak * (h * 0.85));
        ctx.rect(x, midY - barHeight / 2, Math.max(1, (w / barCount) * widthFactor), barHeight);
      }
      ctx.fill();
    } else {
      // Empty waveform placeholder track
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Import Audio (.mp3, .wav) for Lip-Sync Dialogue Waveform', w / 2, midY);
    }

    // Center baseline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    // Current playhead position
    if (totalFrames > 0) {
      const playheadX = (currentFrame / totalFrames) * w;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();
    }

    ctx.restore();
  }
}

export const audioEngine = new AudioEngine();
