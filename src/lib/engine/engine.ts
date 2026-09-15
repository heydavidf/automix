import { Deck } from './deck';

export class Engine {
  private constructor(
    readonly ctx: AudioContext,
    readonly master: GainNode,
    /** Speakers-only leg. Mute this (gain 0) to silence local output without killing the broadcast tap on `master`. */
    readonly monitor: GainNode,
    readonly deckA: Deck,
    readonly deckB: Deck,
  ) {}

  static async init(): Promise<Engine> {
    const ctx = new AudioContext({ latencyHint: 'playback' });
    await ctx.resume();
    const master = new GainNode(ctx, { gain: 0.9 });
    const monitor = new GainNode(ctx, { gain: 1 });
    master.connect(monitor);
    monitor.connect(ctx.destination);
    const [deckA, deckB] = await Promise.all([
      Deck.create('A', ctx, master),
      Deck.create('B', ctx, master),
    ]);
    return new Engine(ctx, master, monitor, deckA, deckB);
  }

  get decks(): [Deck, Deck] {
    return [this.deckA, this.deckB];
  }

  deck(id: 'A' | 'B'): Deck {
    return id === 'A' ? this.deckA : this.deckB;
  }

  async decode(file: File): Promise<AudioBuffer> {
    return this.ctx.decodeAudioData(await file.arrayBuffer());
  }
}

let enginePromise: Promise<Engine> | null = null;

/** Lazy singleton — first call must come from a user gesture (autoplay policy). */
export function getEngine(): Promise<Engine> {
  enginePromise ??= Engine.init();
  return enginePromise;
}
