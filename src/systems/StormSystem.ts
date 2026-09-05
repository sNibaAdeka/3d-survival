import * as THREE from 'three';
import { ARENA_RADIUS, STORM_DAMAGE_PER_SECOND, STORM_START_RADIUS } from './constants';
import { randRange, randomPointInCircle } from './utils';
import { World } from './World';

export class StormSystem {
  readonly center = new THREE.Vector3();
  radius = STORM_START_RADIUS;
  damagePerSecond = STORM_DAMAGE_PER_SECOND;
  private readonly line: THREE.LineLoop;
  private waitRemaining = 20;
  private shrinkRemaining = 0;
  private shrinkDuration = 0;
  private startRadius = STORM_START_RADIUS;
  private targetRadius = STORM_START_RADIUS;
  private readonly startCenter = new THREE.Vector3();
  private readonly targetCenter = new THREE.Vector3();
  private stage = 0;

  constructor(private readonly scene: THREE.Scene, private readonly world: World) {
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array(128 * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    const material = new THREE.LineBasicMaterial({ color: '#57d2ff', transparent: true, opacity: 0.95 });
    this.line = new THREE.LineLoop(geometry, material);
    this.line.userData.kind = 'storm';
    scene.add(this.line);
  }

  reset(): void {
    this.center.set(0, 0, 0);
    this.radius = STORM_START_RADIUS;
    this.waitRemaining = 20;
    this.shrinkRemaining = 0;
    this.shrinkDuration = 0;
    this.startRadius = STORM_START_RADIUS;
    this.targetRadius = STORM_START_RADIUS;
    this.startCenter.copy(this.center);
    this.targetCenter.copy(this.center);
    this.stage = 0;
    this.updateLine();
  }

  update(dt: number): void {
    if (this.shrinkRemaining > 0) {
      this.shrinkRemaining = Math.max(0, this.shrinkRemaining - dt);
      const t = 1 - this.shrinkRemaining / this.shrinkDuration;
      this.radius = THREE.MathUtils.lerp(this.startRadius, this.targetRadius, t);
      this.center.lerpVectors(this.startCenter, this.targetCenter, t);
      if (this.shrinkRemaining === 0) {
        this.waitRemaining = Math.max(8, 24 - this.stage * 3);
      }
    } else {
      this.waitRemaining -= dt;
      if (this.waitRemaining <= 0 && this.radius > 16) {
        this.beginShrink();
      }
    }
    this.updateLine();
  }

  isOutside(position: THREE.Vector3): boolean {
    return Math.hypot(position.x - this.center.x, position.z - this.center.z) > this.radius;
  }

  distanceToEdge(position: THREE.Vector3): number {
    return this.radius - Math.hypot(position.x - this.center.x, position.z - this.center.z);
  }

  phaseText(): string {
    if (this.shrinkRemaining > 0) {
      return `Storm ${Math.ceil(this.shrinkRemaining)}s`;
    }
    return `Next ${Math.ceil(Math.max(0, this.waitRemaining))}s`;
  }

  private beginShrink(): void {
    this.stage += 1;
    this.startRadius = this.radius;
    this.targetRadius = Math.max(14, this.radius * randRange(0.58, 0.72));
    this.startCenter.copy(this.center);
    const offset = randomPointInCircle(Math.min(ARENA_RADIUS * 0.28, this.targetRadius * 0.55));
    this.targetCenter.copy(this.center).add(offset);
    this.targetCenter.x = THREE.MathUtils.clamp(this.targetCenter.x, -ARENA_RADIUS * 0.45, ARENA_RADIUS * 0.45);
    this.targetCenter.z = THREE.MathUtils.clamp(this.targetCenter.z, -ARENA_RADIUS * 0.45, ARENA_RADIUS * 0.45);
    this.shrinkDuration = Math.max(12, 22 - this.stage * 1.5);
    this.shrinkRemaining = this.shrinkDuration;
    this.damagePerSecond = STORM_DAMAGE_PER_SECOND + this.stage * 1.6;
  }

  private updateLine(): void {
    const attribute = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < 128; i += 1) {
      const theta = (i / 128) * Math.PI * 2;
      const x = this.center.x + Math.cos(theta) * this.radius;
      const z = this.center.z + Math.sin(theta) * this.radius;
      const y = this.world.heightAt(x, z) + 0.45;
      attribute.setXYZ(i, x, y, z);
    }
    attribute.needsUpdate = true;
  }
}
