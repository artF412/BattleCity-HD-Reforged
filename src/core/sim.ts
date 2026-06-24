// Headless, deterministic simulation core. All game rules live here.
// The one public seam is step(state, inputs, dtMs) -> state. It touches no
// Canvas/Audio/DOM and no wall-clock/Math.random: randomness comes from the
// seeded PRNG in state. This is what the tests exercise.

import {
  TILE, CELL, GRID, FIELD, TANK_SIZE, MAT,
  PLAYER_SPEED, ENEMY_SPEED, ENEMY_FAST_SPEED, BULLET_SPEED, BULLET_FAST_SPEED,
  FIRE_COOLDOWN_MS, MAX_ACTIVE_ENEMIES, ENEMY_SPAWN_INTERVAL_MS, ENEMY_APPEAR_MS,
  START_LIVES, SPAWN_SHIELD_MS, HELMET_MS, FREEZE_MS, SHOVEL_MS, POWERUP_TTL_MS,
  ENEMY_SPAWN_TILES, PLAYER_SPAWN_TILE, BASE_TILE, BONUS_SPAWN_INDICES,
  ENEMY_SCORE, POWERUP_SCORE,
  ENEMY_AIM_BASE, ENEMY_AIM_PER_STAGE, ENEMY_AIM_MAX,
  ENEMY_BASE_SEEK_BASE, ENEMY_BASE_SEEK_PER_STAGE, ENEMY_BASE_SEEK_MAX,
} from './constants';
import type {
  GameState, Tank, Bullet, Inputs, Direction, EnemyKind, PowerUpKind, GameEvent,
} from './types';
import { nextRandom } from './prng';
import { loadStage } from './stages';

// --- geometry helpers -------------------------------------------------------

interface Rect { x: number; y: number; w: number; h: number }

const DIR_VEC: Record<Direction, [number, number]> = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
};
const isHorizontal = (d: Direction) => d === 'left' || d === 'right';

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function baseRect(): Rect {
  return { x: BASE_TILE.tx * TILE, y: BASE_TILE.ty * TILE, w: TILE, h: TILE };
}

// Cells around the eagle that the Shovel power-up fortifies.
const BASE_WALL_CELLS: Array<[number, number]> = (() => {
  const ex0 = BASE_TILE.tx * 2, ey0 = BASE_TILE.ty * 2; // 12,24
  const cells: Array<[number, number]> = [];
  for (let x = ex0 - 1; x <= ex0 + 2; x++) cells.push([x, ey0 - 1]); // top row
  cells.push([ex0 - 1, ey0], [ex0 - 1, ey0 + 1]); // left
  cells.push([ex0 + 2, ey0], [ex0 + 2, ey0 + 1]); // right
  return cells.filter(([x, y]) => x >= 0 && y >= 0 && x < GRID && y < GRID);
})();

function setBaseWalls(state: GameState, mat: number): void {
  for (const [x, y] of BASE_WALL_CELLS) state.terrain[y * GRID + x] = mat;
}

// --- PRNG (mutates state.rngState) ------------------------------------------

function rnd(state: GameState): number {
  const r = nextRandom(state.rngState);
  state.rngState = r.seed;
  return r.value;
}
const rndInt = (state: GameState, n: number) => Math.floor(rnd(state) * n);

// --- terrain ----------------------------------------------------------------

function cellSolidForTank(mat: number): boolean {
  return mat === MAT.BRICK || mat === MAT.STEEL || mat === MAT.WATER;
}

function materialAtCenter(state: GameState, t: Tank): number {
  const cx = Math.floor((t.x + TANK_SIZE / 2) / CELL);
  const cy = Math.floor((t.y + TANK_SIZE / 2) / CELL);
  if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) return MAT.EMPTY;
  return state.terrain[cy * GRID + cx];
}

