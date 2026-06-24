import { GRID, MAT, type Material, ENEMIES_PER_STAGE } from './constants';
import type { EnemyKind } from './types';
import { LEVELS, ENEMY_FORCES } from './stageData';

// --- Tile codec -------------------------------------------------------------
// The authentic data is a 13x13 grid of tile codes. Each tile is split into a
// 2x2 block of half-tile cells in our 26x26 terrain grid. A code names a
// material plus which of the four sub-cells it fills (whole / half / quarter),
// reproducing the original's partial brick & steel pieces.

type Quad = [boolean, boolean, boolean, boolean]; // TL, TR, BL, BR
const WHOLE: Quad = [true, true, true, true];
const TOP: Quad = [true, true, false, false];
const BOTTOM: Quad = [false, false, true, true];
const LEFT: Quad = [true, false, true, false];
const RIGHT: Quad = [false, true, false, true];
const BL: Quad = [false, false, true, false];
const BR: Quad = [false, false, false, true];

interface Piece { mat: Material; quad: Quad }

// Codes from the source data (see stageData.ts header).
const CODE: Record<number, Piece | 'base'> = {
  1: { mat: MAT.BRICK, quad: WHOLE },
  2: { mat: MAT.BRICK, quad: TOP },
  3: { mat: MAT.BRICK, quad: RIGHT },
  4: { mat: MAT.BRICK, quad: BOTTOM },
  5: { mat: MAT.BRICK, quad: LEFT },
  17: { mat: MAT.BRICK, quad: BL },
  18: { mat: MAT.BRICK, quad: BR },
  6: { mat: MAT.STEEL, quad: WHOLE },
  7: { mat: MAT.STEEL, quad: TOP },
  8: { mat: MAT.STEEL, quad: RIGHT },
  9: { mat: MAT.STEEL, quad: BOTTOM },
  10: { mat: MAT.STEEL, quad: LEFT },
  19: { mat: MAT.STEEL, quad: BL },
  20: { mat: MAT.STEEL, quad: BR },
  11: { mat: MAT.TREES, quad: WHOLE },
  12: { mat: MAT.ICE, quad: WHOLE },
  13: { mat: MAT.WATER, quad: WHOLE },
  15: 'base',
};

const KIND_OF: Record<string, EnemyKind> = {
  a: 'BASIC',
  b: 'FAST',
  c: 'POWER',
  d: 'ARMOR',
};

export const STAGE_COUNT = LEVELS.length;

export interface LoadedStage {
  terrain: Uint8Array;
  spawnQueue: EnemyKind[];
}

// Parse a 0-based stage index into a terrain grid + enemy spawn order.
// The base eagle is handled by the sim, not the terrain grid, so the '15'
// cell is left empty here (its surrounding brick still loads from the data).
export function loadStage(index: number): LoadedStage {
  const grid = LEVELS[index % STAGE_COUNT];
  const terrain = new Uint8Array(GRID * GRID); // defaults to EMPTY (0)

  for (let ty = 0; ty < 13; ty++) {
    for (let tx = 0; tx < 13; tx++) {
      const code = grid[ty][tx];
      const piece = CODE[code];
      if (!piece || piece === 'base') continue;
      const cx = tx * 2;
      const cy = ty * 2;
      const q = piece.quad;
      if (q[0]) terrain[(cy + 0) * GRID + (cx + 0)] = piece.mat;
      if (q[1]) terrain[(cy + 0) * GRID + (cx + 1)] = piece.mat;
      if (q[2]) terrain[(cy + 1) * GRID + (cx + 0)] = piece.mat;
      if (q[3]) terrain[(cy + 1) * GRID + (cx + 1)] = piece.mat;
    }
  }

  const forces = ENEMY_FORCES[index % STAGE_COUNT];
  const spawnQueue: EnemyKind[] = [];
  for (let i = 0; i < ENEMIES_PER_STAGE; i++) {
    spawnQueue.push(KIND_OF[forces[i] ?? 'a'] ?? 'BASIC');
  }

  return { terrain, spawnQueue };
}
