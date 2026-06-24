# Battle City — HD Reforged

> Faithful remake of the Famicom classic, redrawn from scratch in modern HD vector art.
> No pixel art. No image files. Every tank, brick, and explosion is drawn in code.

**[Play now →](https://dapper-melomakarona-97cf6c.nenetlifytlify.app/)**

---

## What is this?

Battle City was a 1985 Famicom game where you drive a tank, shoot enemies, and protect your eagle base across 35 stages. This remake keeps **every gameplay rule exactly as the original** — same stages, same enemy types, same power-ups, same timing — but renders everything in a modern HD style: metallic tanks with rim lighting, neon-glowing bullets and explosions, particle bursts, screen shake, and 60fps smooth motion. It runs in any browser, no install needed.

## Features

- **35 authentic stages** — original Famicom layouts, enemies, and wave compositions
- **4 enemy types** — Basic, Fast, Power (fast bullet), Armor (multi-hit)
- **6 power-ups** — Star (upgrade), Helmet (invincibility), Clock (freeze), Grenade (wipe), Shovel (fortify base), Tank (extra life)
- **Star upgrade ladder** — faster bullets → 2 bullets → pierce steel
- **5 terrain types** — Brick, Steel, Water, Trees (camo), Ice (slide)
- **HD vector rendering** — metallic solids + neon energy, drawn entirely in Canvas2D
- **Particles, glow, screen shake** — every explosion feels weighty
- **Chiptune audio** — retro SFX and jingles via Web Audio API (no audio files)
- **Keyboard + touch** — desktop arrow keys/Space; mobile on-screen D-pad + FIRE
- **Local high score** — persists in localStorage
- **Retina/HiDPI** — crisp on any screen

## Play

Open in browser — no install required.

```bash
npm install
npm run dev   # http://localhost:5173
```

| Key | Action |
|-----|--------|
| Arrow keys | Move |
| Space | Fire |
| Mobile | On-screen D-pad + FIRE button |

## Architecture

All game rules live in a **headless, deterministic core**. The single public seam is:

```ts
step(state: GameState, inputs: Inputs, dtMs: number): GameState
// src/core/sim.ts
```

The core never touches Canvas / Web Audio / DOM and has no wall-clock or `Math.random` calls. Randomness comes from a **seeded PRNG held in state** (`mulberry32` in `prng.ts`), so the same seed + same inputs reproduce a run identically. That is what the unit tests exercise without a browser.

```
src/
  core/           Simulation core — the only code worth unit-testing
    sim.ts        step(): movement, collision, firing, terrain, AI, power-ups, scoring
    stages.ts     Tile codec: 13×13 authentic data → 26×26 half-tile terrain
    stageData.ts  All 35 stage layouts + per-stage enemy waves
    prng.ts       Seeded RNG · constants.ts · types.ts
  adapters/       Thin wrappers — no game logic here
    render.ts     HD canvas renderer (metallic + neon, particles, DPR)
    input.ts      Keyboard + touch → Inputs
    audio.ts      Chiptune SFX + jingles via Web Audio (no files)
    persist.ts    localStorage hi-score
  main.ts         Flow: title → stage splash → play → tally → next / game over
```

## Coordinate systems

| System | Unit | Size | Notes |
|--------|------|------|-------|
| World | field pixels | 208×208 | 13 tiles × 16px; tank = 1 tile |
| Terrain grid | half-tile cells | 26×26 | `CELL(8)` — per-cell brick/steel destruction |

## Tests

```bash
npm test   # vitest — 26 tests (core sim + render smoke)
```

Tests cover: movement, collision, bullet cancel, terrain destruction, enemy AI, power-ups, spawn/win logic, determinism, and render-path crash guard.

## Stage data source

The 35 stage maps are the authentic Famicom layouts (13×13 tile codes with half-tile brick/steel fragments), sourced from [FrontHeads/tanchiki](https://github.com/FrontHeads/tanchiki) and converted offline. `stages.ts` expands them into the core's 26×26 terrain. Editing a stage is a data change — no code change needed.

## Build & deploy

```bash
npm run build    # TypeScript check + Vite → dist/
npm run preview  # Serve built dist/ locally
```

The `dist/` folder is a self-contained static site. Drop it on GitHub Pages, Netlify, Vercel, or any file host.

## Out of scope (doors left open)

- 2-player co-op
- Construction Mode (stage editor)
- Online leaderboards

## Tech stack

- **TypeScript** — strict mode, no implicit anys
- **Vite** — dev server + static build
- **Vitest** — unit tests, no browser required
- Zero runtime dependencies — no frameworks, no libraries