// True if a tank-sized rect at (x,y) is blocked (bounds / solid terrain /
// eagle / another tank). Appearing enemies don't block movement.
function tankBlocked(state: GameState, rect: Rect, self: Tank): boolean {
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > FIELD || rect.y + rect.h > FIELD) return true;

  const cx0 = Math.floor(rect.x / CELL), cx1 = Math.floor((rect.x + rect.w - 1) / CELL);
  const cy0 = Math.floor(rect.y / CELL), cy1 = Math.floor((rect.y + rect.h - 1) / CELL);
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      if (cellSolidForTank(state.terrain[cy * GRID + cx])) return true;
    }
  }

  if (state.baseAlive && rectsOverlap(rect, baseRect())) return true;

  // Tank-vs-tank: block only if this move would CREATE an overlap. If the two
  // are already overlapping (e.g. an enemy materialised on top of another),
  // don't block — that lets them slide apart instead of locking up forever.
  const cur: Rect = { x: self.x, y: self.y, w: TANK_SIZE, h: TANK_SIZE };
  for (const o of state.tanks) {
    if (o.id === self.id || o.appearMs > 0) continue;
    const orect: Rect = { x: o.x, y: o.y, w: TANK_SIZE, h: TANK_SIZE };
    if (rectsOverlap(rect, orect) && !rectsOverlap(cur, orect)) return true;
  }
  return false;
}

// Advance a tank along dir up to `dist`, stopping on contact. Returns moved dist.
function tryMove(state: GameState, t: Tank, dir: Direction, dist: number): number {
  const [vx, vy] = DIR_VEC[dir];
  let moved = 0;
  while (moved < dist) {
    const s = Math.min(1, dist - moved);
    const nx = t.x + vx * s, ny = t.y + vy * s;
    if (tankBlocked(state, { x: nx, y: ny, w: TANK_SIZE, h: TANK_SIZE }, t)) break;
    t.x = nx; t.y = ny; moved += s;
  }
  return moved;
}

// Align the axis perpendicular to travel onto the half-tile grid, so tanks
// thread through one-tile gaps the way they do in the original.
function snapForDir(t: Tank, dir: Direction): void {
  if (isHorizontal(dir)) t.y = Math.round(t.y / CELL) * CELL;
  else t.x = Math.round(t.x / CELL) * CELL;
  t.x = Math.max(0, Math.min(FIELD - TANK_SIZE, t.x));
  t.y = Math.max(0, Math.min(FIELD - TANK_SIZE, t.y));
}

function setDir(t: Tank, dir: Direction): void {
  if (isHorizontal(t.dir) !== isHorizontal(dir)) snapForDir(t, dir);
  t.dir = dir;
}

// --- firing -----------------------------------------------------------------

function ownBulletCount(state: GameState, tankId: number): number {
  let n = 0;
  for (const b of state.bullets) if (b.ownerId === tankId) n++;
  return n;
}

function maxBulletsFor(t: Tank): number {
  return t.side === 'player' && t.starLevel >= 2 ? 2 : 1;
}

function fire(state: GameState, t: Tank): void {
  if (t.fireCooldown > 0 || ownBulletCount(state, t.id) >= maxBulletsFor(t)) return;
  t.fireCooldown = FIRE_COOLDOWN_MS;

  const fast = t.side === 'player' ? t.starLevel >= 1 : t.kind === 'POWER';
  const speed = fast ? BULLET_FAST_SPEED : BULLET_SPEED;
  const destroysSteel = t.side === 'player' && t.starLevel >= 3;

  const cx = t.x + TANK_SIZE / 2 - 2, cy = t.y + TANK_SIZE / 2 - 2;
  let bx = cx, by = cy;
  if (t.dir === 'up') by = t.y - 4;
  else if (t.dir === 'down') by = t.y + TANK_SIZE;
  else if (t.dir === 'left') bx = t.x - 4;
  else bx = t.x + TANK_SIZE;

  state.bullets.push({
    id: state.nextId++, side: t.side, ownerId: t.id,
    x: bx, y: by, dir: t.dir, speed, destroysSteel,
  });
  state.events.push({ t: 'fire', side: t.side });
}

// --- spawning ---------------------------------------------------------------

