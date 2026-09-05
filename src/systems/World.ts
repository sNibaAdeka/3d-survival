import * as THREE from 'three';
import { ARENA_RADIUS } from './constants';
import type { BuildPiece, SolidBox } from './types';
import { boxOverlaps, clamp, randomPointInCircle, randRange } from './utils';

export class World {
  readonly solidMeshes: THREE.Object3D[] = [];
  private readonly staticBoxes: SolidBox[] = [];
  private readonly buildPieces: BuildPiece[] = [];
  private readonly materials = {
    grass: new THREE.MeshStandardMaterial({ color: '#4dbb68', roughness: 0.86 }),
    sand: new THREE.MeshStandardMaterial({ color: '#d7c77d', roughness: 0.9 }),
    water: new THREE.MeshStandardMaterial({
      color: '#2679b7',
      roughness: 0.45,
      metalness: 0.04,
      transparent: true,
      opacity: 0.72
    }),
    house: new THREE.MeshStandardMaterial({ color: '#78a6b8', roughness: 0.74 }),
    roof: new THREE.MeshStandardMaterial({ color: '#e06f53', roughness: 0.8 }),
    crate: new THREE.MeshStandardMaterial({ color: '#a6784f', roughness: 0.88 }),
    stone: new THREE.MeshStandardMaterial({ color: '#7f8c92', roughness: 0.9 }),
    trunk: new THREE.MeshStandardMaterial({ color: '#8a5b32', roughness: 0.9 }),
    leaves: new THREE.MeshStandardMaterial({ color: '#2f9f59', roughness: 0.82 })
  };

