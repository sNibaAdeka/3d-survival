import type { WeaponDefinition, WeaponId, WeaponItem } from './types';

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  pistol: {
    id: 'pistol',
    name: 'Sidearm',
    damage: 23,
    fireRate: 4.2,
    spread: 0.018,
    magazineSize: 12,
    reloadTime: 1.2,
    range: 90,
    pellets: 1,
    automatic: false,
    reserveAmmo: 48,
    color: '#d9e6ee'
  },
  rifle: {
    id: 'rifle',
    name: 'Pulse Rifle',
    damage: 18,
    fireRate: 9.5,
    spread: 0.022,
    magazineSize: 30,
    reloadTime: 1.65,
    range: 124,
    pellets: 1,
    automatic: true,
    reserveAmmo: 90,
    color: '#ffe66d'
  },
  shotgun: {
    id: 'shotgun',
    name: 'Scattergun',
    damage: 8,
    fireRate: 1.05,
    spread: 0.11,
    magazineSize: 6,
    reloadTime: 2.1,
    range: 48,
    pellets: 8,
    automatic: false,
    reserveAmmo: 30,
    color: '#ff8e6e'
  },
  sniper: {
    id: 'sniper',
    name: 'Rail Marksman',
    damage: 82,
    fireRate: 0.62,
    spread: 0.004,
    magazineSize: 4,
    reloadTime: 2.4,
    range: 178,
    pellets: 1,
    automatic: false,
    reserveAmmo: 16,
    color: '#a78bfa'
  }
};

export function createWeapon(id: WeaponId): WeaponItem {
  const definition = WEAPONS[id];
  return {
    kind: 'weapon',
    weaponId: id,
    magazine: definition.magazineSize,
    reserve: definition.reserveAmmo,
    cooldown: 0,
    reloadRemaining: 0
  };
}

export function updateWeaponTimers(weapon: WeaponItem, dt: number): void {
  weapon.cooldown = Math.max(0, weapon.cooldown - dt);
  if (weapon.reloadRemaining > 0) {
    weapon.reloadRemaining = Math.max(0, weapon.reloadRemaining - dt);
    if (weapon.reloadRemaining === 0) {
      finishReload(weapon);
    }
  }
}

export function startReload(weapon: WeaponItem): boolean {
  const definition = WEAPONS[weapon.weaponId];
  if (weapon.reloadRemaining > 0 || weapon.magazine >= definition.magazineSize || weapon.reserve <= 0) {
    return false;
  }
  weapon.reloadRemaining = definition.reloadTime;
  return true;
}

function finishReload(weapon: WeaponItem): void {
  const definition = WEAPONS[weapon.weaponId];
  const missing = definition.magazineSize - weapon.magazine;
  const moved = Math.min(missing, weapon.reserve);
  weapon.magazine += moved;
  weapon.reserve -= moved;
}