function makeEnemy(state: GameState, kind: EnemyKind, tx: number, ty: number, flashing: boolean): Tank {
  return {
    id: state.nextId++, side: 'enemy', kind,
    x: tx * TILE, y: ty * TILE, dir: 'down', moving: true,
    hp: kind === 'ARMOR' ? 4 : 1,
    fireCooldown: 0,
    starLevel: 0, shieldMs: 0,
    appearMs: ENEMY_APPEAR_MS, flashing,
    slideDir: null, slideMs: 0,
  };
}

function spawnPlayer(state: GameState): void {
  state.tanks.push({
    id: state.nextId++, side: 'player', kind: 'player',
    x: PLAYER_SPAWN_TILE.tx * TILE, y: PLAYER_SPAWN_TILE.ty * TILE,
    dir: 'up', moving: false, hp: 1,
    fireCooldown: 0,
    starLevel: 0, shieldMs: SPAWN_SHIELD_MS,
    appearMs: 0, flashing: false, slideDir: null, slideMs: 0,
  });
}

function trySpawnEnemy(state: GameState): void {
  // Find a free spawn point, starting from the rotating cursor. A lingering
  // enemy on one point shouldn't stall the whole wave, so fall through to the
  // others; if all three are occupied this frame, bail and retry next frame.
  let chosen = -1;
  for (let k = 0; k < ENEMY_SPAWN_TILES.length; k++) {
    const idx = (state.nextSpawnPoint + k) % ENEMY_SPAWN_TILES.length;
    const tile = ENEMY_SPAWN_TILES[idx];
    const rect: Rect = { x: tile.tx * TILE, y: tile.ty * TILE, w: TANK_SIZE, h: TANK_SIZE };
    const occupied = state.tanks.some((o) => rectsOverlap(rect, { x: o.x, y: o.y, w: TANK_SIZE, h: TANK_SIZE }));
    if (!occupied) { chosen = idx; break; }
  }
  if (chosen < 0) return; // every spawn point blocked; try again next frame

  const tile = ENEMY_SPAWN_TILES[chosen];
  const kind = state.spawnQueue.shift()!;
  const flashing = BONUS_SPAWN_INDICES.includes(state.spawnIndexInWave);
  state.spawnIndexInWave++;
  state.nextSpawnPoint = chosen + 1;
  state.spawnTimer = ENEMY_SPAWN_INTERVAL_MS;
  state.tanks.push(makeEnemy(state, kind, tile.tx, tile.ty, flashing));
}

// --- power-ups --------------------------------------------------------------

const POWERUP_KINDS: PowerUpKind[] = ['star', 'helmet', 'clock', 'grenade', 'shovel', 'tank'];

