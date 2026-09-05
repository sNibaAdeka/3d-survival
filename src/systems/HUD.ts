import type { BuildPieceType, Quality, WeaponItem } from './types';
import { Player } from './Player';
import { Bot } from './Bot';
import { StormSystem } from './StormSystem';
import { WEAPONS } from './weapons';
import { ARENA_RADIUS } from './constants';
import { LootSystem } from './LootSystem';

export class HUD {
  private readonly hud = getEl<HTMLElement>('hud');
  private readonly menu = getEl<HTMLElement>('menu');
  private readonly result = getEl<HTMLElement>('result');
  private readonly healthBar = getEl<HTMLElement>('healthBar');
  private readonly shieldBar = getEl<HTMLElement>('shieldBar');
  private readonly staminaBar = getEl<HTMLElement>('staminaBar');
  private readonly healthText = getEl<HTMLElement>('healthText');
  private readonly shieldText = getEl<HTMLElement>('shieldText');
  private readonly staminaText = getEl<HTMLElement>('staminaText');
  private readonly stormStatus = getEl<HTMLElement>('stormStatus');
  private readonly aliveStatus = getEl<HTMLElement>('aliveStatus');
  private readonly controlHint = getEl<HTMLElement>('controlHint');
  private readonly materials = getEl<HTMLElement>('materials');
  private readonly buildStatus = getEl<HTMLElement>('buildStatus');
  private readonly nearbyLoot = getEl<HTMLElement>('nearbyLoot');
  private readonly weaponName = getEl<HTMLElement>('weaponName');
  private readonly ammoStatus = getEl<HTMLElement>('ammoStatus');
  private readonly reloadBar = getEl<HTMLElement>('reloadBar');
  private readonly inventory = getEl<HTMLElement>('inventory');
  private readonly toast = getEl<HTMLElement>('toast');
  private readonly hitMarker = getEl<HTMLElement>('hitMarker');
  private readonly damageFlash = getEl<HTMLElement>('damageFlash');
  private readonly stormVeil = getEl<HTMLElement>('stormVeil');
  private readonly matchBanner = getEl<HTMLElement>('matchBanner');
  private readonly matchBannerTitle = getEl<HTMLElement>('matchBannerTitle');
  private readonly matchBannerDetail = getEl<HTMLElement>('matchBannerDetail');
  private readonly pause = getEl<HTMLElement>('pause');
  private readonly pauseStats = getEl<HTMLElement>('pauseStats');
  private readonly minimap = getEl<HTMLCanvasElement>('minimap');
  private readonly minimapContext = this.minimap.getContext('2d');
  private toastTimer = 0;
  private hitTimer = 0;
  private damageTimer = 0;
  private minimapTimer = 0;
  private inventorySignature = '';
  private readonly textCache = new Map<HTMLElement, string>();
  private readonly widthCache = new Map<HTMLElement, string>();
  private slots: HTMLElement[] = [];

  constructor() {
    this.createInventorySlots();
  }

  bindQuality(handler: (quality: Quality) => void): void {
    const select = getEl<HTMLSelectElement>('qualitySelect');
    select.addEventListener('change', () => handler(select.value as Quality));
  }

  bindPlay(handler: () => void): void {
    getEl<HTMLButtonElement>('playButton').addEventListener('click', handler);
  }

  bindRestart(handler: () => void): void {
    getEl<HTMLButtonElement>('restartButton').addEventListener('click', handler);
  }

  bindPause(handler: () => void): void {
    getEl<HTMLButtonElement>('pauseButton').addEventListener('click', handler);
  }

  bindResume(handler: () => void): void {
    getEl<HTMLButtonElement>('resumeButton').addEventListener('click', handler);
  }

  bindPauseRestart(handler: () => void): void {
    getEl<HTMLButtonElement>('pauseRestartButton').addEventListener('click', handler);
  }

  showGame(): void {
    this.menu.classList.add('hidden');
    this.result.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.minimapTimer = 0;
  }

  showResult(title: string, stats: string): void {
    getEl<HTMLElement>('resultTitle').textContent = title;
    getEl<HTMLElement>('resultStats').textContent = stats;
    this.result.classList.remove('hidden');
    this.pause.classList.add('hidden');
    this.hud.classList.add('hidden');
  }

  showPause(stats: string): void {
    this.setText(this.pauseStats, stats);
    this.pause.classList.remove('hidden');
  }

  hidePause(): void {
    this.pause.classList.add('hidden');
  }

  setMatchBanner(title: string, detail: string, visible: boolean): void {
    this.setText(this.matchBannerTitle, title);
    this.setText(this.matchBannerDetail, detail);
    this.matchBanner.classList.toggle('hidden', !visible);
  }

  setControlHint(message: string): void {
    this.setText(this.controlHint, message);
  }

  showToast(message: string): void {
    this.setText(this.toast, message);
    this.toast.classList.add('visible');
    this.toastTimer = 1.4;
  }

  showHitMarker(): void {
    this.hitMarker.classList.add('visible');
    this.hitTimer = 0.08;
  }

  showDamage(intensity = 1): void {
    this.damageTimer = Math.max(this.damageTimer, Math.min(1, intensity));
  }

