export type DrumName = 'kick' | 'snare' | 'hat' | 'openhat' | 'clap' | 'tom';

export const DRUM_NAMES: DrumName[] = ['kick', 'snare', 'hat', 'openhat', 'clap', 'tom'];

export const DRUM_LABEL: Record<DrumName, string> = {
  kick: 'Kick',
  snare: 'Snare',
  hat: 'Hat',
  openhat: 'Open',
  clap: 'Clap',
  tom: 'Tom',
};

function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate); // 1s of white noise, looped per hit
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let seed = 22222;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = seed / 0x40000000 - 1;
  }
  return buf;
}

/**
 * Fully synthesized drum voices (808/909-flavoured) — kick/tom from a
 * pitch-dropping sine, snare/hats/clap from filtered noise, each a self-cleaning
 * one-shot. Own master gain → destination (engine.master), parallel to the
 * decks and the JamSynth; bypasses the synth's filter so the cutoff knob can't
 * eat the hats.
 */
export class DrumKit {
  readonly master: GainNode;
  private noise: AudioBuffer;

  constructor(
    private ctx: AudioContext,
    destination: AudioNode,
  ) {
    this.master = new GainNode(ctx, { gain: 0.85 });
    this.master.connect(destination);
    this.noise = makeNoiseBuffer(ctx);
  }

  setLevel(v: number): void {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
  }

  trigger(name: DrumName, when?: number): void {
    const t = when ?? this.ctx.currentTime;
    switch (name) {
      case 'kick': this.kick(t); break;
      case 'snare': this.snare(t); break;
      case 'hat': this.hat(t, 0.045); break;
      case 'openhat': this.hat(t, 0.32); break;
      case 'clap': this.clap(t); break;
      case 'tom': this.tom(t); break;
    }
  }

  private noiseSource(): AudioBufferSourceNode {
    return new AudioBufferSourceNode(this.ctx, { buffer: this.noise });
  }

  /** Percussive amp envelope: fast attack, exponential decay to silence. */
  private env(t: number, peak: number, decay: number, attack = 0.001): GainNode {
    const g = new GainNode(this.ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  private kick(t: number): void {
    const osc = new OscillatorNode(this.ctx, { type: 'sine' });
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.08);
    const g = this.env(t, 1, 0.4);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.45);
    osc.onended = () => g.disconnect();
  }

  private tom(t: number): void {
    const osc = new OscillatorNode(this.ctx, { type: 'sine' });
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.16);
    const g = this.env(t, 0.9, 0.3);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.35);
    osc.onended = () => g.disconnect();
  }

  private snare(t: number): void {
    // noise body
    const n = this.noiseSource();
    const hp = new BiquadFilterNode(this.ctx, { type: 'highpass', frequency: 1500 });
    const ng = this.env(t, 0.7, 0.2);
    n.connect(hp).connect(ng).connect(this.master);
    n.start(t);
    n.stop(t + 0.25);
    n.onended = () => {
      hp.disconnect();
      ng.disconnect();
    };
    // tonal snap
    const osc = new OscillatorNode(this.ctx, { type: 'triangle', frequency: 180 });
    const og = this.env(t, 0.5, 0.1);
    osc.connect(og).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.15);
    osc.onended = () => og.disconnect();
  }

  private hat(t: number, decay: number): void {
    const n = this.noiseSource();
    const hp = new BiquadFilterNode(this.ctx, { type: 'highpass', frequency: 7000 });
    const g = this.env(t, 0.4, decay);
    n.connect(hp).connect(g).connect(this.master);
    n.start(t);
    n.stop(t + decay + 0.06);
    n.onended = () => {
      hp.disconnect();
      g.disconnect();
    };
  }

  private clap(t: number): void {
    const bp = new BiquadFilterNode(this.ctx, { type: 'bandpass', frequency: 1200, Q: 1.2 });
    bp.connect(this.master);
    const offsets = [0, 0.011, 0.022, 0.036];
    offsets.forEach((off, i) => {
      const last = i === offsets.length - 1;
      const n = this.noiseSource();
      const g = this.env(t + off, last ? 0.6 : 0.42, last ? 0.18 : 0.02);
      n.connect(g).connect(bp);
      n.start(t + off);
      n.stop(t + off + 0.22);
      n.onended = () => {
        g.disconnect();
        if (last) bp.disconnect();
      };
    });
  }
}