function dropPowerUp(state: GameState): void {
  // Spawn at a random spot in the upper field, like the original.
  const kind = POWERUP_KINDS[rndInt(state, POWERUP_KINDS.length)];
  const tx = 1 + rndInt(state, FIELD_TILES_MINUS_2);
  const ty = 1 + rndInt(state, 6);
  state.powerups.push({ id: state.nextId++, kind, x: tx * TILE, y: ty * TILE, ttl: POWERUP_TTL_MS });
  state.events.push({ t: 'powerupSpawn', x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
}
const FIELD_TILES_MINUS_2 = FIELD / TILE - 2;

function applyPowerUp(state: GameState, player: Tank, kind: PowerUpKind): void {
  state.score += POWERUP_SCORE;
  state.events.push({ t: 'powerupTake', kind });
  switch (kind) {
    case 'star': player.starLevel = Math.min(3, player.starLevel + 1); break;
    case 'helmet': player.shieldMs = HELMET_MS; break;
    case 'clock': state.freezeMs = FREEZE_MS; break;
    case 'tank': state.lives++; break;
    case 'shovel': state.shovelMs = SHOVEL_MS; setBaseWalls(state, MAT.STEEL); break;
    case 'grenade':
      for (const e of state.tanks) {
        if (e.side === 'enemy') {
          state.enemiesRemaining--;
          state.events.push({ t: 'explodeBig', x: e.x + TILE / 2, y: e.y + TILE / 2 });
        }
      }
      state.tanks = state.tanks.filter((t) => t.side !== 'enemy');
      state.events.push({ t: 'shake', amount: 8 });
      break;
  }
}

// --- death / loss -----------------------------------------------------------

function killPlayer(state: GameState, player: Tank): void {
  state.events.push({ t: 'explodeBig', x: player.x + TILE / 2, y: player.y + TILE / 2 });
  state.events.push({ t: 'playerHit' });
  state.events.push({ t: 'shake', amount: 6 });
  state.tanks = state.tanks.filter((t) => t.id !== player.id);
  state.lives--;
  if (state.lives > 0) spawnPlayer(state);
  else gameOver(state);
}

function gameOver(state: GameState): void {
  if (state.phase !== 'playing') return;
  state.phase = 'gameOver';
  state.events.push({ t: 'gameOver' });
}

function destroyEnemy(state: GameState, enemy: Tank): void {
  state.score += ENEMY_SCORE[enemy.kind as EnemyKind];
  state.kills[enemy.kind as EnemyKind]++;
  state.enemiesRemaining--;
  state.events.push({ t: 'explodeBig', x: enemy.x + TILE / 2, y: enemy.y + TILE / 2 });
  if (enemy.flashing) dropPowerUp(state);
  state.tanks = state.tanks.filter((t) => t.id !== enemy.id);
}

// --- enemy AI ---------------------------------------------------------------

function dirToward(fromX: number, fromY: number, toX: number, toY: number, state: GameState): Direction {
  const dx = toX - fromX, dy = toY - fromY;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  if (dy !== 0) return dy > 0 ? 'down' : 'up';
  return (['up', 'down', 'left', 'right'] as Direction[])[rndInt(state, 4)];
}

function updateEnemy(state: GameState, t: Tank, dtMs: number, dt: number): void {
  if (state.freezeMs > 0) return; // clock power-up

  const player = state.tanks.find((p) => p.side === 'player');
  const moved = tryMove(state, t, t.dir, ENEMY_SPEED_FOR(t) * dt);

  // Re-pick direction when blocked, or occasionally at random.
  const blocked = moved < 0.01;
  if (blocked || rnd(state) < dt * 1.5) {
    // Aggression ramps with stage: early stages mostly wander and chase the
    // player; later stages aim for the eagle more, like the original ramp.
    const aim = Math.min(ENEMY_AIM_MAX, ENEMY_AIM_BASE + state.stageIndex * ENEMY_AIM_PER_STAGE);
    if (rnd(state) < aim) {
      const baseSeek = Math.min(ENEMY_BASE_SEEK_MAX, ENEMY_BASE_SEEK_BASE + state.stageIndex * ENEMY_BASE_SEEK_PER_STAGE);
      // Head for the eagle, or (more often early on) chase the player.
      const target = player && rnd(state) >= baseSeek
        ? { x: player.x, y: player.y }
        : { x: baseRect().x, y: baseRect().y };
      setDir(t, dirToward(t.x, t.y, target.x, target.y, state));
    } else {
      setDir(t, (['up', 'down', 'left', 'right'] as Direction[])[rndInt(state, 4)]);
    }
  }

  // Fire at random.
  if (rnd(state) < dt * 1.2) fire(state, t);
  void dtMs;
}

function ENEMY_SPEED_FOR(t: Tank): number {
  return t.kind === 'FAST' ? ENEMY_FAST_SPEED : ENEMY_SPEED;
}

// --- player update ----------------------------------------------------------

function updatePlayer(state: GameState, t: Tank, inp: { dir: Direction | null; fire: boolean } | undefined, dt: number): void {
  const onIce = materialAtCenter(state, t) === MAT.ICE;

  if (inp?.dir) {
    setDir(t, inp.dir);
    t.moving = true;
    tryMove(state, t, t.dir, PLAYER_SPEED * dt);
    if (onIce) { t.slideDir = t.dir; t.slideMs = 220; }
  } else {
    t.moving = false;
    if (t.slideMs > 0 && t.slideDir) {
      tryMove(state, t, t.slideDir, PLAYER_SPEED * dt);
      t.slideMs -= dt * 1000;
    }
  }
  if (!onIce && !inp?.dir) t.slideMs = 0;

  if (inp?.fire) fire(state, t);
}

// --- bullet update ----------------------------------------------------------

// Returns false if the bullet should be removed.
function advanceBullet(state: GameState, b: Bullet, dt: number): boolean {
  const [vx, vy] = DIR_VEC[b.dir];
  let dist = b.speed * dt;
  while (dist > 0) {
    const s = Math.min(2, dist);
    b.x += vx * s; b.y += vy * s;
    dist -= s;

    // out of field
    if (b.x < 0 || b.y < 0 || b.x + 4 > FIELD || b.y + 4 > FIELD) {
      state.events.push({ t: 'explodeSmall', x: b.x + 2, y: b.y + 2 });
      return false;
    }
    // eagle
    if (state.baseAlive && rectsOverlap({ x: b.x, y: b.y, w: 4, h: 4 }, baseRect())) {
      state.baseAlive = false;
      state.events.push({ t: 'baseDestroyed' }, { t: 'explodeBig', x: baseRect().x + TILE / 2, y: baseRect().y + TILE / 2 }, { t: 'shake', amount: 10 });
      gameOver(state);
      return false;
    }
    // terrain
    if (hitTerrain(state, b)) return false;
    // tanks
    const tankResult = hitTank(state, b);
    if (tankResult) return false;
  }
  return true;
}

function hitTerrain(state: GameState, b: Bullet): boolean {
  const cx0 = Math.floor(b.x / CELL), cx1 = Math.floor((b.x + 3) / CELL);
  const cy0 = Math.floor(b.y / CELL), cy1 = Math.floor((b.y + 3) / CELL);
  let hitBrick = false, hitSteel = false;
  const toClear: number[] = [];

  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) continue;
      const m = state.terrain[cy * GRID + cx];
      if (m === MAT.BRICK) { hitBrick = true; toClear.push(cy * GRID + cx); }
      else if (m === MAT.STEEL) { hitSteel = true; if (b.destroysSteel) toClear.push(cy * GRID + cx); }
    }
  }

  if (hitBrick || (hitSteel && b.destroysSteel)) {
    // Clear hit cells, and widen the notch one cell perpendicular to travel
    // so the bullet carves a passage (the original clears ~a bullet's width).
    for (const idx of toClear) state.terrain[idx] = MAT.EMPTY;
    widenNotch(state, b);
    state.events.push(hitBrick ? { t: 'brickHit', x: b.x, y: b.y } : { t: 'steelHit', x: b.x, y: b.y });
    state.events.push({ t: 'explodeSmall', x: b.x + 2, y: b.y + 2 });
    return true;
  }
  if (hitSteel) {
    state.events.push({ t: 'steelHit', x: b.x, y: b.y });
    return true;
  }
  return false;
}

