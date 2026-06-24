# PRD: Battle City — HD Remake

> Status: Draft (pending publish to issue tracker — run `/setup-matt-pocock-skills`, then publish with `ready-for-agent` label)
> Source: synthesized from `/grilling` design session, 2026-06-23

## Problem Statement

I love the classic Famicom game Battle City and want to play it again, but the original 8-bit graphics look dated. I want the exact same game I remember — the same stages, enemies, power-ups, and feel — but with visuals that look genuinely good on a modern screen, and I want it to be something anyone can jump into and play instantly without installing anything.

## Solution

A faithful web-based remake of Battle City whose gameplay matches the original Famicom version as closely as practical, but rendered entirely in a modern HD vector art style (drawn in code, no pixel art) with modern effects — particles, glow, screen shake, smooth 60fps motion — and chiptune audio that preserves the retro feel. It runs in any browser, deploys as a free static site, and works on both desktop (keyboard) and mobile (touch). High scores persist locally per device. Just open a link and play.

## User Stories

### Core movement & combat
1. As a player, I want to drive my tank in four directions on a grid, so that I can navigate the battlefield like the original.
2. As a player, I want movement to feel smooth at 60fps, so that the game feels modern rather than choppy.
3. As a player, I want to fire bullets in the direction my tank faces, so that I can destroy enemies and walls.
4. As a player, I want my tank to be limited to the original firing constraints (one bullet at a time until upgraded), so that the difficulty matches the original.
5. As a player, I want my bullets to destroy brick walls but be blocked by steel walls (until upgraded), so that terrain matters tactically.
6. As a player, I want bullets to cancel each other when they collide, so that combat behaves like the original.

### Terrain
7. As a player, I want brick walls I can shoot through and destroy, so that I can open paths.
8. As a player, I want steel walls that block bullets until my tank is fully upgraded, so that some cover is permanent early on.
9. As a player, I want water that blocks tank movement but lets bullets pass over it, so that the map has the original's tactical layers.
10. As a player, I want tree/bush tiles that hide tanks driving underneath them, so that I can ambush and be ambushed like the original.
11. As a player, I want ice tiles that make my tank slide after I release the controls, so that movement on ice matches the original.

