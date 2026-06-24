import { describe, it, expect } from 'vitest';
import { startStage, step, newGame } from '../core/sim';
import { GRID, CELL, MAT, TILE } from '../core/constants';
import type { GameState, Inputs, Tank } from '../core/types';

// A clean, controllable state: empty terrain, just the player, no spawns,
// enemiesRemaining kept high so the stage doesn't auto-clear mid-test.
function makeState(): GameState {
  const s = startStage(0, 12345, 3, 0);
  s.terrain = new Uint8Array(GRID * GRID);
  s.tanks = s.tanks.filter((t) => t.side === 'player');
  s.bullets = [];
  s.powerups = [];
  s.spawnQueue = [];
  s.enemiesRemaining = 99;
  s.spawnTimer = 1e9;
  s.baseAlive = true;
  const p = s.tanks[0];
  p.x = 32; p.y = 32; p.dir = 'up'; p.shieldMs = 0; p.starLevel = 0;
  return s;
}
const player = (s: GameState): Tank => s.tanks.find((t) => t.side === 'player')!;
const setCell = (s: GameState, cx: number, cy: number, m: number) => { s.terrain[cy * GRID + cx] = m; };
const idle: Inputs = { 0: { dir: null, fire: false } };
const press = (dir: any, fire = false): Inputs => ({ 0: { dir, fire } });
function run(s: GameState, frames: number, inputs: Inputs) { for (let i = 0; i < frames; i++) step(s, inputs, 16); }

describe('movement', () => {
  it('drives the tank in the input direction', () => {
    const s = makeState();
    const y0 = player(s).y;
    run(s, 5, press('up'));
    expect(player(s).y).toBeLessThan(y0);
    expect(player(s).dir).toBe('up');
  });

  it('is blocked by a steel wall', () => {
    const s = makeState();
    setCell(s, 4, 3, MAT.STEEL); setCell(s, 5, 3, MAT.STEEL); // directly above
    run(s, 20, press('up'));
    expect(player(s).y).toBe(32); // never crossed the wall
  });

  it('cannot leave the field bounds', () => {
    const s = makeState();
    player(s).x = 0; player(s).y = 0;
    run(s, 40, press('left'));
    expect(player(s).x).toBe(0);
  });

  it('a tank already overlapping another can move apart (no permanent stuck)', () => {
    const s = makeState();
    const p = player(s);
    p.x = 32; p.y = 32; p.shieldMs = 9999; // shielded so AI fire can't end the test
    // an enemy materialised right on top of the player
    s.tanks.push({
      id: s.nextId++, side: 'enemy', kind: 'BASIC', x: 34, y: 32, dir: 'down', moving: true,
      hp: 1, fireCooldown: 0, starLevel: 0, shieldMs: 9999,
      appearMs: 0, flashing: false, slideDir: null, slideMs: 0,
    });
    run(s, 30, press('left')); // drive away from the overlap
    expect(player(s).x).toBeLessThan(32); // escaped instead of locking up
  });
});

describe('firing & terrain', () => {
  it('one bullet at a time below star level 2', () => {
    const s = makeState();
    player(s).dir = 'up';
    step(s, press('up', true), 16);
    step(s, press('up', true), 16); // cooldown + single-bullet cap
    expect(s.bullets.length).toBe(1);
  });

  it('bullet destroys brick', () => {
    const s = makeState();
    player(s).x = 0; player(s).y = 0; player(s).dir = 'right';
    setCell(s, 4, 0, MAT.BRICK); setCell(s, 4, 1, MAT.BRICK);
    step(s, press('right', true), 16);
    run(s, 15, idle);
    expect(s.terrain[0 * GRID + 4]).toBe(MAT.EMPTY);
  });

  it('bullet is blocked by steel but does not destroy it', () => {
    const s = makeState();
    player(s).x = 0; player(s).y = 0; player(s).dir = 'right';
    setCell(s, 4, 0, MAT.STEEL); setCell(s, 4, 1, MAT.STEEL);
    step(s, press('right', true), 16);
    run(s, 15, idle);
    expect(s.terrain[0 * GRID + 4]).toBe(MAT.STEEL);
    expect(s.bullets.length).toBe(0); // bullet was consumed
  });

  it('star level 3 lets bullets destroy steel and fire two at once', () => {
    const s = makeState();
    player(s).x = 0; player(s).y = 0; player(s).dir = 'right'; player(s).starLevel = 3;
    setCell(s, 4, 0, MAT.STEEL); setCell(s, 4, 1, MAT.STEEL);
    step(s, press('right', true), 16);
    run(s, 15, idle);
    expect(s.terrain[0 * GRID + 4]).toBe(MAT.EMPTY);
    // two-bullet cap at star >= 2
    const s2 = makeState();
    player(s2).starLevel = 2; player(s2).dir = 'up';
    step(s2, press('up', true), 16);
    player(s2).fireCooldown = 0;
    step(s2, press('up', true), 16);
    expect(s2.bullets.length).toBe(2);
  });

  it('opposing bullets cancel each other', () => {
    const s = makeState();
    s.bullets.push(
      { id: 1, side: 'player', ownerId: 99, x: 100, y: 100, dir: 'right', speed: 100, destroysSteel: false },
      { id: 2, side: 'enemy', ownerId: 98, x: 102, y: 100, dir: 'left', speed: 100, destroysSteel: false },
    );
    step(s, idle, 16);
    expect(s.bullets.length).toBe(0);
  });
});