  private terrain!: THREE.Mesh;
  private scratchBox = new THREE.Box3();
  private readonly lineRaycaster = new THREE.Raycaster();
  private readonly lineHits: THREE.Intersection[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  build(): void {
    this.createTerrain();
    this.createWater();
    this.createLandmarks();
    this.createInstancedNature();
  }

  heightAt(x: number, z: number): number {
    const rolling =
      Math.sin(x * 0.045) * 1.25 +
      Math.cos(z * 0.038) * 1.05 +
      Math.sin((x + z) * 0.024) * 0.75;
    const hillA = Math.exp(-((x + 38) ** 2 + (z - 24) ** 2) / 1350) * 5.8;
    const hillB = Math.exp(-((x - 46) ** 2 + (z + 38) ** 2) / 1050) * 4.8;
    const dip = Math.exp(-((x - 12) ** 2 + (z - 22) ** 2) / 820) * -1.3;
    return rolling + hillA + hillB + dip;
  }

  resolvePosition(position: THREE.Vector3, radius: number, height: number): THREE.Vector3 {
    const result = position;
    for (const box of this.staticBoxes) {
      this.resolveAgainstBox(result, radius, height, box);
    }
    for (const piece of this.buildPieces) {
      this.resolveAgainstBox(result, radius, height, piece.box);
    }

    const arenaDistance = Math.hypot(result.x, result.z);
    const maxDistance = ARENA_RADIUS - radius - 2;
    if (arenaDistance > maxDistance) {
      const scale = maxDistance / arenaDistance;
      result.x *= scale;
      result.z *= scale;
    }

    return result;
  }

  getSpawnPoint(avoid?: THREE.Vector3, minAvoidDistance = 18): THREE.Vector3 {
    for (let i = 0; i < 80; i += 1) {
      const point = randomPointInCircle(ARENA_RADIUS * 0.76);
      if (avoid && point.distanceTo(avoid) < minAvoidDistance) {
        continue;
      }
      point.y = this.heightAt(point.x, point.z);
      if (!this.boxOverlapsSolid({ center: point.clone().add(new THREE.Vector3(0, 1.2, 0)), size: new THREE.Vector3(3, 2.4, 3) })) {
        return point;
      }
    }

    const fallback = new THREE.Vector3(randRange(-18, 18), 0, randRange(-18, 18));
    fallback.y = this.heightAt(fallback.x, fallback.z);
    return fallback;
  }

  addBuildPiece(piece: BuildPiece): void {
    piece.mesh.userData.kind = 'build';
    piece.mesh.userData.piece = piece;
    piece.box.piece = piece;
    piece.box.mesh = piece.mesh;
    this.buildPieces.push(piece);
    this.solidMeshes.push(piece.mesh);
  }

  removeBuildPiece(piece: BuildPiece): void {
    const pieceIndex = this.buildPieces.indexOf(piece);
    if (pieceIndex !== -1) {
      this.buildPieces.splice(pieceIndex, 1);
    }
    const meshIndex = this.solidMeshes.indexOf(piece.mesh);
    if (meshIndex !== -1) {
      this.solidMeshes.splice(meshIndex, 1);
    }
    this.scene.remove(piece.mesh);
    if (piece.mesh.userData.disposeGeometry !== false) {
      piece.mesh.geometry.dispose();
    }
    const material = Array.isArray(piece.mesh.material) ? piece.mesh.material : [piece.mesh.material];
    for (const entry of material) {
      entry.dispose();
    }
  }

  clearBuildPieces(): void {
    while (this.buildPieces.length > 0) {
      this.removeBuildPiece(this.buildPieces[this.buildPieces.length - 1]);
    }
  }

  getBuildPieces(): BuildPiece[] {
    return this.buildPieces;
  }

  boxOverlapsSolid(box: Pick<SolidBox, 'center' | 'size'>, ignore?: BuildPiece): boolean {
    for (const solid of this.staticBoxes) {
      if (boxOverlaps(box.center, box.size, solid.center, solid.size)) {
        return true;
      }
    }
    for (const piece of this.buildPieces) {
      if (ignore && piece === ignore) {
        continue;
      }
      if (boxOverlaps(box.center, box.size, piece.box.center, piece.box.size)) {
        return true;
      }
    }
    return false;
  }

  lineOfSight(from: THREE.Vector3, to: THREE.Vector3, ignoreObjects: THREE.Object3D[] = []): boolean {
    const direction = to.clone().sub(from);
    const distance = direction.length();
    if (distance <= 0.001) return true;
    direction.normalize();

    this.lineRaycaster.set(from, direction);
    this.lineRaycaster.near = 0.1;
    this.lineRaycaster.far = distance;
    this.lineHits.length = 0;
    this.lineRaycaster.intersectObjects(this.solidMeshes, false, this.lineHits);
    for (const hit of this.lineHits) {
      if (!ignoreObjects.includes(hit.object) && hit.object.userData.kind !== 'terrain') {
        this.lineHits.length = 0;
        return false;
      }
    }
    this.lineHits.length = 0;
    return true;
  }

  private resolveAgainstBox(result: THREE.Vector3, radius: number, height: number, box: SolidBox): void {
    const minX = box.center.x - box.size.x * 0.5;
    const maxX = box.center.x + box.size.x * 0.5;
    const minY = box.center.y - box.size.y * 0.5;
    const maxY = box.center.y + box.size.y * 0.5;
    const minZ = box.center.z - box.size.z * 0.5;
    const maxZ = box.center.z + box.size.z * 0.5;

    if (result.y > maxY || result.y + height < minY) {
      return;
    }

    const closestX = clamp(result.x, minX, maxX);
    const closestZ = clamp(result.z, minZ, maxZ);
    const dx = result.x - closestX;
    const dz = result.z - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq >= radius * radius) {
      return;
    }

    if (distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      const push = radius - dist;
      result.x += (dx / dist) * push;
      result.z += (dz / dist) * push;
      return;
    }

    const pushX = Math.min(Math.abs(result.x - minX), Math.abs(maxX - result.x));
    const pushZ = Math.min(Math.abs(result.z - minZ), Math.abs(maxZ - result.z));
    if (pushX < pushZ) {
      result.x += result.x > box.center.x ? radius : -radius;
    } else {
      result.z += result.z > box.center.z ? radius : -radius;
    }
  }

  private createTerrain(): void {
    const size = ARENA_RADIUS * 2.25;
    const geometry = new THREE.PlaneGeometry(size, size, 112, 112);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;

    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const radius = Math.hypot(x, z);
      const edgeDrop = Math.max(0, (radius - ARENA_RADIUS * 0.88) / (ARENA_RADIUS * 0.2)) * -5.5;
      position.setY(i, this.heightAt(x, z) + edgeDrop);
    }

