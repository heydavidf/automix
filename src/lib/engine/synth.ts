import type { ScaleSpec } from '../analysis/camelot';

export type Waveform = 'sine' | 'triangle' | 'sawtooth' | 'square';

export interface SynthParams {
  waveform: Waveform;
  /** Lowpass cutoff, Hz. */
  cutoff: number;
  /** Lowpass resonance (filter Q). */
  resonance: number;
  attack: number; // s
  decay: number; // s
  sustain: number; // 0-1
  release: number; // s
  /** Synth bus level into master, 0-1. */
  level: number;
}

export const DEFAULT_SYNTH_PARAMS: SynthParams = {
  waveform: 'sawtooth',
  cutoff: 1800,
  resonance: 4,
  attack: 0.01,
  decay: 0.18,
  sustain: 0.6,
  release: 0.25,
  level: 0.5,
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToName(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Scale-degree (0 = root) → MIDI note, wrapping octaves past the 7th. */
export function degreeToMidi(spec: ScaleSpec, degree: number, baseOctave: number): number {
  const n = spec.intervals.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return 12 * (baseOctave + 1) + spec.rootPc + spec.intervals[idx] + 12 * oct;
}

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
}

const MAX_VOICES = 8;

/**
 * Polyphonic subtractive synth: per note `OscillatorNode` → per-voice amp-env
 * `GainNode` → one shared lowpass `BiquadFilterNode` → synth master → the
 * destination (engine.master). A PARALLEL source — it never touches the deck
 * worklet or its schedule, so it can't disturb the mix engine.
 */
export class JamSynth {
  readonly filter: BiquadFilterNode;
  readonly master: GainNode;
  params: SynthParams = { ...DEFAULT_SYNTH_PARAMS };
  private voices = new Map<number, Voice>();

  constructor(
    private ctx: AudioContext,
    destination: AudioNode,
  ) {
    this.filter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: this.params.cutoff, Q: this.params.resonance });
    this.master = new GainNode(ctx, { gain: this.params.level });
    this.filter.connect(this.master);
    this.master.connect(destination);
  }

  setParams(p: Partial<SynthParams>): void {
    Object.assign(this.params, p);
    const now = this.ctx.currentTime;
    if (p.cutoff !== undefined) this.filter.frequency.setTargetAtTime(p.cutoff, now, 0.01);
    if (p.resonance !== undefined) this.filter.Q.setTargetAtTime(p.resonance, now, 0.01);
    if (p.level !== undefined) this.master.gain.setTargetAtTime(p.level, now, 0.01);
    // waveform + envelope apply to subsequently triggered voices
  }

  noteOn(midi: number): void {
    if (this.voices.has(midi)) return; // already held — ignore key-repeat
    if (this.voices.size >= MAX_VOICES) {
      const oldest = this.voices.keys().next().value;
      if (oldest !== undefined) this.noteOff(oldest);
    }
    const now = this.ctx.currentTime;
    const { waveform, attack, decay, sustain } = this.params;
    const osc = new OscillatorNode(this.ctx, { type: waveform, frequency: midiToHz(midi) });
    const gain = new GainNode(this.ctx, { gain: 0 });
    osc.connect(gain).connect(this.filter);
    const a = Math.max(0.001, attack);
    const d = Math.max(0.001, decay);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + a);
    gain.gain.linearRampToValueAtTime(sustain, now + a + d);
    osc.start(now);
    this.voices.set(midi, { osc, gain });
  }

  noteOff(midi: number): void {
    const v = this.voices.get(midi);
    if (!v) return;
    this.voices.delete(midi);
    const now = this.ctx.currentTime;
    const rel = Math.max(0.005, this.params.release);
    const g = v.gain.gain;
    // hold wherever the envelope currently is, then ramp out
    g.cancelAndHoldAtTime(now);
    g.linearRampToValueAtTime(0, now + rel);
    v.osc.stop(now + rel + 0.03);
    v.osc.onended = () => {
      try {
        v.gain.disconnect();
      } catch {
        /* already torn down */
      }
    };
  }

  allOff(): void {
    for (const midi of [...this.voices.keys()]) this.noteOff(midi);
  }

  /** Debug/verification: frequencies (Hz) of currently sounding voices. */
  activeFreqs(): number[] {
    return [...this.voices.values()].map((v) => v.osc.frequency.value);
  }
}
