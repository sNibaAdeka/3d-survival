export class InputManager {
  private readonly keys = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly mouseButtons = new Set<number>();
  private readonly mousePressed = new Set<number>();
  private pointerLockDenied = false;
  private wheelSteps = 0;
  private mouseDX = 0;
  private mouseDY = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.tabIndex = 0;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('blur', this.reset);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  get needsMouseLockHint(): boolean {
    return !this.pointerLocked;
  }

  get usingSoftMouseLook(): boolean {
    return !this.pointerLocked && this.pointerLockDenied;
  }

  requestPointerLock(): void {
    this.canvas.focus();
    try {
      const request = this.canvas.requestPointerLock();
      if (request instanceof Promise) {
        request.catch(() => {
          this.pointerLockDenied = true;
        });
      }
    } catch {
      this.pointerLockDenied = true;
    }
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  consumePressed(code: string): boolean {
    const hasPressed = this.pressed.has(code);
    this.pressed.delete(code);
    return hasPressed;
  }

  isMouseDown(button: number): boolean {
    return this.mouseButtons.has(button);
  }

  consumeMousePressed(button: number): boolean {
    const hasPressed = this.mousePressed.has(button);
    this.mousePressed.delete(button);
    return hasPressed;
  }

  consumeMouseDelta(): { dx: number; dy: number } {
    const delta = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return delta;
  }

  consumeWheelSteps(): number {
    const steps = this.wheelSteps;
    this.wheelSteps = 0;
    return steps;
  }

  endFrame(): void {
    this.pressed.clear();
    this.mousePressed.clear();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('blur', this.reset);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.isEditableTarget(event.target)) return;
    if (
      event.code.startsWith('Arrow') ||
      event.code === 'Space' ||
      event.code === 'Tab' ||
      event.code === 'ShiftLeft' ||
      event.code === 'ShiftRight' ||
      ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyF', 'KeyR', 'KeyB', 'KeyP'].includes(event.code)
    ) {
      event.preventDefault();
    }
    if (!event.repeat) {
      this.pressed.add(event.code);
    }
    this.keys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (this.isEditableTarget(event.target)) return;
    this.keys.delete(event.code);
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked && !this.isCanvasLikeTarget(event.target)) return;
    this.mouseDX += event.movementX;
    this.mouseDY += event.movementY;
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (!this.isCanvasLikeTarget(event.target)) return;
    this.canvas.focus();
    this.mouseButtons.add(event.button);
    this.mousePressed.add(event.button);
    if (!this.pointerLocked) {
      this.requestPointerLock();
    }
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    this.mouseButtons.delete(event.button);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.isCanvasLikeTarget(event.target)) return;
    event.preventDefault();
    this.wheelSteps += event.deltaY > 0 ? 1 : -1;
  };

  private readonly onPointerLockChange = (): void => {
    this.pointerLockDenied = !this.pointerLocked && this.pointerLockDenied;
  };

  private readonly onPointerLockError = (): void => {
    this.pointerLockDenied = true;
  };

  private readonly reset = (): void => {
    this.keys.clear();
    this.pressed.clear();
    this.mouseButtons.clear();
    this.mousePressed.clear();
    this.wheelSteps = 0;
    this.mouseDX = 0;
    this.mouseDY = 0;
  };

  private isCanvasLikeTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    if (target.closest('button, select, input, textarea, label')) return false;
    return target === this.canvas || target.id === 'app' || target.closest('#hud') !== null || target === document.body;
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]') !== null;
  }
}
