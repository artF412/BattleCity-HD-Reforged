// World units are "field pixels": the playfield is 13x13 tiles of 16 units = 208x208.
// Terrain is stored at half-tile resolution: a 26x26 grid of 8-unit cells
// (this is the "~26x26 cells, brick at half-tile resolution" from the PRD).

export const TILE = 16;
export const CELL = 8; // half-tile — the terrain destruction grid
export const FIELD_TILES = 13;
export const GRID = FIELD_TILES * 2; // 26 cells per side
export const FIELD = FIELD_TILES * TILE; // 208

export const TANK_SIZE = TILE; // tanks are one tile
export const BULLET_SIZE = 4;

// Speeds in field-units per second.
// Field-units per second. Tuned to the original's deliberate pace
// (the field is only 208 units wide, so these feel slower than they read).
export const PLAYER_SPEED = 54;
export const ENEMY_SPEED = 40;
export const ENEMY_FAST_SPEED = 60;
export const BULLET_SPEED = 200;
export const BULLET_FAST_SPEED = 300;

// Firing
export const FIRE_COOLDOWN_MS = 280;

// Enemy roster
export const ENEMIES_PER_STAGE = 20;
export const MAX_ACTIVE_ENEMIES = 4;
export const ENEMY_SPAWN_INTERVAL_MS = 2400; // gap between queued spawns
export const ENEMY_APPEAR_MS = 900; // spawn-shimmer before a tank becomes active

// Player
export const START_LIVES = 3;
export const SPAWN_SHIELD_MS = 3000; // brief invincibility on (re)spawn

// Timed power-ups (original-ish timings)
export const HELMET_MS = 10000;
export const FREEZE_MS = 8000;
export const SHOVEL_MS = 15000;
export const POWERUP_TTL_MS = 12000; // a dropped power-up lingers this long

// Three enemy spawn points (top row) and player start tiles (bottom row),
// in TILE coordinates — from the original spawn-place table.
export const ENEMY_SPAWN_TILES = [
  { tx: 0, ty: 0 },
  { tx: 6, ty: 0 },
  { tx: 12, ty: 0 },
];
export const PLAYER_SPAWN_TILE = { tx: 4, ty: 12 };
export const BASE_TILE = { tx: 6, ty: 12 };

// Bonus-tank spawn indices (these flash and drop a power-up when killed),
// matching the original's 4th / 11th / 18th enemy of each wave.
export const BONUS_SPAWN_INDICES = [3, 10, 17];

// Enemy AI aggression, ramped by stage so early stages aren't a base-rush.
// Per direction re-pick: AIM = chance to head for a target (vs wander);
// of those, BASE_SEEK = chance the target is the eagle (vs the player).
// Both grow with stageIndex up to a ceiling roughly matching the original.
export const ENEMY_AIM_BASE = 0.28;
export const ENEMY_AIM_PER_STAGE = 0.02;
export const ENEMY_AIM_MAX = 0.55;
export const ENEMY_BASE_SEEK_BASE = 0.32;
export const ENEMY_BASE_SEEK_PER_STAGE = 0.025;
export const ENEMY_BASE_SEEK_MAX = 0.6;

// Scores
export const ENEMY_SCORE = { BASIC: 100, FAST: 200, POWER: 300, ARMOR: 400 } as const;
export const POWERUP_SCORE = 500;

export type Material = 0 | 1 | 2 | 3 | 4 | 5;
export const MAT = { EMPTY: 0, BRICK: 1, STEEL: 2, WATER: 3, TREES: 4, ICE: 5 } as const;
