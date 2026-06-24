import { describe, it, expect, beforeAll } from 'vitest';
import { startStage, step } from '../core/sim';
import type { Inputs } from '../core/types';

// Headless smoke test for the render path: a fake Canvas2D context that
// accepts every call, so we can exercise the whole renderer (game frame +
// every overlay screen) and assert it never throws. Not a pixel test — just a
// guard against dumb runtime errors (missing methods, bad call order).

function fakeCtx(): any {
  const gradient = { addColorStop() {} };
  return new Proxy(
    { canvas: { width: 0, height: 0 } },
    {
      get(target: any, prop) {
        if (prop in target) return target[prop];
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
        return () => undefined; // any drawing method is a no-op
      },
      set(target: any, prop, value) { target[prop] = value; return true; },
    },
  );
}

let Renderer: any;

beforeAll(async () => {
  const canvas: any = { getContext: () => fakeCtx(), style: {}, width: 0, height: 0, addEventListener() {} };
  (globalThis as any).window = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2,
    addEventListener() {},
  };
  (globalThis as any).document = {};
  Renderer = (await import('../adapters/render')).Renderer;
  (globalThis as any).__canvas = canvas;
});

describe('render path', () => {
  it('draws a live game frame across many ticks without throwing', () => {
    const r = new Renderer((globalThis as any).__canvas);
    const s = startStage(0, 42, 3, 0);
    const inputs: Inputs = { 0: { dir: 'up', fire: true } };
    expect(() => {
      for (let i = 0; i < 240; i++) {
        step(s, inputs, 16);
        r.consumeEvents(s.events);
        r.draw(s, 16);
      }
    }).not.toThrow();
  });

  it('draws every overlay screen without throwing', () => {
    const r = new Renderer((globalThis as any).__canvas);
    const s = startStage(0, 7, 3, 12345);
    s.kills = { BASIC: 5, FAST: 3, POWER: 2, ARMOR: 1 };
    expect(() => {
      r.drawTitle(99999, true, 0);
      r.drawTitle(99999, false, 1);
      r.drawSplash(1);
      r.drawTally(s, true);
      r.drawTally(s, false);
    }).not.toThrow();
  });

  it('renders a stage with the base destroyed', () => {
    const r = new Renderer((globalThis as any).__canvas);
    const s = startStage(3, 1, 2, 0);
    s.baseAlive = false;
    expect(() => r.draw(s, 16)).not.toThrow();
  });
});
