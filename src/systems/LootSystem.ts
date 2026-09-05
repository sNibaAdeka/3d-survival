import * as THREE from 'three';
import type { LootData, WeaponId } from './types';
import { ARENA_RADIUS } from './constants';
import { choose, distanceXZ, randInt, randRange, randomPointInCircle } from './utils';
import { Player } from './Player';
import { World } from './World';
import { WEAPONS } from './weapons';
import type { Bot } from './Bot';

interface LootItem {
  mesh: THREE.Mesh;
  data: LootData;
  baseY: number;
}

const LOOT_WEAPONS: WeaponId[] = ['rifle', 'shotgun', 'sniper', 'pistol'];

export class LootSystem {
  private readonly items: LootItem[] = [];
  private readonly materials = {
    ammo: new THREE.MeshStandardMaterial({ color: '#f8d76e', roughness: 0.65 }),
    health: new THREE.MeshStandardMaterial({ color: '#ff5f70', roughness: 0.62 }),
    shield: new THREE.MeshStandardMaterial({ color: '#51d7ff', roughness: 0.55, emissive: '#083040' }),
    materials: new THREE.MeshStandardMaterial({ color: '#b87b4d', roughness: 0.8 })
  };
  private readonly geometries = {
    weapon: new THREE.BoxGeometry(1.15, 0.28, 0.34),
    ammo: new THREE.BoxGeometry(0.76, 0.36, 0.48),
    health: new THREE.CylinderGeometry(0.38, 0.38, 0.62, 12),
    shield: new THREE.IcosahedronGeometry(0.48, 1),
    materials: new THREE.BoxGeometry(0.76, 0.56, 0.76)
  };
  private readonly weaponMaterials = new Map<WeaponId, THREE.MeshStandardMaterial>();

  constructor(private readonly scene: THREE.Scene, private readonly world: World) {}

  reset(): void {
    for (const item of this.items) {
      this.scene.remove(item.mesh);
      if (item.mesh.userData.disposeGeometry !== false) {
        item.mesh.geometry.dispose();
      }
    }
    this.items.length = 0;
  }

  spawnInitial(): void {
    for (let i = 0; i < 46; i += 1) {
      const roll = Math.random();
      if (roll < 0.34) {
        this.spawnAtRandom({ type: 'weapon', weaponId: choose(LOOT_WEAPONS) });
      } else if (roll < 0.57) {
        this.spawnAtRandom({ type: 'ammo', amount: randInt(18, 42) });
      } else if (roll < 0.72) {
        this.spawnAtRandom({ type: 'shield', amount: randInt(18, 35) });
      } else if (roll < 0.84) {
        this.spawnAtRandom({ type: 'health', amount: randInt(20, 36) });
      } else {
        this.spawnAtRandom({ type: 'materials', amount: randInt(18, 42) });
      }
    }
  }

  update(time: number): void {
    for (const item of this.items) {
      item.mesh.rotation.y += 0.018;
      item.mesh.position.y = item.baseY + Math.sin(time * 3.2 + item.mesh.id) * 0.14;
    }
  }

  tryPickupPlayer(player: Player): string | null {
    let closest: LootItem | null = null;
    let closestDistance = 2.7;
    for (const item of this.items) {
      const distance = distanceXZ(player.position, item.mesh.position);
      if (distance < closestDistance) {
        closest = item;
        closestDistance = distance;
      }
    }

    if (!closest) return null;
    const message = this.applyToPlayer(player, closest.data);
    this.removeItem(closest);
    return message;
  }

  tryPickupBot(bot: Bot): void {
    for (let i = 0; i < this.items.length; i += 1) {
      const item = this.items[i];
      if (distanceXZ(bot.position, item.mesh.position) > 2.1) continue;
      const data = item.data;
      if (data.type === 'health' && bot.health < 100) {
        bot.health = Math.min(100, bot.health + (data.amount ?? 25));
      } else if (data.type === 'shield' && bot.shield < 80) {
        bot.shield = Math.min(80, bot.shield + (data.amount ?? 25));
      } else if (data.type === 'ammo') {
        bot.weapon.reserve += data.amount ?? 24;
      } else if (data.type === 'materials') {
        bot.materials += data.amount ?? 24;
      } else if (data.type === 'weapon' && data.weaponId && Math.random() < 0.58) {
        bot.setWeapon(data.weaponId);
      } else {
        continue;
      }
      this.removeItem(item);
      return;
    }
  }