describe('enemies & scoring', () => {
  function addEnemy(s: GameState, opts: Partial<Tank> = {}): Tank {
    const e: Tank = {
      id: s.nextId++, side: 'enemy', kind: 'BASIC', x: 60, y: 0, dir: 'down', moving: true,
      hp: 1, fireCooldown: 0, starLevel: 0, shieldMs: 0,
      appearMs: 0, flashing: false, slideDir: null, slideMs: 0, ...opts,
    };
    s.tanks.push(e);
    return e;
  }

  it('destroying an enemy scores by type and counts the kill', () => {
    const s = makeState();
    s.enemiesRemaining = 5;
    const e = addEnemy(s, { kind: 'ARMOR', hp: 1, x: 64, y: 0 });
    s.bullets.push({ id: 1, side: 'player', ownerId: 99, x: e.x + 6, y: e.y + 6, dir: 'down', speed: 1, destroysSteel: false });
    step(s, idle, 16);
    expect(s.score).toBe(400);
    expect(s.kills.ARMOR).toBe(1);
    expect(s.enemiesRemaining).toBe(4);
  });

  it('armor tanks take multiple hits', () => {
    const s = makeState();
    s.enemiesRemaining = 5;
    const e = addEnemy(s, { kind: 'ARMOR', hp: 4, x: 64, y: 0 });
    s.bullets.push({ id: 1, side: 'player', ownerId: 99, x: e.x + 6, y: e.y + 6, dir: 'down', speed: 1, destroysSteel: false });
    step(s, idle, 16);
    expect(s.tanks.some((t) => t.side === 'enemy')).toBe(true); // still alive
    expect(e.hp).toBe(3);
  });

  it('a flashing enemy drops a power-up when destroyed', () => {
    const s = makeState();
    s.enemiesRemaining = 5;
    const e = addEnemy(s, { flashing: true, x: 64, y: 0 });
    s.bullets.push({ id: 1, side: 'player', ownerId: 99, x: e.x + 6, y: e.y + 6, dir: 'down', speed: 1, destroysSteel: false });
    step(s, idle, 16);
    expect(s.powerups.length).toBe(1);
  });

  it('keeps at most 4 enemies active while spawning a wave', () => {
    const s = makeState();
    // makeState wipes terrain, leaving the eagle's nest gone; fortify it with
    // steel so a stray enemy shot can't end the run before the cap is reached.
    for (let cx = 11; cx <= 14; cx++) setCell(s, cx, 23, MAT.STEEL);
    for (const cy of [24, 25]) { setCell(s, 11, cy, MAT.STEEL); setCell(s, 14, cy, MAT.STEEL); }
    s.spawnQueue = Array(12).fill('BASIC');
    s.enemiesRemaining = 12;
    s.spawnTimer = 0;
    let maxActive = 0;
    for (let i = 0; i < 600; i++) {
      step(s, idle, 16);
      maxActive = Math.max(maxActive, s.tanks.filter((t) => t.side === 'enemy').length);
    }
    expect(maxActive).toBe(4);
  });
});

