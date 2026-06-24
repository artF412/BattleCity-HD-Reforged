# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A faithful HD-vector remake of the Famicom **Battle City**. Vite + TypeScript, ships as a static site, zero image/audio assets (everything drawn / synthesized in code). See `PRD.md` for the full product spec and `README.md` for the player-facing summary.

## Commands

```bash
npm run dev      # Vite dev server (hot reload) — primary way to play/iterate
npm test         # vitest run — all tests
npm run build    # tsc --noEmit (typecheck) then vite build -> dist/
npm run preview  # serve the built dist/
```

Run one test file or one case:
```bash
npx vitest run src/test/sim.test.ts
npx vitest run -t "bullet destroys brick"
```

There is no separate lint step; `tsc` runs under `strict` + `noUnusedLocals`/`noUnusedParameters`, so unused code fails the build.

## Architecture: one seam, everything else is an adapter

The whole design hinges on a **headless, deterministic simulation core** with one public entry point:

```ts
step(state: GameState, inputs: Inputs, dtMs: number): GameState   // src/core/sim.ts
```

Everything testable lives behind that seam. Rules to preserve when editing `src/core/`:

- **The core touches no Canvas / Web Audio / DOM, and never calls `Date.now()` or `Math.random()`.** Randomness comes from a seeded PRNG (`prng.ts`, mulberry32) whose seed lives in `state.rngState`. Same seed + same inputs ⇒ identical run. This is what makes the core testable without a browser, and the determinism test guards it — don't break it.
- `Math.random` / `Date.now` **are** used, deliberately, in the adapters (`main.ts` boot seed, render particles, audio noise). That's fine; the purity rule is core-only.
- `step` is reducer-shaped but **mutates `state` in place and returns the same object** (a game-loop perf choice, not a bug). Treat each call as one state transition.
- The core never talks to adapters directly. Instead each tick it pushes `GameEvent`s into `state.events` (fire, explodeBig, brickHit, baseDestroyed, shake, …). After `step`, `main.ts` hands `state.events` to both the audio and render adapters. Add a new effect by emitting an event in the core and handling it in the adapters — never by importing an adapter into the core.

### Modules

```
src/core/        the only code worth unit-testing
  sim.ts         step() + ALL rules: movement/grid-snap, collision, firing,
                 terrain destruction, enemy AI, power-ups, star ladder, base,
                 lives, scoring, spawn queue, win/lose. Also startStage/newGame.
  stages.ts      tile codec: expands one 13x13 authentic stage into the 26x26 terrain
  stageData.ts   generated data — 35 authentic stage grids + per-stage enemy waves
  constants.ts   ALL tuning knobs (speeds, timings, sizes, scores, materials)
  types.ts       GameState / Tank / Bullet / GameEvent / Inputs
  prng.ts        seeded RNG
src/adapters/    thin, intentionally NOT unit-tested through the seam
  render.ts      HD canvas: metallic solids + neon energy, particles, shake, DPR
  input.ts       keyboard + on-screen touch -> Inputs (keyed by player id)
  audio.ts       chiptune SFX + jingle via Web Audio, consumes GameEvents
  persist.ts     localStorage hi-score
src/main.ts      flow state machine + requestAnimationFrame loop (the only wiring)
```

### Coordinate systems (read before touching geometry)

Two grids, easy to confuse:
- **World units** = field pixels. Field is `13 tiles × TILE(16) = 208`. Tanks are one tile (16×16); positions are top-left. Speeds in `constants.ts` are world-units/second; `step` divides `dtMs` to apply them, so motion is frame-rate independent.
- **Terrain grid** = `GRID(26) × GRID(26)` of half-tile `CELL(8)` cells (`state.terrain`, a `Uint8Array` of `MAT.*` codes). Brick/steel destruction happens per cell, which is why the original's half/quarter wall pieces survive.

The renderer maps world → its own design space (field drawn at offset `FX,FY` next to a HUD panel) and scales the whole thing to the viewport honouring `devicePixelRatio`. The eagle base is **not** in the terrain grid — it's `state.baseAlive` + `BASE_TILE`; only the brick "nest" around it lives in terrain (and the Shovel power-up toggles those cells brick↔steel).

### Stage data is authentic and data-driven

`stageData.ts` holds all 35 original Famicom layouts as 13×13 tile-code grids plus a 20-char enemy-wave string per stage (`a/b/c/d` = BASIC/FAST/POWER/ARMOR). Sourced from github.com/FrontHeads/tanchiki and converted offline. `stages.ts` is the codec that turns a tile code (whole / TOP / BOTTOM / LEFT / RIGHT / quarter, for brick and steel) into the right sub-cells of the 26×26 terrain. **Adding or editing a stage is a data edit, not a code change.**

### Flow vs. core

`main.ts` owns the title → stage-splash → playing → tally screen state machine and difficulty. **Difficulty is a flow concern, not a core rule:** Easy resets lives to 3 on each stage clear, Hard carries them over — implemented purely by what `lives` value `main.ts` passes into `startStage` for the next stage. Don't push difficulty into the core.

## Testing conventions

- `sim.test.ts` tests external behavior through `step` only (never private fields). The `makeState()` helper builds a clean, controllable state — note it sets `enemiesRemaining = 99` and `spawnTimer = 1e9` so the stage doesn't auto-clear or auto-spawn mid-test; set them explicitly when testing spawn/win logic.
- `render.smoke.test.ts` runs the renderer against a fake Canvas2D (a Proxy that no-ops every call) to catch render-path crashes headlessly — it's a guard, not a pixel test.

## Gotchas

- **Tank overlap resolution** (`tankBlocked` in `sim.ts`): tanks block a move only if it would *create* a new overlap; two tanks already overlapping are allowed to move apart. Without this, an enemy that materialises on top of another locks both forever. Keep this escape-hatch if you refactor collision.