### Enemies
12. As a player, I want to face the four original enemy types (basic, fast, fast-bullet, heavy-armor), so that variety and difficulty match the original.
13. As a player, I want heavy-armor enemies to take multiple hits (changing appearance as they're damaged), so that they feel appropriately tough.
14. As a player, I want exactly 20 enemies per stage, so that stage length matches the original.
15. As a player, I want at most 4 enemies on screen at once, with the rest queued to spawn, so that pacing matches the original.
16. As a player, I want enemies to spawn from the three top spawn points, so that spawn behavior matches the original.
17. As a player, I want enemy tanks to move semi-randomly with a tendency to threaten my base and me, so that the AI feels like the original.
18. As a player, I want certain enemies to flash, and dropping a power-up when I destroy a flashing one, so that the power-up economy matches the original.

### Power-ups & upgrades
19. As a player, I want a Star power-up that upgrades my tank, so that I get stronger over a run.
20. As a player, I want star upgrades to stack across three levels (faster bullets → two simultaneous bullets → can destroy steel), so that progression matches the original.
21. As a player, I want a Helmet power-up granting temporary invincibility, so that I get brief relief under pressure.
22. As a player, I want a Clock power-up that freezes all enemies temporarily, so that I can reposition or clear threats.
23. As a player, I want a Grenade power-up that destroys all on-screen enemies, so that I can escape a swarm.
24. As a player, I want a Shovel power-up that temporarily turns the walls around my base into steel, so that I can protect the eagle.
25. As a player, I want a Tank power-up that grants an extra life, so that I can extend my run.
26. As a player, I want timed power-ups (Helmet/Clock/Shovel) to expire on the original's timing, so that they feel balanced like the original.

### Base & loss conditions
27. As a player, I want an eagle base I must defend, so that there's a core objective beyond survival.
28. As a player, I want the game to end immediately if my base (eagle) is destroyed, so that the stakes match the original.
29. As a player, I want to start with 3 lives, so that run length matches the original.
30. As a player, I want to lose a life when my tank is destroyed and respawn if I have lives left, so that death is recoverable.
31. As a player, I want the game to end when I run out of lives, so that there's a clear fail state.

### Stages & progression
32. As a player, I want all 35 original stages with their authentic map layouts, so that the campaign is complete and faithful.
33. As a player, I want to advance to the next stage after clearing all 20 enemies, so that progression matches the original.
34. As a player, I want a "STAGE N" splash before each stage, so that transitions feel like the original.
35. As a player, I want a score tally screen after a stage/game-over showing points per enemy type destroyed, so that scoring feedback matches the original.

### Meta / flow / persistence
36. As a player, I want a title screen, so that I have a clear entry point.
37. As a player, I want a HI-SCORE displayed during play, so that I have a target to beat.
38. As a player, I want my high score saved on my device, so that it persists when I close and reopen the browser.
39. As a player, I want a clear Game Over screen, so that I know my run ended and can restart.

### Visuals (the headline goal)
40. As a player, I want tanks and walls rendered as semi-realistic metallic vector art with subtle rim-lighting, so that solid objects look premium.
41. As a player, I want bullets, explosions, muzzle flashes, power-ups, and the eagle base to glow with neon energy, so that action elements pop.
42. As a player, I want a dark battlefield background with a faint grid/texture, so that the neon and metal read clearly.
43. As a player, I want explosions to burst into particles, so that destruction feels satisfying.
44. As a player, I want screen shake on big events (base destroyed, large explosions), so that impact feels weighty.
45. As a player, I want crisp rendering on high-DPI/retina screens, so that the HD art isn't blurry.

### Audio
46. As a player, I want chiptune sound effects (firing, explosions, picking up items, hitting walls), so that the retro Famicom feel is preserved despite HD visuals.
47. As a player, I want chiptune music (e.g., title/stage-start), so that the game has atmosphere.

### Platform & controls
48. As a desktop player, I want to move with the arrow keys and fire with Space, so that controls are familiar.
49. As a mobile player, I want an on-screen D-pad and fire button, so that I can play by touch.
50. As any player, I want the playfield to scale to fit my screen while keeping its aspect ratio, so that it looks right on any device.
51. As a player, I want to open a single link and play immediately with no install, so that it's effortless to start.

## Implementation Decisions

### Architecture — single testing seam
- The game is split into a **headless simulation core** and **adapters** (rendering, input, audio, persistence). All game rules live in the core; adapters carry no logic worth testing.
- The core exposes a deterministic update of the form `step(state, inputs, dt) → state`. It takes no wall-clock time, no randomness from the environment, and touches no Canvas/Web Audio/DOM API. This is the one seam at which the feature is tested (see Testing Decisions).
- Randomness (enemy AI, power-up drops, spawn selection) is driven by a **seeded PRNG held in state**, so the same seed + same inputs produces the same run. This is what makes the core deterministic and testable.

```
// Shape of the seam (from design session, not final API):
type Inputs = Record<PlayerId, { dir: Direction | null; fire: boolean }>
step(state: GameState, inputs: Inputs, dtMs: number): GameState
```

### Modules to build
- **Simulation core**: game state model, `step` reducer, collision, tank/bullet/enemy entities, power-up effects, star-upgrade ladder, terrain rules (brick/steel/water/trees/ice), base/eagle, lives, scoring, stage clear/fail detection, enemy spawn queue (20/stage, max 4 concurrent, 3 spawn points), enemy AI, seeded PRNG.
- **Stage data + loader**: all 35 original stage maps stored as data (compact grid, ~26×26 cells per stage, brick at half-tile resolution). Loader parses data into the core's terrain model. Adding/editing stages is a data change, not a code change.
- **Render adapter (Canvas)**: HD vector renderer. Hybrid art rule — solid objects (tanks, walls) = semi-realistic metallic vector + rim-light; energy elements (bullets, explosions, muzzle flash, power-ups, eagle, UI accents) = neon glow (`shadowBlur`/gradients); dark background. Particles, screen shake. Renders at a fixed internal resolution (48px/tile, 13×13 field + HUD panel) and scales to fit the viewport; honours `devicePixelRatio`.
- **Input adapter**: abstracts keyboard (arrows + Space) and on-screen touch controls (D-pad + fire) into the core's `Inputs` shape. Player input is stored as a list to allow a future second player without reworking the core.
- **Audio adapter**: chiptune SFX + music synthesized via Web Audio (no audio files).
- **Persistence adapter**: high score read/write via `localStorage`.
- **Screen/flow controller**: title → stage splash → play → score tally → next stage / game over; HI-SCORE display.

### Key decisions / clarifications from the developer
- Visuals are a **full HD vector redraw**, not enhanced pixel art and not a CRT shader. All art is drawn in code; no external image assets.
- Gameplay is faithful to the **Famicom original**; enemy AI is a **feel-faithful semi-random approximation**, not a frame-exact reverse-engineering of the ROM.
- **One player now**, but player state/input is modelled as a list so 2P co-op can be added later without restructuring the core.
- Extra lives come **only** from the Tank power-up.
- Build with **Vite + TypeScript**; deploy as a **static site** (GitHub Pages / Netlify / Vercel / Cloudflare Pages).
- Scope kept lean ("just for fun") — avoid over-engineering.

### Out-of-scope (door deliberately left open)
- Construction Mode (level editor) — the data-driven stage loader is the foundation it would build on later.
- 2P co-op — input/player-list architecture leaves room for it.
- Global online leaderboard — would require a backend; high scores are local-only for now.

## Testing Decisions

- **What a good test is here:** a test asserts **external behavior of the simulation core** — given a starting `GameState`, a sequence of `Inputs`, and elapsed time, the resulting `GameState` is correct. Tests must not assert on rendering, audio output, DOM, private fields, or internal helper structure. They exercise rules a player can observe (a tank moves, a bullet destroys brick but not steel, a flashing enemy drops a power-up, the base destroyed ends the game, 20 kills clears the stage, star level 3 destroys steel, ice causes post-input slide, etc.).
- **Determinism enables testing:** because randomness comes from a seeded PRNG in state and `step` takes `dt` explicitly, every scenario is reproducible without a browser, timers, or mocking the platform.
- **Modules tested:** the simulation core and the stage-data loader. Adapters (Canvas render, Web Audio, touch input, localStorage) are thin and intentionally not unit-tested through this seam; if they need coverage it should be minimal and separate.
- **Representative test areas:** movement & grid alignment; firing rules per star level; bullet-vs-terrain and bullet-vs-bullet; each terrain type's rule; each of the 6 power-ups; the star-upgrade ladder; enemy spawn queue limits (20 total / 4 concurrent / 3 points); win condition (all enemies cleared) and both loss conditions (base destroyed, lives exhausted); scoring tally.
- **Prior art:** none — greenfield project. Establish the first reducer-style state-transition test as the pattern other tests follow.

## Out of Scope

- Pixel-art or CRT-shader rendering modes.
- Construction Mode / level editor.
- Two-player co-op (and any networked/online multiplayer).
- Global/online leaderboards and any backend, server, accounts, or anti-cheat.
- Frame-exact replication of the original ROM's enemy AI/RNG.
- Native/app-store packaging (web only).
- Gamepad support (keyboard + touch only for now).

## Further Notes

- The single highest seam (`step(state, inputs, dt)`) is the most important architectural commitment in this PRD: keeping all rules in a pure, deterministic, seeded core is what makes the game both testable without a browser and safe to extend (2P, construction mode) later.
- Stage data being separate from code is the mechanism that makes "all 35 stages" a data-entry task rather than an engineering one; the same data format is the future foundation for Construction Mode.
- Visual fidelity is the headline user goal — implementation should treat the hybrid art rule (metallic solids + neon energy on a dark field) as a firm style contract, not a loose suggestion.