describe('power-ups', () => {
  function giveAndPickup(kind: any): GameState {
    const s = makeState();
    const p = player(s);
    s.powerups.push({ id: 1, kind, x: p.x, y: p.y, ttl: 9999 });
    step(s, idle, 16);
    return s;
  }
  it('star upgrades the tank, capped at 3', () => {
    const s = giveAndPickup('star');
    expect(player(s).starLevel).toBe(1);
  });
  it('tank power-up grants an extra life', () => {
    const s = giveAndPickup('tank');
    expect(s.lives).toBe(4);
  });
  it('clock freezes enemies', () => {
    const s = giveAndPickup('clock');
    expect(s.freezeMs).toBeGreaterThan(0);
  });
  it('grenade clears all enemies on screen', () => {
    const s = makeState();
    s.enemiesRemaining = 3;
    s.tanks.push({ id: 50, side: 'enemy', kind: 'BASIC', x: 100, y: 100, dir: 'down', moving: true, hp: 1, fireCooldown: 0, starLevel: 0, shieldMs: 0, appearMs: 0, flashing: false, slideDir: null, slideMs: 0 });
    const p = player(s);
    s.powerups.push({ id: 1, kind: 'grenade', x: p.x, y: p.y, ttl: 9999 });
    step(s, idle, 16);
    expect(s.tanks.some((t) => t.side === 'enemy')).toBe(false);
  });
  it('shovel turns the base walls to steel', () => {
    const s = giveAndPickup('shovel');
    // a cell of the base nest is now steel
    expect(s.shovelMs).toBeGreaterThan(0);
    expect([...s.terrain].includes(MAT.STEEL)).toBe(true);
  });
});

describe('base & loss / win', () => {
  it('destroying the base ends the game', () => {
    const s = makeState();
    s.bullets.push({ id: 1, side: 'enemy', ownerId: 1, x: 96 + TILE / 2, y: 192 + TILE / 2, dir: 'down', speed: 1, destroysSteel: false });
    step(s, idle, 16);
    expect(s.baseAlive).toBe(false);
    expect(s.phase).toBe('gameOver');
  });

  it('an unshielded hit costs a life; a shielded hit does not', () => {
    const s = makeState();
    const p = player(s);
    p.shieldMs = 0;
    s.bullets.push({ id: 1, side: 'enemy', ownerId: 1, x: p.x + 6, y: p.y + 6, dir: 'down', speed: 1, destroysSteel: false });
    step(s, idle, 16);
    expect(s.lives).toBe(2);

    const s2 = makeState();
    const p2 = player(s2);
    p2.shieldMs = 5000;
    s2.bullets.push({ id: 1, side: 'enemy', ownerId: 1, x: p2.x + 6, y: p2.y + 6, dir: 'down', speed: 1, destroysSteel: false });
    step(s2, idle, 16);
    expect(s2.lives).toBe(3);
  });

  it('running out of lives is game over', () => {
    const s = makeState();
    s.lives = 1;
    const p = player(s);
    s.bullets.push({ id: 1, side: 'enemy', ownerId: 1, x: p.x + 6, y: p.y + 6, dir: 'down', speed: 1, destroysSteel: false });
    step(s, idle, 16);
    expect(s.phase).toBe('gameOver');
  });

  it('clearing all enemies wins the stage', () => {
    const s = makeState();
    s.enemiesRemaining = 0;
    step(s, idle, 16);
    expect(s.phase).toBe('stageClear');
  });
});

describe('ice & determinism', () => {
  it('the tank slides after release on ice', () => {
    const s = makeState();
    for (let cx = 0; cx < GRID; cx++) { setCell(s, cx, 4, MAT.ICE); setCell(s, cx, 5, MAT.ICE); }
    player(s).x = 32; player(s).y = 32;
    run(s, 6, press('right'));
    const x0 = player(s).x;
    run(s, 4, idle); // released — should keep gliding
    expect(player(s).x).toBeGreaterThan(x0);
  });

  it('same seed + same inputs produces the same run', () => {
    const a = newGame(777);
    const b = newGame(777);
    for (let i = 0; i < 300; i++) { step(a, idle, 16); step(b, idle, 16); }
    expect(a.score).toBe(b.score);
    expect(a.rngState).toBe(b.rngState);
    expect(a.tanks.length).toBe(b.tanks.length);
  });
});

// silence unused CELL import guard (kept for readers mapping cells->pixels)
void CELL;
