// High score persisted per device. Thin wrapper — no game logic here.

const KEY = 'battlecity-hd-hiscore';

export function loadHiScore(): number {
  try {
    return parseInt(localStorage.getItem(KEY) || '20000', 10) || 20000;
  } catch {
    return 20000;
  }
}

export function saveHiScore(score: number): void {
  try {
    if (score > loadHiScore()) localStorage.setItem(KEY, String(score));
  } catch {
    /* storage unavailable — ignore */
  }
}