    geometry.computeVertexNormals();
    this.terrain = new THREE.Mesh(geometry, this.materials.grass);
    this.terrain.receiveShadow = true;
    this.terrain.userData.kind = 'terrain';
    this.scene.add(this.terrain);
    this.solidMeshes.push(this.terrain);
  }

  private createWater(): void {
    const geometry = new THREE.CircleGeometry(ARENA_RADIUS * 1.2, 96);
    const mesh = new THREE.Mesh(geometry, this.materials.water);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -5.3;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private createLandmarks(): void {
    const houses = [
      new THREE.Vector3(-34, 0, -28),
      new THREE.Vector3(28, 0, -34),
      new THREE.Vector3(-22, 0, 36),
      new THREE.Vector3(44, 0, 24)
    ];

    for (const base of houses) {
      base.y = this.heightAt(base.x, base.z);
      this.addStaticBox(base.clone().add(new THREE.Vector3(0, 2.1, 0)), new THREE.Vector3(12, 4.2, 10), this.materials.house);

      const roofGeometry = new THREE.ConeGeometry(8.6, 3.4, 4);
      const roof = new THREE.Mesh(roofGeometry, this.materials.roof);
      roof.position.set(base.x, base.y + 5.6, base.z);
      roof.rotation.y = Math.PI * 0.25;
      roof.castShadow = true;
      roof.receiveShadow = true;
      roof.userData.kind = 'world';
      this.scene.add(roof);
      this.solidMeshes.push(roof);

      for (let i = 0; i < 5; i += 1) {
        const offset = new THREE.Vector3(randRange(-12, 12), 0, randRange(-12, 12));
        const point = base.clone().add(offset);
        point.y = this.heightAt(point.x, point.z);
        this.addStaticBox(point.clone().add(new THREE.Vector3(0, 0.7, 0)), new THREE.Vector3(3.2, 1.4, 3.2), this.materials.crate);
      }
    }

    for (let i = 0; i < 24; i += 1) {
      const point = randomPointInCircle(ARENA_RADIUS * 0.82);
      point.y = this.heightAt(point.x, point.z);
      const size = new THREE.Vector3(randRange(3.5, 7.5), randRange(1.8, 3.4), randRange(3.5, 7.5));
      this.addStaticBox(point.clone().add(new THREE.Vector3(0, size.y * 0.5, 0)), size, this.materials.stone);
    }
  }

  private createInstancedNature(): void {
    const treeCount = 72;
    const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.36, 0.48, 3.6, 7), this.materials.trunk, treeCount);
    const leafMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(1.9, 4.4, 7), this.materials.leaves, treeCount);
    trunkMesh.castShadow = true;
    leafMesh.castShadow = true;
    trunkMesh.userData.kind = 'world';
    leafMesh.userData.kind = 'world';

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    for (let i = 0; i < treeCount; i += 1) {
      const point = randomPointInCircle(ARENA_RADIUS * 0.92);
      if (Math.hypot(point.x, point.z) < 16) {
        point.multiplyScalar(1.8);
      }
      const height = this.heightAt(point.x, point.z);
      const treeScale = randRange(0.85, 1.35);
      scale.set(treeScale, treeScale, treeScale);

      matrix.compose(new THREE.Vector3(point.x, height + 1.8 * treeScale, point.z), quaternion, scale);
      trunkMesh.setMatrixAt(i, matrix);
      matrix.compose(new THREE.Vector3(point.x, height + 4.4 * treeScale, point.z), quaternion, scale);
      leafMesh.setMatrixAt(i, matrix);

      this.staticBoxes.push({
        center: new THREE.Vector3(point.x, height + 1.8, point.z),
        size: new THREE.Vector3(1.2, 3.4, 1.2)
      });
    }

    trunkMesh.instanceMatrix.needsUpdate = true;
    leafMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(trunkMesh, leafMesh);
    this.solidMeshes.push(trunkMesh, leafMesh);
  }

  private addStaticBox(center: THREE.Vector3, size: THREE.Vector3, material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
    mesh.position.copy(center);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.kind = 'world';
    this.scene.add(mesh);
    this.solidMeshes.push(mesh);

    this.scratchBox.setFromCenterAndSize(center, size);
    this.staticBoxes.push({ center: center.clone(), size: size.clone(), mesh });
    return mesh;
  }
}
