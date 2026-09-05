import * as THREE from 'three';
import { BOT_SPEED, GRAVITY, PLAYER_HEIGHT, PLAYER_RADIUS } from './constants';
import type { WeaponId, WeaponItem } from './types';
import { createWeapon, updateWeaponTimers } from './weapons';
import { World } from './World';
import { Player } from './Player';
import { LootSystem } from './LootSystem';
import { StormSystem } from './StormSystem';
import { clamp, distanceXZ, lerpAngle, randomPointInCircle } from './utils';

export interface BotContext {
  player: Player;
  world: World;
  loot: LootSystem;
  storm: StormSystem;
  combatEnabled: boolean;
  fireBotWeapon: (bot: Bot, origin: THREE.Vector3, direction: THREE.Vector3) => void;
  placeBotCover: (bot: Bot) => boolean;
}

export class Bot {
  readonly group = new THREE.Group();
  readonly hitMeshes: THREE.Object3D[] = [];
  readonly position = new THREE.Vector3();
  weapon: WeaponItem = createWeapon(Math.random() < 0.25 ? 'shotgun' : 'rifle');
  health = 100;
  shield = 35;
  materials = 75;
  alive = true;
  private velocityY = 0;
  private facingYaw = 0;
  private thinkTimer = 0;
  private coverCooldown = 3 + Math.random() * 5;
  private fireWarmup = 6 + Math.random() * 3;
  private readonly wanderPoint = new THREE.Vector3();
  private readonly strafeSign = Math.random() < 0.5 ? -1 : 1;
  private readonly toPlayer = new THREE.Vector3();
  private readonly move = new THREE.Vector3();
  private readonly aimTarget = new THREE.Vector3();
  private readonly shotOrigin = new THREE.Vector3();

  constructor(private readonly id: number, spawn: THREE.Vector3) {
    const palette = ['#ed8975', '#83d475', '#75bbed', '#e7cc6c', '#bb86fc'];
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: palette[id % palette.length], roughness: 0.76 });
    const headMaterial = new THREE.MeshStandardMaterial({ color: '#ffc79b', roughness: 0.7 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.56, 1.18, 10), bodyMaterial);
    body.position.y = 1.04;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), headMaterial);
    head.position.y = 1.84;

    for (const mesh of [body, head]) {
      mesh.castShadow = true;
      mesh.userData.kind = 'bot';
      mesh.userData.entity = this;
      this.hitMeshes.push(mesh);
    }

    this.group.add(body, head);
    this.reset(spawn);
    this.pickNewWanderPoint();
  }

  reset(spawn: THREE.Vector3): void {
    this.position.copy(spawn);
    this.group.position.copy(this.position);
    this.velocityY = 0;
    this.health = 100;
    this.shield = 35;
    this.materials = 75;
    this.alive = true;
    this.group.visible = true;
    this.weapon = createWeapon(Math.random() < 0.25 ? 'shotgun' : 'rifle');
  }

  update(dt: number, context: BotContext): void {
    if (!this.alive) return;
    updateWeaponTimers(this.weapon, dt);
    this.coverCooldown = Math.max(0, this.coverCooldown - dt);
    this.fireWarmup = Math.max(0, this.fireWarmup - dt);
    this.thinkTimer -= dt;

    const player = context.player;
    const toPlayer = this.toPlayer.copy(player.position).sub(this.position);
    toPlayer.y = 0;
    const playerDistance = toPlayer.length();
    this.shotOrigin.set(this.position.x, this.position.y + 1.55, this.position.z);
    this.aimTarget.set(player.position.x, player.position.y + 1.65, player.position.z);
    const playerVisible =
      player.alive &&
      playerDistance < 58 &&
      context.world.lineOfSight(this.shotOrigin, this.aimTarget, this.hitMeshes);

    const move = this.move.set(0, 0, 0);
    if (playerVisible) {
      const dir = toPlayer.normalize();
      if (playerDistance > 30) {
        move.copy(dir);
      } else if (playerDistance < 14) {
        move.copy(dir).multiplyScalar(-1);
      } else {
        move.set(dir.z * this.strafeSign, 0, -dir.x * this.strafeSign);
      }

      if (context.combatEnabled && this.fireWarmup <= 0) {
        const aimTarget = this.aimTarget;
        aimTarget.x += (Math.random() - 0.5) * 1.25;
        aimTarget.y += (Math.random() - 0.5) * 0.65;
        aimTarget.z += (Math.random() - 0.5) * 1.25;
        context.fireBotWeapon(this, this.shotOrigin, aimTarget.sub(this.shotOrigin).normalize());
      }

      if (context.combatEnabled && this.coverCooldown <= 0 && this.materials >= 10 && playerDistance < 42 && Math.random() < 0.025) {
        if (context.placeBotCover(this)) {
          this.materials -= 10;
          this.coverCooldown = 7 + Math.random() * 5;
        }
      }
    } else {
      if (context.storm.isOutside(this.position)) {
        move.set(context.storm.center.x - this.position.x, 0, context.storm.center.z - this.position.z);
        if (move.lengthSq() > 0.001) move.normalize();
      } else {
        if (this.thinkTimer <= 0 || distanceXZ(this.position, this.wanderPoint) < 5) {
          this.pickNewWanderPoint();
          this.thinkTimer = 2 + Math.random() * 2.5;
        }
        move.set(this.wanderPoint.x - this.position.x, 0, this.wanderPoint.z - this.position.z);
        if (move.lengthSq() > 0.001) move.normalize();
      }
    }

    context.loot.tryPickupBot(this);

    if (move.lengthSq() > 0.001) {
      move.normalize();
      const targetYaw = Math.atan2(move.x, move.z);
      this.facingYaw = lerpAngle(this.facingYaw, targetYaw, 1 - Math.pow(0.01, dt));
      this.position.addScaledVector(move, BOT_SPEED * dt);
    }

    this.velocityY += GRAVITY * dt;
    this.position.y += this.velocityY * dt;
    const resolved = context.world.resolvePosition(this.position, PLAYER_RADIUS, PLAYER_HEIGHT);
    this.position.x = resolved.x;
    this.position.z = resolved.z;
    const ground = context.world.heightAt(this.position.x, this.position.z);
    if (this.position.y <= ground) {
      this.position.y = ground;
      this.velocityY = 0;
    }
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

  setWeapon(id: WeaponId): void {
    this.weapon = createWeapon(id);
  }

  eyePosition(): THREE.Vector3 {
    return this.position.clone().add(new THREE.Vector3(0, 1.55, 0));
  }

  private pickNewWanderPoint(): void {
    this.wanderPoint.copy(randomPointInCircle(82));
  }
}