function widenNotch(state: GameState, b: Bullet): void {
  const cx = Math.floor((b.x + 2) / CELL), cy = Math.floor((b.y + 2) / CELL);
  const perp: Array<[number, number]> = isHorizontal(b.dir) ? [[cx, cy - 1], [cx, cy + 1]] : [[cx - 1, cy], [cx + 1, cy]];
  for (const [x, y] of perp) {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
    const m = state.terrain[y * GRID + x];
    if (m === MAT.BRICK || (m === MAT.STEEL && b.destroysSteel)) state.terrain[y * GRID + x] = MAT.EMPTY;
  }
}

function hitTank(state: GameState, b: Bullet): boolean {
  const brect: Rect = { x: b.x, y: b.y, w: 4, h: 4 };
  for (const t of state.tanks) {
    if (t.appearMs > 0) continue;
    if (t.side === b.side) continue; // no friendly fire
    if (!rectsOverlap(brect, { x: t.x, y: t.y, w: TANK_SIZE, h: TANK_SIZE })) continue;

    if (t.side === 'player') {
      if (t.shieldMs > 0) { state.events.push({ t: 'steelHit', x: b.x, y: b.y }); return true; }
      killPlayer(state, t);
      return true;
    }
    // enemy hit by player bullet
    t.hp--;
    if (t.hp <= 0) destroyEnemy(state, t);
    else state.events.push({ t: 'explodeSmall', x: b.x + 2, y: b.y + 2 });
    return true;
  }
  return false;
}

