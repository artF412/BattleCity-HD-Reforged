// Render adapter (Canvas). HD vector art drawn entirely in code — no image
// assets. Style contract (from the PRD): solid objects (tanks, walls) are
// semi-realistic metallic vector with rim-light; energy elements (bullets,
// explosions, muzzle flash, power-ups, eagle, UI accents) glow neon on a dark
// field. Adds particles & screen shake. Honours devicePixelRatio.

import { TILE, CELL, GRID, FIELD, MAT, BASE_TILE, ENEMY_SCORE } from '../core/constants';
import type { GameState, Tank, GameEvent, Direction, PowerUpKind } from '../core/types';

const PAD = 8;
const HUD_W = 64;
const DESIGN_W = PAD + FIELD + PAD + HUD_W + PAD; // 296
const DESIGN_H = PAD + FIELD + PAD; // 224
const FX = PAD, FY = PAD; // field origin in design space

const TANK_COLOR: Record<string, string> = {
  player: '#e8c84a',
  BASIC: '#9aa6b2',
  FAST: '#6fe0cf',
  POWER: '#c578d6',
  ARMOR: '#e08a4c',
};

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }

export class Renderer {
  ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private shake = 0;
  private time = 0;

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const s = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
    this.canvas.width = Math.floor(DESIGN_W * s * dpr);
    this.canvas.height = Math.floor(DESIGN_H * s * dpr);
    this.canvas.style.width = `${DESIGN_W * s}px`;
    this.canvas.style.height = `${DESIGN_H * s}px`;
    this.ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
  }

  consumeEvents(events: GameEvent[]): void {
    for (const e of events) {
      if (e.t === 'shake') this.shake = Math.max(this.shake, e.amount);
      else if (e.t === 'explodeSmall') this.burst(e.x, e.y, 10, '#ffd27f', 1.4);
      else if (e.t === 'explodeBig') { this.burst(e.x, e.y, 26, '#ff8a3c', 2.4); this.burst(e.x, e.y, 14, '#fff2c2', 1.6); }
      else if (e.t === 'brickHit') this.burst(e.x, e.y, 6, '#c2745a', 1);
      else if (e.t === 'steelHit') this.burst(e.x, e.y, 6, '#cfd6de', 1);
      else if (e.t === 'baseDestroyed') this.burst(96 + FX, 192 + FY, 40, '#ff5a3c', 3);
      else if (e.t === 'powerupSpawn') this.burst(e.x, e.y, 12, '#7fe3ff', 1.4);
    }
  }

  private burst(x: number, y: number, n: number, color: string, power: number): void {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random();
      const sp = (0.4 + Math.random() * 1.6) * power;
      this.particles.push({
        x: x + FX, y: y + FY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 1, max: 1, color, size: 1 + Math.random() * 2 * power,
      });
    }
  }

  // --- frame --------------------------------------------------------------

  draw(state: GameState, dtMs: number): void {
    this.time += dtMs;
    const ctx = this.ctx;

    let ox = 0, oy = 0;
    if (this.shake > 0) {
      ox = (Math.random() * 2 - 1) * this.shake;
      oy = (Math.random() * 2 - 1) * this.shake;
      this.shake = Math.max(0, this.shake - dtMs * 0.04);
    }
    ctx.save();
    ctx.translate(ox, oy);

    this.drawBackground();
    this.drawTerrain(state, [MAT.WATER, MAT.ICE]);
    this.drawTerrain(state, [MAT.BRICK, MAT.STEEL]);
    this.drawBase(state);
    for (const t of state.tanks) this.drawTank(t);
    this.drawBullets(state);
    this.drawPowerups(state);
    this.drawParticles(dtMs);
    this.drawTerrain(state, [MAT.TREES]); // trees hide tanks beneath them
    ctx.restore();

    this.drawHud(state);
  }

  private drawBackground(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    // field plate
    ctx.fillStyle = '#0c0f16';
    ctx.fillRect(FX, FY, FIELD, FIELD);
    // faint grid
    ctx.strokeStyle = 'rgba(90,120,160,0.06)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 0; i <= FIELD; i += TILE) {
      ctx.moveTo(FX + i, FY); ctx.lineTo(FX + i, FY + FIELD);
      ctx.moveTo(FX, FY + i); ctx.lineTo(FX + FIELD, FY + i);
    }
    ctx.stroke();
  }

  private drawTerrain(state: GameState, mats: number[]): void {
    for (let cy = 0; cy < GRID; cy++) {
      for (let cx = 0; cx < GRID; cx++) {
        const m = state.terrain[cy * GRID + cx];
        if (!mats.includes(m)) continue;
        const x = FX + cx * CELL, y = FY + cy * CELL;
        if (m === MAT.BRICK) this.drawBrick(x, y);
        else if (m === MAT.STEEL) this.drawSteel(x, y);
        else if (m === MAT.WATER) this.drawWater(x, y, cx, cy);
        else if (m === MAT.ICE) this.drawIce(x, y);
        else if (m === MAT.TREES) this.drawTrees(x, y, cx, cy);
      }
    }
  }

  private drawBrick(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#7a3322';
    ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = '#9c4631';
    ctx.fillRect(x, y, CELL, CELL / 2 - 0.5);
    ctx.fillStyle = 'rgba(255,200,170,0.18)';
    ctx.fillRect(x, y, CELL, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, y + CELL / 2 - 0.5, CELL, 1); // mortar line
    ctx.fillRect(x + CELL / 2 - 0.5, y, 1, CELL);
  }

  private drawSteel(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#737d88';
    ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(x, y, CELL, 1.2);
    ctx.fillRect(x, y, 1.2, CELL);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x, y + CELL - 1.2, CELL, 1.2);
    ctx.fillRect(x + CELL - 1.2, y, 1.2, CELL);
    ctx.fillStyle = '#aab3bd';
    ctx.fillRect(x + CELL / 2 - 1, y + CELL / 2 - 1, 2, 2); // rivet
  }

  private drawWater(x: number, y: number, cx: number, cy: number): void {
    const ctx = this.ctx;
    const w = Math.sin(this.time * 0.004 + (cx + cy) * 0.6) * 0.5 + 0.5;
    ctx.fillStyle = `rgb(${20 + w * 10},${70 + w * 40},${150 + w * 60})`;
    ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = `rgba(180,230,255,${0.15 + w * 0.25})`;
    ctx.fillRect(x + 1, y + CELL / 2, CELL - 2, 1);
  }

  private drawIce(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#bcd6e8';
    ctx.fillRect(x, y, CELL, CELL);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x + 1, y + 6); ctx.lineTo(x + 3, y + 2); ctx.lineTo(x + 6, y + 5);
    ctx.stroke();
  }

  private drawTrees(x: number, y: number, cx: number, cy: number): void {
    const ctx = this.ctx;
    const j = ((cx * 7 + cy * 13) % 5) * 0.4;
    ctx.fillStyle = '#1f5d2b';
    ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = '#2f8a3f';
    ctx.beginPath();
    ctx.arc(x + 2 + j, y + 2.5, 2.6, 0, Math.PI * 2);
    ctx.arc(x + 6, y + 5 - j, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,230,140,0.25)';
    ctx.beginPath(); ctx.arc(x + 2 + j, y + 2.5, 1.1, 0, Math.PI * 2); ctx.fill();
  }

  private drawBase(state: GameState): void {
    const ctx = this.ctx;
    const x = FX + BASE_TILE.tx * TILE, y = FY + BASE_TILE.ty * TILE;
    if (!state.baseAlive) {
      ctx.fillStyle = '#2a2a2e';
      ctx.fillRect(x + 2, y + 4, TILE - 4, TILE - 6);
      return;
    }
    const pulse = Math.sin(this.time * 0.005) * 0.4 + 0.6;
    ctx.save();
    ctx.shadowColor = '#ffd54a';
    ctx.shadowBlur = 8 + pulse * 6;
    // eagle silhouette
    ctx.fillStyle = '#ffe27a';
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 3);
    ctx.lineTo(x + 13, y + 13);
    ctx.lineTo(x + 8, y + 11);
    ctx.lineTo(x + 3, y + 13);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff6cf';
    ctx.fillRect(x + 7, y + 5, 2, 5);
    ctx.restore();
  }

  private drawTank(t: Tank): void {
    const ctx = this.ctx;
    const cx = FX + t.x + TILE / 2, cy = FY + t.y + TILE / 2;

    // spawn shimmer
    if (t.appearMs > 0) {
      const p = (Math.sin(this.time * 0.03) * 0.5 + 0.5);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = `rgba(160,230,255,${0.4 + p * 0.5})`;
      ctx.lineWidth = 1.2;
      const r = 3 + p * 5;
      for (let i = 0; i < 4; i++) {
        ctx.save(); ctx.rotate((Math.PI / 2) * i + this.time * 0.01);
        ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(2, 0); ctx.lineTo(0, r); ctx.lineTo(-2, 0); ctx.closePath(); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
      return;
    }

    let color = TANK_COLOR[t.kind] || TANK_COLOR.player;
    if (t.kind === 'ARMOR') {
      const shades = ['#7a5a3a', '#a06a36', '#c98a44', '#e08a4c'];
      color = shades[Math.max(0, Math.min(3, t.hp - 1))];
    }
    if (t.flashing && Math.floor(this.time / 120) % 2 === 0) color = '#ff5a5a';

    const angle = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[t.dir as Direction];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // treads
    ctx.fillStyle = '#2b2f36';
    ctx.fillRect(-7, -7, 3, 14);
    ctx.fillRect(4, -7, 3, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = -6; i < 7; i += 3) { ctx.fillRect(-7, i, 3, 1); ctx.fillRect(4, i, 3, 1); }

    // body with rim-light
    const g = ctx.createLinearGradient(-4, -5, 4, 5);
    g.addColorStop(0, this.lighten(color, 40));
    g.addColorStop(0.5, color);
    g.addColorStop(1, this.lighten(color, -45));
    ctx.fillStyle = g;
    this.roundRect(-4.5, -5, 9, 10, 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.6;
    ctx.stroke();

    // turret + barrel
    ctx.fillStyle = this.lighten(color, -20);
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a3f47';
    ctx.fillRect(-1, -9, 2, 7);
    ctx.restore();

    // shield ring (neon)
    if (t.shieldMs > 0) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = `rgba(120,220,255,${0.5 + Math.sin(this.time * 0.02) * 0.4})`;
      ctx.shadowColor = '#7fdcff'; ctx.shadowBlur = 8; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + this.time * 0.01;
        const px = Math.cos(a) * 9, py = Math.sin(a) * 9;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
  }

  private drawBullets(state: GameState): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = '#fff2a0'; ctx.shadowBlur = 8;
    for (const b of state.bullets) {
      const x = FX + b.x + 2, y = FY + b.y + 2;
      ctx.fillStyle = b.side === 'player' ? '#fff6c8' : '#ff9a6a';
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  private drawPowerups(state: GameState): void {
    const ctx = this.ctx;
    const pulse = Math.sin(this.time * 0.006) * 0.5 + 0.5;
    for (const p of state.powerups) {
      const x = FX + p.x + TILE / 2, y = FY + p.y + TILE / 2;
      ctx.save();
      ctx.translate(x, y);
      ctx.shadowColor = POWERUP_COLOR[p.kind]; ctx.shadowBlur = 6 + pulse * 8;
      ctx.fillStyle = 'rgba(10,12,18,0.7)';
      this.roundRect(-6, -6, 12, 12, 2); ctx.fill();
      ctx.strokeStyle = POWERUP_COLOR[p.kind]; ctx.lineWidth = 1; ctx.stroke();
      this.drawPowerIcon(p.kind);
      ctx.restore();
    }
  }

  private drawPowerIcon(kind: PowerUpKind): void {
    const ctx = this.ctx;
    ctx.fillStyle = POWERUP_COLOR[kind];
    ctx.strokeStyle = POWERUP_COLOR[kind];
    ctx.lineWidth = 1;
    if (kind === 'star') {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 1.8 : 4;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const px = Math.cos(a) * r, py = Math.sin(a) * r;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill();
    } else if (kind === 'helmet') {
      ctx.beginPath(); ctx.arc(0, 0, 4, Math.PI, 0); ctx.fill(); ctx.fillRect(-4, 0, 8, 1.5);
    } else if (kind === 'clock') {
      ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -3); ctx.moveTo(0, 0); ctx.lineTo(2.5, 0); ctx.stroke();
    } else if (kind === 'grenade') {
      ctx.beginPath(); ctx.arc(0, 1, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-1, -4, 2, 2);
    } else if (kind === 'shovel') {
      ctx.fillRect(-1, -4, 2, 5); ctx.beginPath(); ctx.moveTo(-3, 1); ctx.lineTo(3, 1); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill();
    } else if (kind === 'tank') {
      ctx.fillRect(-4, -1, 8, 4); ctx.fillRect(-2, -4, 4, 3); ctx.fillRect(-0.8, -6, 1.6, 3);
    }
  }

  private drawParticles(dtMs: number): void {
    const ctx = this.ctx;
    const next: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dtMs * 0.0025;
      if (p.life <= 0) continue;
      p.x += p.vx * dtMs * 0.06;
      p.y += p.vy * dtMs * 0.06;
      p.vx *= 0.96; p.vy *= 0.96;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
      next.push(p);
    }
    ctx.globalAlpha = 1;
    this.particles = next;
  }

  private drawHud(state: GameState): void {
    const ctx = this.ctx;
    const hx = FX + FIELD + PAD;
    ctx.fillStyle = '#0a0c12';
    ctx.fillRect(hx, FY, HUD_W, FIELD);

    // remaining enemies as little markers
    ctx.fillStyle = '#9aa6b2';
    const remaining = state.enemiesRemaining;
    for (let i = 0; i < remaining; i++) {
      const col = i % 2, row = Math.floor(i / 2);
      ctx.fillRect(hx + 6 + col * 9, FY + 6 + row * 8, 6, 6);
    }

    let ty = FY + 96;
    ctx.fillStyle = '#7fdcff';
    ctx.font = '700 7px system-ui';
    ctx.textBaseline = 'top';
    const line = (label: string, val: string) => {
      ctx.fillStyle = 'rgba(160,180,210,0.7)';
      ctx.fillText(label, hx + 6, ty);
      ctx.fillStyle = '#fff';
      ctx.font = '700 9px system-ui';
      ctx.fillText(val, hx + 6, ty + 8);
      ctx.font = '700 7px system-ui';
      ty += 22;
    };
    line('STAGE', String(state.stageIndex + 1));
    line('LIVES', String(Math.max(0, state.lives)));
    line('SCORE', String(state.score));
    line('STAR', String(state.tanks.find((t) => t.side === 'player')?.starLevel ?? 0));
  }

  // --- menu / overlay screens --------------------------------------------

  private menuBg(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    ctx.fillStyle = 'rgba(40,90,140,0.05)';
    for (let i = 0; i < DESIGN_H; i += 4) ctx.fillRect(0, i, DESIGN_W, 1);
  }

  private centerText(text: string, y: number, size: number, color: string, glow = 0): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${size}px system-ui`;
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
    ctx.fillStyle = color;
    ctx.fillText(text, DESIGN_W / 2, y);
    ctx.restore();
  }

  drawTitle(hiScore: number, blink: boolean, selected: number): void {
    this.menuBg();
    this.centerText('BATTLE', 52, 30, '#e8c84a', 14);
    this.centerText('CITY', 80, 30, '#7fdcff', 14);
    this.centerText('HD REMAKE', 102, 9, 'rgba(180,200,230,0.8)', 0);
    this.centerText(`HI-SCORE   ${hiScore}`, 122, 9, '#ff9a6a', 4);

    // difficulty options
    const opts = [
      { label: 'EASY', hint: 'lives reset to 3 each stage' },
      { label: 'HARD', hint: 'lives carry over (original)' },
    ];
    opts.forEach((o, i) => {
      const y = 150 + i * 22;
      const on = i === selected;
      this.centerText(`${on ? '▶ ' : ''}${o.label}${on ? ' ◀' : ''}`, y, on ? 13 : 11, on ? '#fff' : 'rgba(160,180,210,0.5)', on ? 8 : 0);
      if (on) this.centerText(o.hint, y + 11, 6, 'rgba(150,170,200,0.7)', 0);
    });

    if (blink) this.centerText('↑ ↓ choose      SPACE / TAP  start', DESIGN_H - 12, 6.5, '#fff', 0);
  }

  drawPauseOverlay(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(5,6,10,0.72)';
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    ctx.restore();
    this.centerText('PAUSED', DESIGN_H / 2 - 10, 20, '#fff', 10);
    this.centerText('ESC / P  resume       Q  quit', DESIGN_H / 2 + 16, 7, 'rgba(180,200,230,0.85)', 0);
  }

  drawSplash(stageNum: number): void {
    this.menuBg();
    this.centerText(`STAGE  ${stageNum}`, DESIGN_H / 2, 22, '#fff', 10);
  }

  drawTally(state: GameState, cleared: boolean): void {
    this.menuBg();
    this.centerText(cleared ? 'STAGE CLEAR' : 'GAME OVER', 36, 16, cleared ? '#7affc0' : '#ff5a3c', 12);
    const kinds: Array<keyof typeof ENEMY_SCORE> = ['BASIC', 'FAST', 'POWER', 'ARMOR'];
    let y = 80;
    const ctx = this.ctx;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const k of kinds) {
      const n = state.kills[k];
      ctx.font = '700 9px system-ui';
      ctx.fillStyle = TANK_COLOR[k];
      ctx.fillText(k, 60, y);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'right';
      ctx.fillText(`${n} × ${ENEMY_SCORE[k]} = ${n * ENEMY_SCORE[k]}`, DESIGN_W - 60, y);
      ctx.textAlign = 'left';
      y += 18;
    }
    this.centerText(`SCORE   ${state.score}`, y + 14, 12, '#ffd54a', 6);
    this.centerText(cleared ? 'GET READY…' : 'PRESS  SPACE  /  TAP', DESIGN_H - 18, 8, '#fff', 0);
  }

  // --- helpers ------------------------------------------------------------

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private lighten(hex: string, amt: number): string {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    const b = Math.max(0, Math.min(255, (n & 255) + amt));
    return `rgb(${r},${g},${b})`;
  }
}

const POWERUP_COLOR: Record<PowerUpKind, string> = {
  star: '#ffd54a', helmet: '#7fdcff', clock: '#b48cff',
  grenade: '#ff7a5a', shovel: '#9ad36b', tank: '#7affc0',
};

export { DESIGN_W, DESIGN_H };
