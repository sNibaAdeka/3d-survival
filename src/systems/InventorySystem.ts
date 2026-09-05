import type { InventorySlot, WeaponId, WeaponItem } from './types';
import { createWeapon, updateWeaponTimers, WEAPONS } from './weapons';

export class InventorySystem {
  readonly slots: InventorySlot[] = [createWeapon('rifle'), createWeapon('pistol'), null, null, null];
  activeIndex = 0;

  reset(): void {
    this.slots.splice(0, this.slots.length, createWeapon('rifle'), createWeapon('pistol'), null, null, null);
    this.activeIndex = 0;
  }

  update(dt: number): void {
    for (const slot of this.slots) {
      if (slot) {
        updateWeaponTimers(slot, dt);
      }
    }
  }

  get activeWeapon(): WeaponItem | null {
    return this.slots[this.activeIndex];
  }

  switchTo(index: number): void {
    if (index >= 0 && index < this.slots.length) {
      this.activeIndex = index;
    }
  }

  cycle(direction: number): void {
    const count = this.slots.length;
    for (let step = 1; step <= count; step += 1) {
      const index = (this.activeIndex + direction * step + count) % count;
      if (this.slots[index]) {
        this.activeIndex = index;
        return;
      }
    }
  }

  addWeapon(id: WeaponId): boolean {
    const emptyIndex = this.slots.findIndex((slot) => slot === null);
    if (emptyIndex !== -1) {
      this.slots[emptyIndex] = createWeapon(id);
      this.activeIndex = emptyIndex;
      return true;
    }
    this.slots[this.activeIndex] = createWeapon(id);
    return true;
  }

  addAmmo(amount: number): void {
    const active = this.activeWeapon;
    if (active) {
      active.reserve += amount;
      return;
    }
    for (const slot of this.slots) {
      if (slot) {
        slot.reserve += amount;
      }
    }
  }

  describeActive(): { name: string; ammo: string; reloading: boolean } {
    const weapon = this.activeWeapon;
    if (!weapon) {
      return { name: 'Empty', ammo: '0 / 0', reloading: false };
    }
    const definition = WEAPONS[weapon.weaponId];
    return {
      name: definition.name,
      ammo: `${weapon.magazine} / ${weapon.reserve}`,
      reloading: weapon.reloadRemaining > 0
    };
  }
}
