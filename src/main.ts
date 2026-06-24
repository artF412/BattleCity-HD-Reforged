// Screen/flow controller + game loop. Wires the deterministic core to the
// render/input/audio/persist adapters. Flow: title -> stage splash -> play ->
// score tally -> next stage (or game over -> title).

import { newGame, startStage, step } from './core/sim';
import { STAGE_COUNT } from './core/stages';
import type { GameState } from './core/types';
import { Renderer } from './adapters/render';
import { InputManager } from './adapters/input';
import { AudioManager } from './adapters/audio';
import { loadHiScore, saveHiScore } from './adapters/persist';

type Mode = 'title' | 'splash' | 'playing' | 'tally';

const app = document.getElementById('app')!;
const canvas = document.createElement('canvas');
app.appendChild(canvas);

const renderer = new Renderer(canvas);
const input = new InputManager(canvas);
const audio = new AudioManager();
input.audioUnlock = () => audio.unlock();

type Difficulty = 'easy' | 'hard';
const START_LIVES = 3;

let mode: Mode = 'title';
let state: GameState = newGame(seed());
let hiScore = loadHiScore();
let timer = 0; // ms accumulator for splash/tally screens
let tallyCleared = false;
let menuIndex = 0; // 0 = easy, 1 = hard
let difficulty: Difficulty = 'easy';
let paused = false;

function seed(): number {
  // One-time entropy at boot is fine — the core stays deterministic from here.
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}

function beginStage(index: number, lives: number, score: number): void {
  state = startStage(index, seed(), lives, score);
  mode = 'splash';
  timer = 0;
  paused = false;
  audio.jingle();
}

let last = performance.now();
function frame(now: number): void {
  const dtMs = Math.min(now - last, 50);
  last = now;

  switch (mode) {
    case 'title': {
      const mv = input.takeMenuMove();
      if (mv) menuIndex = (menuIndex + mv + 2) % 2;
      renderer.drawTitle(hiScore, Math.floor(now / 400) % 2 === 0, menuIndex);
      if (input.takeConfirm()) {
        audio.unlock();
        difficulty = menuIndex === 0 ? 'easy' : 'hard';
        beginStage(0, START_LIVES, 0);
      }
      break;
    }

    case 'splash':
      renderer.drawSplash(state.stageIndex + 1);
      timer += dtMs;
      if (timer > 1600 || input.takeConfirm()) mode = 'playing';
      break;

    case 'playing': {
      if (input.takePause()) { paused = !paused; input.showQuitHint(paused); }
      if (paused) {
        if (input.takeQuit()) { paused = false; input.showQuitHint(false); mode = 'title'; state = newGame(seed()); break; }
        renderer.draw(state, 0); // frozen frame
        renderer.drawPauseOverlay();
        break;
      }
      step(state, input.sample(), dtMs);
      audio.handle(state.events);
      renderer.consumeEvents(state.events);
      renderer.draw(state, dtMs);

      if (state.phase === 'stageClear') {
        tallyCleared = true; mode = 'tally'; timer = 0;
      } else if (state.phase === 'gameOver') {
        tallyCleared = false; mode = 'tally'; timer = 0;
        hiScore = Math.max(hiScore, state.score);
        saveHiScore(state.score);
      }
      break;
    }

    case 'tally':
      renderer.drawTally(state, tallyCleared);
      timer += dtMs;
      if (tallyCleared) {
        if (timer > 2600) {
          const next = state.stageIndex + 1;
          if (next >= STAGE_COUNT) {
            // Campaign complete -> bank the score before returning to title.
            hiScore = Math.max(hiScore, state.score);
            saveHiScore(state.score);
            mode = 'title';
          }
          // Easy: lives are restored to 3 on every stage clear. Hard: carry over.
          else beginStage(next, difficulty === 'easy' ? START_LIVES : state.lives, state.score);
        }
      } else if (timer > 1200 && input.takeConfirm()) {
        mode = 'title';
        state = newGame(seed());
      }
      break;
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
