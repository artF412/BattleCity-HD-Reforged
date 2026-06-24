import type { Material } from './constants';

export type Direction = 'up' | 'down' | 'left' | 'right';
export type EnemyKind = 'BASIC' | 'FAST' | 'POWER' | 'ARMOR';
export type PowerUpKind = 'star' | 'helmet' | 'clock' | 'grenade' | 'shovel' | 'tank';
export type PlayerId = 0;

export interface Inputs {
  // Player input is keyed by id (a record, not a scalar) so a 2nd player
  // can be added later without reshaping the core. (PRD: door left open.)
  [id: number]: { dir: Direction | null; fire: boolean };
}

export interface Tank {
  id: number;
  side: 'player' | 'enemy';
  kind: EnemyKind | 'player';
  x: number; // top-left, field units
  y: number;
  dir: Direction;
  moving: boolean;
  hp: number; // ARMOR starts at 4; others 1
  fireCooldown: number; // ms until can fire again
  // player only
  starLevel: number; // 0..3
  shieldMs: number; // remaining spawn/helmet invincibility
  // enemy only
  appearMs: number; // >0 while materialising (not yet collidable/firing)
  flashing: boolean; // bonus tank that drops a power-up
  // ice physics
  slideDir: Direction | null;
  slideMs: number;
}

export interface Bullet {
  id: number;
  side: 'player' | 'enemy';
  ownerId: number;
  x: number;
  y: number;
  dir: Direction;
  speed: number;
  destroysSteel: boolean;
}

export interface PowerUp {
  id: number;
  kind: PowerUpKind;
  x: number;
  y: number;
  ttl: number;
}

// Things the sim wants the render/audio adapters to react to this tick.
// The core stays pure; adapters consume these (particles, shake, SFX).
export type GameEvent =
  | { t: 'fire'; side: 'player' | 'enemy' }
  | { t: 'brickHit'; x: number; y: number }
  | { t: 'steelHit'; x: number; y: number }
  | { t: 'explodeSmall'; x: number; y: number }
  | { t: 'explodeBig'; x: number; y: number }
  | { t: 'powerupSpawn'; x: number; y: number }
  | { t: 'powerupTake'; kind: PowerUpKind }
  | { t: 'baseDestroyed' }
  | { t: 'playerHit' }
  | { t: 'stageClear' }
  | { t: 'gameOver' }
  | { t: 'shake'; amount: number };

export type Phase = 'playing' | 'stageClear' | 'gameOver';

export interface GameState {
  rngState: number;
  stageIndex: number; // 0-based
  phase: Phase;
  terrain: Uint8Array; // GRID*GRID materials
  baseAlive: boolean;
  tanks: Tank[];
  bullets: Bullet[];
  powerups: PowerUp[];
  // enemy roster
  spawnQueue: EnemyKind[]; // remaining to spawn (front = next)
  spawnIndexInWave: number; // how many spawned so far (0-based) — for bonus tagging
  enemiesRemaining: number; // queued + on-field; stage clears when this hits 0
  spawnTimer: number; // ms until next spawn attempt
  nextSpawnPoint: number; // rotates through the 3 points
  // player
  lives: number;
  score: number;
  kills: { BASIC: number; FAST: number; POWER: number; ARMOR: number }; // this stage, for the tally
  // global timed effects
  freezeMs: number; // enemies frozen (clock)
  shovelMs: number; // base walls are steel
  nextId: number;
  events: GameEvent[];
}

export type Material_ = Material;
