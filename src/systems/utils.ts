import * as THREE from 'three';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randInt(min: number, max: number): number {
  return Math.floor(randRange(min, max + 1));
}

export function choose<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function snap(value: number, size: number): number {
  return Math.round(value / size) * size;
}

export function distanceXZ(a: THREE.Vector3, b: THREE.Vector3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function directionXZ(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 {
  const dir = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
  if (dir.lengthSq() > 0.0001) {
    dir.normalize();
  }
  return dir;
}

export function normalizeAngle(angle: number): number {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

export function lerpAngle(from: number, to: number, t: number): number {
  return from + normalizeAngle(to - from) * t;
}

export function randomPointInCircle(radius: number): THREE.Vector3 {
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.sqrt(Math.random()) * radius;
  return new THREE.Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
}

export function applySpread(direction: THREE.Vector3, spread: number): THREE.Vector3 {
  const base = direction.clone().normalize();
  const helper = Math.abs(base.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(base, helper).normalize();
  const up = new THREE.Vector3().crossVectors(right, base).normalize();
  const radius = Math.sqrt(Math.random()) * spread;
  const theta = Math.random() * Math.PI * 2;
  return base
    .addScaledVector(right, Math.cos(theta) * radius)
    .addScaledVector(up, Math.sin(theta) * radius)
    .normalize();
}

export function boxOverlaps(aCenter: THREE.Vector3, aSize: THREE.Vector3, bCenter: THREE.Vector3, bSize: THREE.Vector3): boolean {
  return (
    Math.abs(aCenter.x - bCenter.x) <= (aSize.x + bSize.x) * 0.5 &&
    Math.abs(aCenter.y - bCenter.y) <= (aSize.y + bSize.y) * 0.5 &&
    Math.abs(aCenter.z - bCenter.z) <= (aSize.z + bSize.z) * 0.5
  );
}
