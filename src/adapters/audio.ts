// Audio adapter: chiptune SFX + a short jingle, synthesized via Web Audio
// (no audio files). Consumes the sim's GameEvents. No game logic here.

import type { GameEvent } from '../core/types';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  enabled = true;

  private ensure(): boolean {
    if (!this.enabled) return false;
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.25;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return true;
  }

  /** Call from a user gesture so the browser lets audio play. */
  unlock(): void { this.ensure(); }

  private blip(freq: number, dur: number, type: OscillatorType, vol = 0.5, slideTo?: number): void {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur);
  }

  private noise(dur: number, vol = 0.5): void {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(g); g.connect(this.master);
    src.start(t0);
  }

  handle(events: GameEvent[]): void {
    if (!this.ensure()) return;
    for (const e of events) {
      switch (e.t) {
        case 'fire': this.blip(e.side === 'player' ? 660 : 420, 0.07, 'square', 0.35, 220); break;
        case 'brickHit': this.blip(180, 0.05, 'square', 0.25); break;
        case 'steelHit': this.blip(120, 0.04, 'square', 0.2); break;
        case 'explodeSmall': this.noise(0.12, 0.35); break;
        case 'explodeBig': this.noise(0.4, 0.6); this.blip(90, 0.4, 'sawtooth', 0.3, 40); break;
        case 'powerupSpawn': this.blip(880, 0.12, 'triangle', 0.4, 1320); break;
        case 'powerupTake': this.arpeggio([523, 659, 784, 1047], 0.06); break;
        case 'baseDestroyed': this.noise(0.6, 0.7); this.blip(70, 0.6, 'sawtooth', 0.4, 30); break;
        case 'stageClear': this.arpeggio([523, 659, 784, 1047, 1319], 0.1); break;
        default: break;
      }
    }
  }

  private arpeggio(notes: number[], step: number): void {
    if (!this.ctx) return;
    notes.forEach((f, i) => {
      const t = this.ctx!.currentTime + i * step;
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + step * 1.6);
      osc.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + step * 1.6);
    });
  }

  /** Title/stage-start jingle. */
  jingle(): void {
    if (!this.ensure()) return;
    this.arpeggio([392, 523, 659, 784, 659, 784, 1047], 0.12);
  }
}
