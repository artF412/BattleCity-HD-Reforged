// Mulberry32 — a tiny deterministic PRNG. The seed lives in GameState so the
// same seed + same inputs reproduce a run exactly (this is what makes the core
// testable without a browser). Never use Math.random in the core.

export function nextRandom(seed: number): { value: number; seed: number } {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, seed: t >>> 0 };
}

// Convenience: pull an int in [0, n) and return the advanced seed.
export function randInt(seed: number, n: number): { value: number; seed: number } {
  const r = nextRandom(seed);
  return { value: Math.floor(r.value * n), seed: r.seed };
}