  update(
    dt: number,
    player: Player,
    bots: Bot[],
    storm: StormSystem,
    loot: LootSystem,
    buildMode: boolean,
    buildPiece: BuildPieceType,
    fps: number,
    nearbyLoot: string,
    stormDanger: number
  ): void {
    this.setWidth(this.healthBar, `${player.health}%`);
    this.setWidth(this.shieldBar, `${player.shield}%`);
    this.setWidth(this.staminaBar, `${player.stamina}%`);
    this.setText(this.healthText, `${Math.ceil(player.health)}`);
    this.setText(this.shieldText, `${Math.ceil(player.shield)}`);
    this.setText(this.staminaText, `${Math.ceil(player.stamina)}`);
    this.setText(this.stormStatus, `${storm.phaseText()} | ${Math.round(storm.radius)}m`);
    let alive = player.alive ? 1 : 0;
    for (const bot of bots) {
      if (bot.alive) alive += 1;
    }
    this.setText(this.aliveStatus, `Alive ${alive} | ${fps} FPS`);
    this.setText(this.materials, `Materials ${Math.floor(player.materials)}`);
    this.setText(this.buildStatus, buildMode ? `Build ${labelBuild(buildPiece)}` : 'Combat');
    this.setText(this.nearbyLoot, nearbyLoot);

    const active = player.inventory.describeActive();
    this.setText(this.weaponName, active.name);
    this.setText(this.ammoStatus, active.reloading ? 'Reloading' : active.ammo);
    const weapon = player.inventory.activeWeapon;
    if (weapon && weapon.reloadRemaining > 0) {
      const definition = WEAPONS[weapon.weaponId];
      const progress = 1 - weapon.reloadRemaining / definition.reloadTime;
      this.setWidth(this.reloadBar, `${Math.max(0, Math.min(1, progress)) * 100}%`);
    } else {
      this.setWidth(this.reloadBar, '0%');
    }
    this.updateInventory(player.inventory.slots, player.inventory.activeIndex);
    this.updateTimers(dt);
    this.stormVeil.style.opacity = `${Math.min(0.5, stormDanger * 0.5)}`;
    this.minimapTimer -= dt;
    if (this.minimapTimer <= 0) {
      this.drawMinimap(player, bots, storm, loot);
      this.minimapTimer = 0.1;
    }
  }

  private createInventorySlots(): void {
    this.inventory.innerHTML = '';
    this.slots = [];
    for (let i = 0; i < 5; i += 1) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.innerHTML = `<div class="slot-icon"></div><div>${i + 1}</div>`;
      this.inventory.append(slot);
      this.slots.push(slot);
    }
  }

  private updateInventory(slots: (WeaponItem | null)[], activeIndex: number): void {
    const signature = slots
      .map((slot, index) => `${index === activeIndex ? '*' : ''}${slot ? `${slot.weaponId}:${slot.magazine}:${slot.reserve}` : '-'}`)
      .join('|');
    if (signature === this.inventorySignature) return;
    this.inventorySignature = signature;

    for (let i = 0; i < this.slots.length; i += 1) {
      const slot = this.slots[i];
      const weapon = slots[i];
      slot.classList.toggle('active', i === activeIndex);
      const icon = slot.querySelector<HTMLElement>('.slot-icon');
      const label = slot.lastElementChild as HTMLElement;
      if (weapon) {
        const definition = WEAPONS[weapon.weaponId];
        if (icon) icon.style.background = String(definition.color);
        this.setText(label, definition.name.replace(' ', '\n'));
      } else {
        if (icon) icon.style.background = '#4d5b66';
        this.setText(label, `${i + 1}`);
      }
    }
  }

  private updateTimers(dt: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) {
        this.toast.classList.remove('visible');
      }
    }
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) {
        this.hitMarker.classList.remove('visible');
      }
    }
    if (this.damageTimer > 0) {
      this.damageTimer = Math.max(0, this.damageTimer - dt * 2.2);
      this.damageFlash.style.opacity = `${this.damageTimer * 0.42}`;
    } else if (this.damageFlash.style.opacity !== '0') {
      this.damageFlash.style.opacity = '0';
    }
  }

  private setText(element: HTMLElement, value: string): void {
    if (this.textCache.get(element) === value) return;
    this.textCache.set(element, value);
    element.textContent = value;
  }

  private setWidth(element: HTMLElement, value: string): void {
    if (this.widthCache.get(element) === value) return;
    this.widthCache.set(element, value);
    element.style.width = value;
  }

  private drawMinimap(player: Player, bots: Bot[], storm: StormSystem, loot: LootSystem): void {
    const ctx = this.minimapContext;
    if (!ctx) return;
    const size = this.minimap.width;
    const center = size / 2;
    const scale = center / ARENA_RADIUS;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#162330';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#6fbf8a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center, center, ARENA_RADIUS * scale, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#57d2ff';
    ctx.beginPath();
    ctx.arc(center + storm.center.x * scale, center + storm.center.z * scale, storm.radius * scale, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#ffe66d';
    const items = loot.getItems();
    const itemLimit = Math.min(28, items.length);
    for (let i = 0; i < itemLimit; i += 1) {
      const item = items[i];
      ctx.fillRect(center + item.mesh.position.x * scale - 1, center + item.mesh.position.z * scale - 1, 2, 2);
    }

    ctx.fillStyle = '#ff6572';
    for (const bot of bots) {
      if (!bot.alive) continue;
      ctx.beginPath();
      ctx.arc(center + bot.position.x * scale, center + bot.position.z * scale, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#f8fcff';
    ctx.beginPath();
    ctx.arc(center + player.position.x * scale, center + player.position.z * scale, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function labelBuild(type: BuildPieceType): string {
  if (type === 'wall') return 'Wall';
  if (type === 'floor') return 'Floor';
  if (type === 'ramp') return 'Ramp';
  return 'Roof';
}

function getEl<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id}`);
  }
  return element as T;
}
