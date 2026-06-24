// Input adapter: turns keyboard + on-screen touch controls into the core's
// Inputs shape. Carries no game logic. Player input is keyed by id so a 2nd
// player slots in later without touching the core.

import type { Inputs, Direction } from '../core/types';

export class InputManager {
  private keys = new Set<string>();
  private touchDir: Direction | null = null;
  private touchFire = false;
  /** A one-shot "confirm/start" press (Enter/Space, FIRE button, or tap). */
  confirmPressed = false;
  /** One-shot menu cursor move: -1 up, +1 down, 0 none. */
  private menuMove = 0;
  /** One-shot pause toggle (Esc/P or the touch pause button). */
  private pausePressed = false;
  /** One-shot quit-to-title (Q), used from the pause screen. */
  private quitPressed = false;
  /** Set from main.ts to unlock Web Audio directly from a touch gesture (required on iOS Safari). */
  audioUnlock: (() => void) | null = null;
  private quitBtnEl: HTMLElement | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.buildTouchControls();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'].includes(e.code)) e.preventDefault();
    if ((e.code === 'Space' || e.code === 'Enter') && !this.keys.has(e.code)) this.confirmPressed = true;
    if (e.code === 'ArrowUp' && !this.keys.has(e.code)) this.menuMove = -1;
    if (e.code === 'ArrowDown' && !this.keys.has(e.code)) this.menuMove = 1;
    if ((e.code === 'Escape' || e.code === 'KeyP') && !this.keys.has(e.code)) this.pausePressed = true;
    if (e.code === 'KeyQ' && !this.keys.has(e.code)) this.quitPressed = true;
    this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };

  private keyDir(): Direction | null {
    if (this.keys.has('ArrowUp')) return 'up';
    if (this.keys.has('ArrowDown')) return 'down';
    if (this.keys.has('ArrowLeft')) return 'left';
    if (this.keys.has('ArrowRight')) return 'right';
    return null;
  }

  /** Snapshot for the core this frame. */
  sample(): Inputs {
    const dir = this.keyDir() ?? this.touchDir;
    const fire = this.keys.has('Space') || this.touchFire;
    return { 0: { dir, fire } };
  }

  /** Read & clear the one-shot confirm. */
  takeConfirm(): boolean {
    const c = this.confirmPressed;
    this.confirmPressed = false;
    return c;
  }

  /** Read & clear the one-shot menu cursor move (-1 up / +1 down / 0). */
  takeMenuMove(): number {
    const m = this.menuMove;
    this.menuMove = 0;
    return m;
  }

  /** Read & clear the one-shot pause toggle. */
  takePause(): boolean {
    const p = this.pausePressed;
    this.pausePressed = false;
    return p;
  }

  /** Read & clear the one-shot quit-to-title press. */
  takeQuit(): boolean {
    const q = this.quitPressed;
    this.quitPressed = false;
    return q;
  }

  /** Show or hide the mobile QUIT button; call when entering / leaving pause. */
  showQuitHint(show: boolean): void {
    if (this.quitBtnEl) this.quitBtnEl.style.display = show ? 'flex' : 'none';
  }

  private callUnlock(): void {
    if (this.audioUnlock) { this.audioUnlock(); this.audioUnlock = null; }
  }

  // --- touch controls (only shown when a touch is detected) ---------------

  private buildTouchControls(): void {
    if (!('ontouchstart' in window)) return;
    const pad = document.createElement('div');
    pad.style.cssText = 'position:fixed;inset:0;z-index:10;pointer-events:none;touch-action:none;';

    const B = 'position:absolute;width:56px;height:56px;background:rgba(60,80,120,.18);border:2px solid rgba(150,180,220,.30);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.55);font-size:22px;pointer-events:none;';
    pad.innerHTML = `
      <div id="dpad" style="position:fixed;left:18px;bottom:18px;width:168px;height:168px;pointer-events:auto;touch-action:none;">
        <div id="du" style="${B}left:56px;top:0;border-radius:10px 10px 4px 4px;">▲</div>
        <div id="dd" style="${B}left:56px;bottom:0;border-radius:4px 4px 10px 10px;">▼</div>
        <div id="dl" style="${B}left:0;top:56px;border-radius:10px 4px 4px 10px;">◄</div>
        <div id="dr" style="${B}right:0;top:56px;border-radius:4px 10px 10px 4px;">►</div>
        <div style="position:absolute;left:56px;top:56px;width:56px;height:56px;background:rgba(40,55,90,.18);border:2px solid rgba(150,180,220,.15);border-radius:4px;pointer-events:none;"></div>
      </div>
      <div id="fire" style="position:fixed;right:24px;bottom:40px;width:96px;height:96px;border-radius:50%;
        background:rgba(255,80,60,.14);border:2px solid rgba(255,120,90,.40);pointer-events:auto;
        display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.55);font:700 16px system-ui;">FIRE</div>
      <div id="pause" style="position:fixed;right:18px;top:18px;width:40px;height:40px;border-radius:8px;
        background:rgba(40,60,90,.18);border:2px solid rgba(150,180,220,.30);pointer-events:auto;
        display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.55);font:700 16px system-ui;">II</div>
      <div id="quit" style="position:fixed;right:66px;top:18px;width:44px;height:40px;border-radius:8px;
        background:rgba(180,40,20,.18);border:2px solid rgba(255,100,80,.30);pointer-events:auto;
        display:none;align-items:center;justify-content:center;color:rgba(255,255,255,.55);font:700 11px system-ui;">QUIT</div>`;
    document.body.appendChild(pad);

    const dpad  = pad.querySelector('#dpad')  as HTMLElement;
    const btnU  = pad.querySelector('#du')    as HTMLElement;
    const btnD  = pad.querySelector('#dd')    as HTMLElement;
    const btnL  = pad.querySelector('#dl')    as HTMLElement;
    const btnR  = pad.querySelector('#dr')    as HTMLElement;
    const fire  = pad.querySelector('#fire')  as HTMLElement;
    const pause = pad.querySelector('#pause') as HTMLElement;
    const quit  = pad.querySelector('#quit')  as HTMLElement;
    this.quitBtnEl = quit;

    const ACTIVE = 'rgba(120,160,255,.42)';
    const BASE   = 'rgba(60,80,120,.18)';
    const highlight = (dir: Direction | null) => {
      btnU.style.background = dir === 'up'    ? ACTIVE : BASE;
      btnD.style.background = dir === 'down'  ? ACTIVE : BASE;
      btnL.style.background = dir === 'left'  ? ACTIVE : BASE;
      btnR.style.background = dir === 'right' ? ACTIVE : BASE;
    };

    const updateDir = (t: Touch) => {
      const r = dpad.getBoundingClientRect();
      const dx = t.clientX - (r.left + r.width  / 2);
      const dy = t.clientY - (r.top  + r.height / 2);
      if (Math.abs(dx) < 16 && Math.abs(dy) < 16) { this.touchDir = null; highlight(null); return; }
      this.touchDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      highlight(this.touchDir);
    };
    const clearDir = () => { this.touchDir = null; highlight(null); };

    const dpadStart = (e: TouchEvent) => {
      e.preventDefault();
      this.callUnlock();
      updateDir(e.touches[0]);
      if (this.touchDir === 'up')   this.menuMove = -1;
      else if (this.touchDir === 'down') this.menuMove = 1;
    };
    dpad.addEventListener('touchstart',  dpadStart, { passive: false });
    dpad.addEventListener('touchmove',   (e) => { e.preventDefault(); updateDir(e.touches[0]); }, { passive: false });
    dpad.addEventListener('touchend',    (e) => { e.preventDefault(); clearDir(); }, { passive: false });
    dpad.addEventListener('touchcancel', (e) => { e.preventDefault(); clearDir(); }, { passive: false });

    pause.addEventListener('touchstart', (e) => { e.preventDefault(); this.callUnlock(); this.pausePressed = true; }, { passive: false });
    quit.addEventListener('touchstart',  (e) => { e.preventDefault(); this.callUnlock(); this.quitPressed  = true; }, { passive: false });

    const fireOn  = (e: TouchEvent) => { e.preventDefault(); this.callUnlock(); this.touchFire = true; this.confirmPressed = true; };
    const fireOff = (e: TouchEvent) => { e.preventDefault(); this.touchFire = false; };
    fire.addEventListener('touchstart',  fireOn,  { passive: false });
    fire.addEventListener('touchend',    fireOff, { passive: false });
    fire.addEventListener('touchcancel', fireOff, { passive: false });

    this.canvas.addEventListener('touchstart', () => { this.callUnlock(); this.confirmPressed = true; });
  }
}
