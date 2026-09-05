import * as THREE from 'three';
import { clamp } from './utils';
import { World } from './World';
import { Player } from './Player';

export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = -0.16;
  private readonly raycaster = new THREE.Raycaster();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(68, aspect, 0.1, 550);
    this.camera.position.set(0, 8, -10);
  }

  update(dt: number, mouseDelta: { dx: number; dy: number }, player: Player, world: World): void {
    const sensitivity = player.aiming ? 0.0015 : 0.0024;
    this.yaw += mouseDelta.dx * sensitivity;
    this.pitch = clamp(this.pitch - mouseDelta.dy * sensitivity, -0.78, 0.34);

    const focus = player.position.clone().add(new THREE.Vector3(0, player.aiming ? 1.72 : 1.58, 0));
    const distance = player.aiming ? 5.5 : 8.5;
    const direction = this.viewDirection();
    const desired = focus.clone().addScaledVector(direction, -distance);
    desired.y += player.aiming ? 0.28 : 0.55;

    const toDesired = desired.clone().sub(focus);
    const rayLength = toDesired.length();
    const rayDirection = toDesired.normalize();
    this.raycaster.set(focus, rayDirection);
    this.raycaster.near = 0.1;
    this.raycaster.far = rayLength;
    const hits = this.raycaster
      .intersectObjects(world.solidMeshes, false)
      .filter((hit) => hit.object.userData.kind !== 'terrain');

    const finalPosition = desired.clone();
    if (hits.length > 0) {
      finalPosition.copy(focus).addScaledVector(rayDirection, Math.max(2.4, hits[0].distance - 0.35));
    }

    this.camera.position.lerp(finalPosition, 1 - Math.pow(0.0001, dt));
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, player.aiming ? 54 : 68, 1 - Math.pow(0.002, dt));
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(focus.clone().addScaledVector(direction, 12));
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  viewDirection(): THREE.Vector3 {
    const cosPitch = Math.cos(this.pitch);
    return new THREE.Vector3(Math.sin(this.yaw) * cosPitch, Math.sin(this.pitch), Math.cos(this.yaw) * cosPitch).normalize();
  }
}
