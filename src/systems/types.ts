import * as THREE from 'three';

export type Quality = 'low' | 'medium' | 'high';
export type WeaponId = 'pistol' | 'rifle' | 'shotgun' | 'sniper';
export type LootType = 'weapon' | 'ammo' | 'health' | 'shield' | 'materials';
export type BuildPieceType = 'wall' | 'floor' | 'ramp' | 'roof';

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  damage: number;
  fireRate: number;
  spread: number;
  magazineSize: number;
  reloadTime: number;
  range: number;
  pellets: number;
  automatic: boolean;
  reserveAmmo: number;
  color: THREE.ColorRepresentation;
}

export interface WeaponItem {
  kind: 'weapon';
  weaponId: WeaponId;
  magazine: number;
  reserve: number;
  cooldown: number;
  reloadRemaining: number;
}

export type InventorySlot = WeaponItem | null;

export interface LootData {
  type: LootType;
  weaponId?: WeaponId;
  amount?: number;
}

export interface SolidBox {
  center: THREE.Vector3;
  size: THREE.Vector3;
  mesh?: THREE.Object3D;
  piece?: BuildPiece;
}

export interface BuildPiece {
  type: BuildPieceType;
  mesh: THREE.Mesh;
  box: SolidBox;
  health: number;
  maxHealth: number;
}

export interface CombatHit {
  point: THREE.Vector3;
  distance: number;
  object: THREE.Object3D;
}