  getNearbyLabel(player: Player): string {
    let closest: LootItem | null = null;
    let closestDistance = 3.2;
    for (const item of this.items) {
      const distance = distanceXZ(player.position, item.mesh.position);
      if (distance < closestDistance) {
        closest = item;
        closestDistance = distance;
      }
    }

    if (!closest) return 'Clear';
    const data = closest.data;
    if (data.type === 'weapon' && data.weaponId) return WEAPONS[data.weaponId].name;
    if (data.type === 'ammo') return `Ammo +${data.amount ?? 24}`;
    if (data.type === 'health') return `Health +${data.amount ?? 25}`;
    if (data.type === 'shield') return `Shield +${data.amount ?? 25}`;
    return `Materials +${data.amount ?? 24}`;
  }

  spawnDeathDrop(position: THREE.Vector3): void {
    const base = position.clone();
    this.spawnAt({ type: 'materials', amount: randInt(22, 48) }, base.clone().add(new THREE.Vector3(1.2, 0, 0.7)));
    if (Math.random() < 0.55) {
      this.spawnAt({ type: 'weapon', weaponId: choose(LOOT_WEAPONS) }, base.clone().add(new THREE.Vector3(-1, 0, -0.4)));
    } else {
      this.spawnAt({ type: 'ammo', amount: randInt(18, 36) }, base.clone().add(new THREE.Vector3(-1, 0, -0.4)));
    }
  }

  getItems(): LootItem[] {
    return this.items;
  }

  private spawnAtRandom(data: LootData): void {
    for (let i = 0; i < 20; i += 1) {
      const point = randomPointInCircle(ARENA_RADIUS * 0.82);
      point.y = this.world.heightAt(point.x, point.z);
      if (!this.world.boxOverlapsSolid({ center: point.clone().add(new THREE.Vector3(0, 0.8, 0)), size: new THREE.Vector3(2, 1.6, 2) })) {
        this.spawnAt(data, point);
        return;
      }
    }
  }

  private spawnAt(data: LootData, position: THREE.Vector3): void {
    position.y = this.world.heightAt(position.x, position.z);
    const mesh = this.createMesh(data);
    mesh.position.set(position.x + randRange(-0.3, 0.3), position.y + 0.7, position.z + randRange(-0.3, 0.3));
    mesh.castShadow = true;
    mesh.userData.kind = 'loot';
    this.scene.add(mesh);
    this.items.push({ mesh, data, baseY: mesh.position.y });
  }

  private createMesh(data: LootData): THREE.Mesh {
    if (data.type === 'weapon') {
      const weaponId = data.weaponId ?? 'rifle';
      let material = this.weaponMaterials.get(weaponId);
      if (!material) {
        material = new THREE.MeshStandardMaterial({ color: WEAPONS[weaponId].color, roughness: 0.52 });
        this.weaponMaterials.set(weaponId, material);
      }
      const mesh = new THREE.Mesh(this.geometries.weapon, material);
      mesh.scale.z = data.weaponId === 'sniper' ? 1.6 : data.weaponId === 'shotgun' ? 1.25 : 1;
      mesh.userData.disposeGeometry = false;
      return mesh;
    }
    if (data.type === 'health') {
      const mesh = new THREE.Mesh(this.geometries.health, this.materials.health);
      mesh.userData.disposeGeometry = false;
      return mesh;
    }
    if (data.type === 'shield') {
      const mesh = new THREE.Mesh(this.geometries.shield, this.materials.shield);
      mesh.userData.disposeGeometry = false;
      return mesh;
    }
    if (data.type === 'materials') {
      const mesh = new THREE.Mesh(this.geometries.materials, this.materials.materials);
      mesh.userData.disposeGeometry = false;
      return mesh;
    }
    const mesh = new THREE.Mesh(this.geometries.ammo, this.materials.ammo);
    mesh.userData.disposeGeometry = false;
    return mesh;
  }

  private applyToPlayer(player: Player, data: LootData): string {
    if (data.type === 'weapon' && data.weaponId) {
      player.inventory.addWeapon(data.weaponId);
      return WEAPONS[data.weaponId].name;
    }
    if (data.type === 'ammo') {
      player.inventory.addAmmo(data.amount ?? 24);
      return `Ammo +${data.amount ?? 24}`;
    }
    if (data.type === 'health') {
      const healed = Math.round(player.heal(data.amount ?? 25));
      return `Health +${healed}`;
    }
    if (data.type === 'shield') {
      const shield = Math.round(player.addShield(data.amount ?? 25));
      return `Shield +${shield}`;
    }
    player.materials += data.amount ?? 24;
    return `Materials +${data.amount ?? 24}`;
  }

  private removeItem(item: LootItem): void {
    const index = this.items.indexOf(item);
    if (index !== -1) {
      this.items.splice(index, 1);
    }
    this.scene.remove(item.mesh);
    if (item.mesh.userData.disposeGeometry !== false) {
      item.mesh.geometry.dispose();
    }
  }
}
