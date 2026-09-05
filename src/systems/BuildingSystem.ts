import * as THREE from 'three';
import { BUILD_COST, GRID_SIZE } from './constants';
import type { BuildPiece, BuildPieceType, SolidBox } from './types';
import { boxOverlaps, clamp, snap } from './utils';
import { World } from './World';
import { Player } from './Player';
import { CameraController } from './CameraController';

const BUILD_ORDER: BuildPieceType[] = ['wall', 'floor', 'ramp', 'roof'];

interface BuildPreview {
  position: THREE.Vector3;
  rotationY: number;
  box: SolidBox;
}

export interface BuildPlacementResult {
  placed: boolean;
  reason?: string;
}

export class BuildingSystem {
  active = false;
  pieceType: BuildPieceType = 'wall';
  private ghost: THREE.Mesh | null = null;
  private readonly ghostMaterial = new THREE.MeshStandardMaterial({
    color: '#74e1ff',
    transparent: true,
    opacity: 0.44,
    roughness: 0.45,
    depthWrite: false
  });
  private readonly materials: Record<BuildPieceType, THREE.MeshStandardMaterial> = {
    wall: new THREE.MeshStandardMaterial({ color: '#b9895f', roughness: 0.78 }),
    floor: new THREE.MeshStandardMaterial({ color: '#6fa8b8', roughness: 0.72 }),
    ramp: new THREE.MeshStandardMaterial({ color: '#d2a068', roughness: 0.74 }),
    roof: new THREE.MeshStandardMaterial({ color: '#8ebf71', roughness: 0.74 })
  };
  private readonly geometries: Record<BuildPieceType, THREE.BufferGeometry> = {
    wall: new THREE.BoxGeometry(4, 4, 0.35),
    floor: new THREE.BoxGeometry(4, 0.28, 4),
    ramp: new THREE.BoxGeometry(4, 0.35, 5.1),
    roof: new THREE.ConeGeometry(2.85, 1.8, 4)
  };
  private preview: BuildPreview | null = null;

  constructor(private readonly scene: THREE.Scene, private readonly world: World) {}

