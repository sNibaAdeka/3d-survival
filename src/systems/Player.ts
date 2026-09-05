import * as THREE from 'three';
import { GRAVITY, JUMP_FORCE, PLAYER_HEIGHT, PLAYER_RADIUS, SPRINT_SPEED, WALK_SPEED } from './constants';
import { InputManager } from './InputManager';
import { InventorySystem } from './InventorySystem';
import { World } from './World';
import { clamp, lerpAngle } from './utils';

export class Player {
  readonly group = new THREE.Group();
  readonly inventory = new InventorySystem();
  readonly hitMeshes: THREE.Object3D[] = [];
  readonly position = new THREE.Vector3();
  velocityY = 0;
  health = 100;
  shield = 50;
  stamina = 100;
  materials = 140;
  kills = 0;
  alive = true;
  grounded = false;
  aiming = false;
  sprinting = false;
  private facingYaw = 0;
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly moveDirection = new THREE.Vector3();

  constructor() {
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#f4c15d', roughness: 0.72 });
    const vestMaterial = new THREE.MeshStandardMaterial({ color: '#3d5f73', roughness: 0.78 });
    const headMaterial = new THREE.MeshStandardMaterial({ color: '#ffcf9f', roughness: 0.7 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.58, 1.25, 12), bodyMaterial);
    body.position.y = 1.08;
    body.castShadow = true;
    body.userData.kind = 'player';
    body.userData.entity = this;

    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.72, 0.48), vestMaterial);
    vest.position.y = 1.18;
    vest.position.z = -0.03;
    vest.castShadow = true;
    vest.userData.kind = 'player';
    vest.userData.entity = this;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), headMaterial);
    head.position.y = 1.94;
    head.castShadow = true;
    head.userData.kind = 'player';
    head.userData.entity = this;

    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.24), vestMaterial);
    backpack.position.set(0, 1.15, 0.38);
    backpack.castShadow = true;
    backpack.userData.kind = 'player';
    backpack.userData.entity = this;

    this.group.add(body, vest, head, backpack);
    this.hitMeshes.push(body, vest, head, backpack);
  }

  reset(spawn: THREE.Vector3): void {
    this.position.copy(spawn);
    this.velocityY = 0;
    this.health = 100;
    this.shield = 50;
    this.stamina = 100;
    this.materials = 140;
    this.kills = 0;
    this.alive = true;
    this.grounded = false;
    this.aiming = false;
    this.sprinting = false;
    this.inventory.reset();
    this.group.visible = true;
    this.group.position.copy(this.position);
  }

  update(dt: number, input: InputManager, cameraYaw: number, world: World): void {
    if (!this.alive) return;

    const forward = this.forward.set(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
    const right = this.right.set(-forward.z, 0, forward.x);
    const direction = this.moveDirection.set(0, 0, 0);

    if (input.isDown('KeyW')) direction.add(forward);
    if (input.isDown('KeyS')) direction.sub(forward);
    if (input.isDown('KeyD')) direction.add(right);
    if (input.isDown('KeyA')) direction.sub(right);

    if (direction.lengthSq() > 0.001) {
      direction.normalize();
      const targetYaw = Math.atan2(direction.x, direction.z);
      this.facingYaw = lerpAngle(this.facingYaw, targetYaw, 1 - Math.pow(0.001, dt));
    } else {
      this.facingYaw = lerpAngle(this.facingYaw, cameraYaw, 1 - Math.pow(0.015, dt));
    }

    const wantsSprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const moving = direction.lengthSq() > 0.001;
    this.sprinting = wantsSprint && moving && this.stamina > 2;
    if (this.sprinting) {
      this.stamina = clamp(this.stamina - 24 * dt, 0, 100);
    } else {
      this.stamina = clamp(this.stamina + (moving ? 12 : 24) * dt, 0, 100);
    }

    const speed = this.sprinting ? SPRINT_SPEED : WALK_SPEED;
    this.position.addScaledVector(direction, speed * dt);

    if (this.grounded && input.consumePressed('Space')) {
      this.velocityY = JUMP_FORCE;
      this.grounded = false;
    }

    this.velocityY += GRAVITY * dt;
    this.position.y += this.velocityY * dt;

    const resolved = world.resolvePosition(this.position, PLAYER_RADIUS, PLAYER_HEIGHT);
    this.position.x = resolved.x;
    this.position.z = resolved.z;

    const ground = world.heightAt(this.position.x, this.position.z);
    if (this.position.y <= ground) {
      this.position.y = ground;
      this.velocityY = 0;
      this.grounded = true;
    }

    this.aiming = input.isMouseDown(2);
    this.group.position.copy(this.position);
    this.group.rotation.y = this.facingYaw;
  }

  damage(amount: number): boolean {
    if (!this.alive) return false;
    const shieldDamage = Math.min(this.shield, amount);
    this.shield -= shieldDamage;
    this.health -= amount - shieldDamage;
    this.health = clamp(this.health, 0, 100);
    this.shield = clamp(this.shield, 0, 100);
    if (this.health <= 0) {
      this.alive = false;
      this.group.visible = false;
      return true;
    }
    return false;
  }

  heal(amount: number): number {
    const before = this.health;
    this.health = clamp(this.health + amount, 0, 100);
    return this.health - before;
  }

  addShield(amount: number): number {
    const before = this.shield;
    this.shield = clamp(this.shield + amount, 0, 100);
    return this.shield - before;
  }

  eyePosition(): THREE.Vector3 {
    return this.position.clone().add(new THREE.Vector3(0, 1.65, 0));
  }
}
