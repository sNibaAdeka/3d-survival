import * as THREE from 'three';
import { BOT_COUNT, MAX_DELTA_SECONDS } from './constants';
import { applySpread, clamp } from './utils';
import { InputManager } from './InputManager';
import { PerformanceManager } from './PerformanceManager';
import { World } from './World';
import { Player } from './Player';
import { CameraController } from './CameraController';
import { BuildingSystem } from './BuildingSystem';
import { LootSystem } from './LootSystem';
import { StormSystem } from './StormSystem';
import { EffectsManager } from './EffectsManager';
import { HUD } from './HUD';
import { Bot } from './Bot';
import type { BuildPiece, Quality, WeaponItem } from './types';
import { startReload, WEAPONS } from './weapons';

type ShotOwner = 'player' | 'bot';

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly input: InputManager;
  private readonly performance: PerformanceManager;
  private readonly world: World;
  private readonly player = new Player();
  private readonly cameraController: CameraController;
  private readonly building: BuildingSystem;
  private readonly loot: LootSystem;
  private readonly storm: StormSystem;
  private readonly effects: EffectsManager;
  private readonly hud = new HUD();
  private readonly bots: Bot[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly playerRaycastTargets: THREE.Object3D[] = [];
  private readonly botRaycastTargets: THREE.Object3D[] = [];
  private readonly raycastHits: THREE.Intersection[] = [];
  private readonly shotOrigin = new THREE.Vector3();
  private readonly shotDirection = new THREE.Vector3();
  private readonly tracerStart = new THREE.Vector3();
  private readonly tracerEnd = new THREE.Vector3();
  private active = false;
  private paused = false;
  private introRemaining = 0;
  private spawnProtectionRemaining = 0;
  private lastTime = 0;
  private elapsed = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.input = new InputManager(canvas);
    this.performance = new PerformanceManager(this.renderer);
    this.cameraController = new CameraController(window.innerWidth / window.innerHeight);
    this.world = new World(this.scene);
    this.building = new BuildingSystem(this.scene, this.world);
    this.loot = new LootSystem(this.scene, this.world);
    this.storm = new StormSystem(this.scene, this.world);
    this.effects = new EffectsManager(this.scene);
  }

  boot(): void {
    this.performance.setQuality('medium');
    this.configureScene();
    this.world.build();
    this.scene.add(this.player.group);
    this.player.reset(this.world.getSpawnPoint());
    this.cameraController.yaw = Math.PI;

    this.hud.bindPlay(() => this.startMatch());
    this.hud.bindRestart(() => this.startMatch());
    this.hud.bindPause(() => this.togglePause());
    this.hud.bindResume(() => this.resumeMatch());
    this.hud.bindPauseRestart(() => this.startMatch());
    this.hud.bindQuality((quality: Quality) => this.performance.setQuality(quality));
    window.addEventListener('resize', this.onResize);
    requestAnimationFrame(this.loop);
  }

  private startMatch(): void {
    this.active = true;
    this.paused = false;
    this.introRemaining = 3;
    this.spawnProtectionRemaining = 8;
    this.elapsed = 0;
    this.player.reset(this.world.getSpawnPoint());
    this.building.reset();
    this.world.clearBuildPieces();
    this.loot.reset();
    this.loot.spawnInitial();
    this.storm.reset();
    this.clearBots();
    this.spawnBots();
    this.hud.showGame();
    this.hud.setMatchBanner('Deploying', '3', true);
    this.hud.showToast('Deploying');
    this.input.requestPointerLock();
  }

  private configureScene(): void {
    this.scene.background = new THREE.Color('#9bd7ef');
    this.scene.fog = new THREE.FogExp2('#9bd7ef', 0.0065);

    const hemi = new THREE.HemisphereLight('#f7fbff', '#3d6d5a', 1.7);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight('#fff1c7', 2.8);
    sun.position.set(-52, 78, -36);
    sun.castShadow = true;
    sun.shadow.camera.left = -135;
    sun.shadow.camera.right = 135;
    sun.shadow.camera.top = 135;
    sun.shadow.camera.bottom = -135;
    sun.shadow.camera.near = 5;
    sun.shadow.camera.far = 220;
    sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(sun);
  }

  private spawnBots(): void {
    for (let i = 0; i < BOT_COUNT; i += 1) {
      const bot = new Bot(i, this.world.getSpawnPoint(this.player.position, 48));
      this.bots.push(bot);
      this.scene.add(bot.group);
    }
  }

  private clearBots(): void {
    for (const bot of this.bots) {
      this.scene.remove(bot.group);
    }
    this.bots.length = 0;
  }

  private readonly loop = (time: number): void => {
    const rawDt = this.lastTime ? (time - this.lastTime) / 1000 : 0;
    const dt = Math.min(MAX_DELTA_SECONDS, rawDt);
    const timerDt = rawDt;
    this.lastTime = time;

    if (this.active) {
      this.update(dt, timerDt);
    } else {
      this.cameraController.update(dt, { dx: 0, dy: 0 }, this.player, this.world);
    }

    this.renderer.render(this.scene, this.cameraController.camera);
    requestAnimationFrame(this.loop);
  };

  private update(dt: number, timerDt: number): void {
    if (this.input.consumePressed('Escape') || this.input.consumePressed('KeyP')) {
      this.togglePause();
    }

    if (this.paused) {
      this.input.consumeMouseDelta();
      this.input.endFrame();
      return;
    }

    this.elapsed += timerDt;
    const mouseDelta = this.input.consumeMouseDelta();
    this.applyKeyboardLook(mouseDelta, dt);
    const combatEnabled = this.introRemaining <= 0;

    this.handlePlayerInput();
    this.player.inventory.update(dt);
    this.player.update(dt, this.input, this.cameraController.yaw, this.world);
    this.cameraController.update(dt, mouseDelta, this.player, this.world);
    this.building.update(this.cameraController, this.player);
    this.loot.update(this.elapsed);
    if (combatEnabled) {
      this.storm.update(timerDt);
      this.spawnProtectionRemaining = Math.max(0, this.spawnProtectionRemaining - timerDt);
      this.hud.setMatchBanner('', '', false);
    } else {
      this.introRemaining = Math.max(0, this.introRemaining - timerDt);
      if (this.introRemaining <= 0) {
        this.hud.setMatchBanner('', '', false);
      } else {
        this.hud.setMatchBanner('Deploying', `${Math.ceil(this.introRemaining)}`, true);
      }
    }
    this.effects.update(dt);
    this.performance.update(dt);

    if (combatEnabled && this.player.alive && this.storm.isOutside(this.player.position)) {
      if (this.player.damage(this.storm.damagePerSecond * timerDt)) {
        this.finishMatch(false);
      }
      this.hud.showDamage(0.22);
    }

    for (const bot of this.bots) {
      bot.update(dt, {
        player: this.player,
        world: this.world,
        loot: this.loot,
        storm: this.storm,
        combatEnabled,
        fireBotWeapon: (actor, origin, direction) => this.fireWeapon(actor.weapon, origin, direction, 'bot', true, true),
        placeBotCover: (actor) => this.building.placeBotWall(actor.position, this.player.position)
      });
      if (combatEnabled && bot.alive && this.storm.isOutside(bot.position)) {
        if (bot.damage(this.storm.damagePerSecond * timerDt)) {
          this.loot.spawnDeathDrop(bot.position);
        }
      }
    }

    let aliveBots = 0;
    for (const bot of this.bots) {
      if (bot.alive) aliveBots += 1;
    }
    if (this.player.alive && aliveBots === 0) {
      this.finishMatch(true);
    }

    const edgeDistance = this.storm.distanceToEdge(this.player.position);
    const stormDanger = this.storm.isOutside(this.player.position) ? 1 : clamp((16 - edgeDistance) / 16, 0, 1);
    const safeStart = Math.ceil(this.spawnProtectionRemaining);
    const lockHint = this.input.pointerLocked ? 'Mouse locked' : 'Click the arena for mouse look';
    this.hud.setControlHint(safeStart > 0 ? `${lockHint} | Safe ${safeStart}s` : lockHint);

    this.hud.update(
      dt,
      this.player,
      this.bots,
      this.storm,
      this.loot,
      this.building.active,
      this.building.pieceType,
      this.performance.fps,
      this.loot.getNearbyLabel(this.player),
      stormDanger
    );
    this.input.endFrame();
  }

  private handlePlayerInput(): void {
    const wheelSteps = this.input.consumeWheelSteps();

    for (let i = 0; i < 5; i += 1) {
      if (this.input.consumePressed(`Digit${i + 1}`)) {
        this.player.inventory.switchTo(i);
      }
    }

    if (this.input.consumePressed('KeyQ') || this.input.consumePressed('KeyB')) {
      this.building.toggle();
      this.hud.showToast(this.building.active ? 'Build mode' : 'Combat mode');
    }

    if (this.building.active) {
      if (this.input.consumePressed('KeyZ') || this.input.consumePressed('F1')) this.building.setPiece('wall');
      if (this.input.consumePressed('KeyX') || this.input.consumePressed('F2')) this.building.setPiece('floor');
      if (this.input.consumePressed('KeyC') || this.input.consumePressed('F3')) this.building.setPiece('ramp');
      if (this.input.consumePressed('KeyV') || this.input.consumePressed('F4')) this.building.setPiece('roof');
      if (wheelSteps !== 0) {
        this.building.cyclePiece(wheelSteps > 0 ? 1 : -1);
        this.hud.showToast(`Build ${this.building.pieceType}`);
      }
      if (this.input.consumeMousePressed(0)) {
        this.building.update(this.cameraController, this.player);
        const result = this.building.placeFromPreview(this.player);
        if (result.placed) {
          this.hud.showToast('Built');
        } else if (result.reason) {
          this.hud.showToast(result.reason);
        }
      }
    } else {
      if (wheelSteps !== 0) {
        this.player.inventory.cycle(wheelSteps > 0 ? 1 : -1);
      }
      const pressed = this.input.consumeMousePressed(0);
      const held = this.input.isMouseDown(0);
      const weapon = this.player.inventory.activeWeapon;
      const automatic = weapon ? WEAPONS[weapon.weaponId].automatic : false;
      if (pressed || (automatic && held)) {
        this.shotOrigin.copy(this.cameraController.camera.position);
        this.cameraController.camera.getWorldDirection(this.shotDirection);
        this.fireWeapon(weapon, this.shotOrigin, this.shotDirection, 'player', pressed, held);
      }
    }

    if (this.input.consumePressed('KeyR')) {
      const weapon = this.player.inventory.activeWeapon;
      if (weapon && startReload(weapon)) {
        this.hud.showToast('Reloading');
      }
    }

    if (this.input.consumePressed('KeyE') || this.input.consumePressed('KeyF')) {
      const message = this.loot.tryPickupPlayer(this.player);
      if (message) {
        this.hud.showToast(message);
      }
    }
  }

  private applyKeyboardLook(mouseDelta: { dx: number; dy: number }, dt: number): void {
    const lookSpeed = 760 * dt;
    if (this.input.isDown('ArrowLeft')) mouseDelta.dx -= lookSpeed;
    if (this.input.isDown('ArrowRight')) mouseDelta.dx += lookSpeed;
    if (this.input.isDown('ArrowUp')) mouseDelta.dy -= lookSpeed;
    if (this.input.isDown('ArrowDown')) mouseDelta.dy += lookSpeed;
  }

  private fireWeapon(
    weapon: WeaponItem | null,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    owner: ShotOwner,
    triggerPressed: boolean,
    triggerHeld: boolean
  ): boolean {
    if (!weapon) return false;
    const definition = WEAPONS[weapon.weaponId];
    const wantsFire = definition.automatic ? triggerHeld : triggerPressed;
    if (!wantsFire || weapon.reloadRemaining > 0 || weapon.cooldown > 0) {
      return false;
    }

    if (weapon.magazine <= 0) {
      startReload(weapon);
      if (owner === 'player') {
        this.hud.showToast('Reloading');
      }
      return false;
    }

    weapon.magazine -= 1;
    weapon.cooldown = 1 / definition.fireRate;

    this.scene.updateMatrixWorld(true);
    const targets = this.collectRaycastTargets(owner);
    const spreadMultiplier = owner === 'player' && this.player.aiming ? 0.46 : owner === 'bot' ? 2.8 : 1;
    for (let i = 0; i < definition.pellets; i += 1) {
      const rayDirection = applySpread(direction, definition.spread * spreadMultiplier);
      this.fireRay(origin, rayDirection, definition.range, definition.damage, owner, definition.color, targets);
    }
    return true;
  }

  private fireRay(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    range: number,
    damage: number,
    owner: ShotOwner,
    color: THREE.ColorRepresentation,
    targetObjects: THREE.Object3D[]
  ): void {
    this.raycaster.set(origin, direction);
    this.raycaster.near = 0.2;
    this.raycaster.far = range;
    this.raycastHits.length = 0;
    this.raycaster.intersectObjects(targetObjects, false, this.raycastHits);

    let hit: THREE.Intersection | null = null;
    for (const entry of this.raycastHits) {
      if (entry.distance > 0.25 && entry.object.visible !== false) {
        hit = entry;
        break;
      }
    }

    const end = hit ? hit.point : this.tracerEnd.copy(origin).addScaledVector(direction, range);
    this.tracerStart.copy(origin).addScaledVector(direction, 0.8);
    this.effects.spawnTracer(this.tracerStart, end, color);
    this.raycastHits.length = 0;

    if (!hit) return;
    const kind = hit.object.userData.kind;
    if (kind === 'bot' && owner === 'player') {
      const bot = hit.object.userData.entity as Bot;
      if (bot.alive && bot.damage(damage)) {
        this.player.kills += 1;
        this.loot.spawnDeathDrop(bot.position);
        this.hud.showToast(`Eliminated ${this.player.kills}`);
      }
      this.hud.showHitMarker();
      this.effects.spawnSpark(hit.point, '#ffe66d');
      return;
    }

    if (kind === 'player' && owner === 'bot') {
      if (this.spawnProtectionRemaining > 0) {
        this.effects.spawnSpark(hit.point, '#57d2ff');
        return;
      }
      if (this.player.damage(damage * 0.35)) {
        this.finishMatch(false);
      }
      this.hud.showDamage(damage / 36);
      this.effects.spawnSpark(hit.point, '#ff6572');
      return;
    }

    if (kind === 'build') {
      const piece = hit.object.userData.piece as BuildPiece | undefined;
      if (piece) {
        this.building.damagePiece(piece, damage * 1.35);
      }
      this.effects.spawnSpark(hit.point, '#f0d4a1');
      return;
    }

    this.effects.spawnSpark(hit.point, '#f8fcff');
  }

  private collectRaycastTargets(owner: ShotOwner): THREE.Object3D[] {
    const objects = owner === 'player' ? this.playerRaycastTargets : this.botRaycastTargets;
    objects.length = 0;
    objects.push(...this.world.solidMeshes);
    if (owner === 'player') {
      for (const bot of this.bots) {
        if (bot.alive) objects.push(...bot.hitMeshes);
      }
    } else if (this.player.alive) {
      objects.push(...this.player.hitMeshes);
    }
    return objects;
  }

  private togglePause(): void {
    if (!this.active) return;
    if (this.paused) {
      this.resumeMatch();
      return;
    }
    this.paused = true;
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
    this.hud.showPause(`Kills ${this.player.kills} | Time ${Math.floor(this.elapsed)}s`);
  }

  private resumeMatch(): void {
    if (!this.active) return;
    this.paused = false;
    this.hud.hidePause();
    this.input.requestPointerLock();
  }

  private finishMatch(victory: boolean): void {
    if (!this.active) return;
    this.active = false;
    this.paused = false;
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
    this.hud.hidePause();
    this.hud.setMatchBanner('', '', false);
    const title = victory ? 'Victory' : 'Eliminated';
    const stats = `Kills ${this.player.kills} | Time ${Math.floor(this.elapsed)}s`;
    this.hud.showResult(title, stats);
  }

  private readonly onResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.cameraController.resize(window.innerWidth / window.innerHeight);
    this.performance.setQuality(this.performance.quality);
  };
}