  reset(): void {
    this.active = false;
    this.pieceType = 'wall';
    this.preview = null;
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.ghost = null;
    }
  }

  toggle(): void {
    this.active = !this.active;
    if (!this.active && this.ghost) {
      this.ghost.visible = false;
    }
  }

  setPiece(type: BuildPieceType): void {
    if (this.pieceType === type) return;
    this.pieceType = type;
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.ghost = null;
    }
  }

  cyclePiece(direction: number): void {
    const index = BUILD_ORDER.indexOf(this.pieceType);
    const next = (index + direction + BUILD_ORDER.length) % BUILD_ORDER.length;
    this.setPiece(BUILD_ORDER[next]);
  }

  update(camera: CameraController, player: Player): void {
    if (!this.active || !player.alive) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }

    if (!this.ghost) {
      this.ghost = new THREE.Mesh(this.geometries[this.pieceType], this.ghostMaterial);
      this.ghost.castShadow = false;
      this.ghost.receiveShadow = false;
      this.scene.add(this.ghost);
    }

    const point = this.findPlacementPoint(camera, player);
    const rotationY = Math.round(camera.yaw / (Math.PI * 0.5)) * Math.PI * 0.5;
    this.preview = this.computePreview(this.pieceType, point, rotationY);
    const canPlace = this.canPlace(player);

    this.ghost.position.copy(this.preview.position);
    this.ghost.rotation.set(this.pieceType === 'ramp' ? -0.56 : 0, rotationY, 0);
    this.ghost.visible = true;
    this.ghostMaterial.color.set(canPlace ? '#74e1ff' : '#ff6572');
  }

  placeFromPreview(player: Player): BuildPlacementResult {
    const blocked = this.getBlockReason(player);
    if (blocked) return { placed: false, reason: blocked };

    player.materials -= BUILD_COST;
    if (!this.preview || !this.placePiece(this.pieceType, this.preview.position, this.preview.rotationY)) {
      player.materials += BUILD_COST;
      return { placed: false, reason: 'Blocked' };
    }
    return { placed: true };
  }

  placeBotWall(botPosition: THREE.Vector3, targetPosition: THREE.Vector3): boolean {
    const direction = targetPosition.clone().sub(botPosition);
    direction.y = 0;
    if (direction.lengthSq() < 0.001) return false;
    direction.normalize();
    const point = botPosition.clone().addScaledVector(direction, 2.8);
    point.x = snap(point.x, GRID_SIZE);
    point.z = snap(point.z, GRID_SIZE);
    point.y = this.world.heightAt(point.x, point.z);
    const rotationY = Math.atan2(direction.x, direction.z);
    const preview = this.computePreview('wall', point, rotationY);
    if (this.world.boxOverlapsSolid(preview.box)) {
      return false;
    }
    return this.placePiece('wall', preview.position, rotationY);
  }

  damagePiece(piece: BuildPiece, amount: number): boolean {
    piece.health -= amount;
    const healthRatio = clamp(piece.health / piece.maxHealth, 0, 1);
    const material = Array.isArray(piece.mesh.material) ? piece.mesh.material[0] : piece.mesh.material;
    material.opacity = 0.48 + healthRatio * 0.52;
    material.transparent = healthRatio < 1;
    if (piece.health <= 0) {
      this.world.removeBuildPiece(piece);
      return true;
    }
    return false;
  }

  private canPlace(player: Player): boolean {
    return this.getBlockReason(player) === null;
  }

  private getBlockReason(player: Player): string | null {
    if (!this.active || !this.preview) return 'No preview';
    if (player.materials < BUILD_COST) return 'Low materials';
    const distance = player.position.distanceTo(this.preview.position);
    if (distance > 24) return 'Too far';
    if (distance < 1.5) return 'Too close';
    if (this.world.boxOverlapsSolid(this.preview.box)) return 'Blocked';
    return null;
  }

  private placePiece(type: BuildPieceType, position: THREE.Vector3, rotationY: number): boolean {
    const preview = this.computePreview(type, position, rotationY);
    if (this.world.boxOverlapsSolid(preview.box)) {
      return false;
    }

    const mesh = new THREE.Mesh(this.geometries[type], this.materials[type].clone());
    mesh.position.copy(preview.position);
    mesh.rotation.set(type === 'ramp' ? -0.56 : 0, rotationY, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.disposeGeometry = false;
    this.scene.add(mesh);

    const piece: BuildPiece = {
      type,
      mesh,
      box: preview.box,
      health: type === 'wall' ? 115 : 95,
      maxHealth: type === 'wall' ? 115 : 95
    };
    this.world.addBuildPiece(piece);
    return true;
  }

  private findPlacementPoint(camera: CameraController, player: Player): THREE.Vector3 {
    const origin = camera.camera.position;
    const direction = camera.viewDirection();
    const point = new THREE.Vector3();

    for (let distance = 4; distance <= 58; distance += 1.25) {
      point.copy(origin).addScaledVector(direction, distance);
      const ground = this.world.heightAt(point.x, point.z);
      if (point.y <= ground + 0.35) {
        point.y = ground;
        break;
      }
    }

    if (point.y > this.world.heightAt(point.x, point.z) + 0.6) {
      const fallback = camera.viewDirection();
      fallback.y = 0;
      if (fallback.lengthSq() < 0.001) fallback.set(0, 0, 1);
      fallback.normalize();
      point.copy(player.position).addScaledVector(fallback, 9);
      point.y = this.world.heightAt(point.x, point.z);
    }

    if (player.position.distanceTo(point) > 20) {
      const fallback = camera.viewDirection();
      fallback.y = 0;
      if (fallback.lengthSq() < 0.001) fallback.set(0, 0, 1);
      fallback.normalize();
      point.copy(player.position).addScaledVector(fallback, 10);
      point.y = this.world.heightAt(point.x, point.z);
    }

    point.x = snap(point.x, GRID_SIZE);
    point.z = snap(point.z, GRID_SIZE);
    point.y = this.world.heightAt(point.x, point.z);
    return point;
  }

  private computePreview(type: BuildPieceType, groundPoint: THREE.Vector3, rotationY: number): BuildPreview {
    const position = groundPoint.clone();
    const axisSwapped = Math.abs(Math.sin(rotationY)) > 0.65;
    const size = new THREE.Vector3();

    if (type === 'wall') {
      size.set(axisSwapped ? 0.38 : 4, 4, axisSwapped ? 4 : 0.38);
      position.y += 2;
    } else if (type === 'floor') {
      size.set(4, 0.28, 4);
      position.y += 0.16;
    } else if (type === 'ramp') {
      size.set(axisSwapped ? 5.1 : 4, 2.25, axisSwapped ? 4 : 5.1);
      position.y += 1.14;
    } else {
      size.set(4, 1.8, 4);
      position.y += 0.9;
    }

    return {
      position,
      rotationY,
      box: {
        center: position.clone(),
        size
      }
    };
  }
}
