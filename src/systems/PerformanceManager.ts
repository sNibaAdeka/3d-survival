import * as THREE from 'three';
import type { Quality } from './types';

export class PerformanceManager {
  quality: Quality = 'medium';
  fps = 60;
  private sample = 60;
  private basePixelRatio = 1;
  private activePixelRatio = 1;
  private lowFpsTime = 0;
  private highFpsTime = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer) {}

  setQuality(quality: Quality): void {
    this.quality = quality;
    this.basePixelRatio = quality === 'high' ? Math.min(window.devicePixelRatio, 1.6) : quality === 'medium' ? 1 : 0.75;
    this.activePixelRatio = this.basePixelRatio;
    this.renderer.setPixelRatio(this.activePixelRatio);
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.lowFpsTime = 0;
    this.highFpsTime = 0;
  }

  update(dt: number): void {
    const instant = 1 / Math.max(dt, 0.0001);
    this.sample = this.sample * 0.94 + instant * 0.06;
    this.fps = Math.round(this.sample);

    if (this.quality === 'high') return;

    if (this.sample < 44) {
      this.lowFpsTime += dt;
      this.highFpsTime = 0;
      if (this.lowFpsTime > 2.5 && this.activePixelRatio > 0.65) {
        this.activePixelRatio = Math.max(0.65, this.activePixelRatio - 0.1);
        this.renderer.setPixelRatio(this.activePixelRatio);
        this.lowFpsTime = 0;
      }
    } else if (this.sample > 57 && this.activePixelRatio < this.basePixelRatio) {
      this.highFpsTime += dt;
      this.lowFpsTime = 0;
      if (this.highFpsTime > 5) {
        this.activePixelRatio = Math.min(this.basePixelRatio, this.activePixelRatio + 0.1);
        this.renderer.setPixelRatio(this.activePixelRatio);
        this.highFpsTime = 0;
      }
    } else {
      this.lowFpsTime = 0;
      this.highFpsTime = 0;
    }
  }
}