function resolveBulletCollisions(state: GameState): void {
  const bs = state.bullets;
  for (let i = 0; i < bs.length; i++) {
    for (let j = i + 1; j < bs.length; j++) {
      if (bs[i].side === bs[j].side) continue;
      if (rectsOverlap({ x: bs[i].x, y: bs[i].y, w: 4, h: 4 }, { x: bs[j].x, y: bs[j].y, w: 4, h: 4 })) {
        state.events.push({ t: 'explodeSmall', x: bs[i].x, y: bs[i].y });
        bs[i].speed = -1; bs[j].speed = -1; // tag for removal
      }
    }
  }
  state.bullets = bs.filter((b) => b.speed >= 0);
}

// --- the step reducer -------------------------------------------------------

export function step(state: GameState, inputs: Inputs, dtMs: number): GameState {
  state.events = [];
  if (state.phase !== 'playing') return state;

  const dt = Math.min(dtMs, 50) / 1000; // clamp to avoid tunnelling on lag

  // timers
  state.freezeMs = Math.max(0, state.freezeMs - dtMs);
  if (state.shovelMs > 0) {
    state.shovelMs -= dtMs;
    if (state.shovelMs <= 0) { state.shovelMs = 0; setBaseWalls(state, MAT.BRICK); }
  }
  for (const t of state.tanks) {
    t.fireCooldown = Math.max(0, t.fireCooldown - dtMs);
    if (t.shieldMs > 0) t.shieldMs = Math.max(0, t.shieldMs - dtMs);
    if (t.appearMs > 0) t.appearMs = Math.max(0, t.appearMs - dtMs);
  }

  // spawning
  state.spawnTimer -= dtMs;
  const activeEnemies = state.tanks.filter((t) => t.side === 'enemy').length;
  if (state.spawnTimer <= 0 && state.spawnQueue.length > 0 && activeEnemies < MAX_ACTIVE_ENEMIES) {
    trySpawnEnemy(state);
  }

  // tank updates
  for (const t of state.tanks) {
    if (t.appearMs > 0) continue;
    if (t.side === 'player') updatePlayer(state, t, inputs[0], dt);
    else updateEnemy(state, t, dtMs, dt);
  }

  // bullet updates
  state.bullets = state.bullets.filter((b) => advanceBullet(state, b, dt));
  resolveBulletCollisions(state);

  // power-up pickup
  const player = state.tanks.find((t) => t.side === 'player');
  if (player) {
    state.powerups = state.powerups.filter((p) => {
      if (rectsOverlap({ x: p.x, y: p.y, w: TILE, h: TILE }, { x: player.x, y: player.y, w: TANK_SIZE, h: TANK_SIZE })) {
        applyPowerUp(state, player, p.kind);
        return false;
      }
      p.ttl -= dtMs;
      return p.ttl > 0;
    });
  }

  // win condition: every enemy of the wave destroyed
  if (state.phase === 'playing' && state.enemiesRemaining <= 0) {
    state.phase = 'stageClear';
    state.events.push({ t: 'stageClear' });
  }

  return state;
}

// --- state construction -----------------------------------------------------

export function startStage(stageIndex: number, seed: number, lives: number, score: number): GameState {
  const { terrain, spawnQueue } = loadStage(stageIndex);
  const state: GameState = {
    rngState: (seed ^ (stageIndex * 0x9e3779b1)) >>> 0,
    stageIndex,
    phase: 'playing',
    terrain,
    baseAlive: true,
    tanks: [],
    bullets: [],
    powerups: [],
    spawnQueue,
    spawnIndexInWave: 0,
    enemiesRemaining: spawnQueue.length,
    spawnTimer: 0,
    nextSpawnPoint: 0,
    lives,
    score,
    kills: { BASIC: 0, FAST: 0, POWER: 0, ARMOR: 0 },
    freezeMs: 0,
    shovelMs: 0,
    nextId: 1,
    events: [],
  };
  spawnPlayer(state);
  return state;
}

export function newGame(seed: number): GameState {
  return startStage(0, seed, START_LIVES, 0);
}

// Re-export for adapters/tests that want the live event list type.
export type { GameEvent };
