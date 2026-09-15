import SignalsmithStretch, { type SignalsmithStretchNode } from 'signalsmith-stretch';
import { ThreeBandEQ } from './eq';
import { Timeline } from './timeline';

export interface LoadedTrackMeta {
  fileKey: string;
  title: string;
  artist: string;
}

export interface PlayOptions {
  /** AudioContext time to start/take effect. Defaults to "now + latency". */
  ctxTime?: number;
  /** Position in the track to play from (seconds). */
  trackTime: number;
  rate?: number;
}

/**
 * One DJ deck: signalsmith-stretch (time-stretch playback) -> 3-band EQ -> gain.
 * All transport goes through schedule() on the AudioContext clock and is
 * mirrored into a Timeline for exact trackTime <-> ctxTime conversion.
 */
export class Deck {
  readonly eq: ThreeBandEQ;
  readonly gain: GainNode;
  readonly timeline = new Timeline();
  loaded: LoadedTrackMeta | null = null;
  durationSec = 0;
  /** Worklet processing latency (seconds), measured once at creation. */
  latencySec = 0.12;

  private constructor(
    readonly id: string,
    private ctx: AudioContext,
    readonly stretch: SignalsmithStretchNode,
  ) {
    this.eq = new ThreeBandEQ(ctx);
    this.gain = new GainNode(ctx, { gain: 1 });
    stretch.connect(this.eq.input);
    this.eq.output.connect(this.gain);
    stretch.setUpdateInterval(0.05);
  }

  static async create(id: string, ctx: AudioContext, destination: AudioNode): Promise<Deck> {
    // NB: default node options only — passing numberOfInputs: 0 silently kills the processor.
    const stretch = await SignalsmithStretch(ctx);
    const deck = new Deck(id, ctx, stretch);
    deck.latencySec = await stretch.latency();
    deck.gain.connect(destination);
    return deck;
  }

  /** Replace the deck's content with a decoded track. */
  async load(buffer: AudioBuffer, meta: LoadedTrackMeta): Promise<void> {
    this.stretch.stop();
    await this.stretch.dropBuffers();
    // Copy channel data: addBuffers may transfer the arrays to the worklet.
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < Math.min(buffer.numberOfChannels, 2); ch++) {
      channels.push(buffer.getChannelData(ch).slice());
    }
    if (channels.length === 1) channels.push(channels[0].slice());
    await this.stretch.addBuffers(channels);
    this.durationSec = buffer.duration;
    this.loaded = meta;
    this.timeline.clear();
    this.pending = [];
  }

  /** Earliest ctx time a new schedule can take full effect. */
  get scheduleAhead(): number {
    return this.latencySec + 0.05;
  }

  /** Sample-accurately schedule playback of trackTime at ctxTime. */
  playAt({ ctxTime, trackTime, rate = 1 }: PlayOptions): void {
    const output = ctxTime ?? this.ctx.currentTime + this.scheduleAhead;
    this.scheduleChange({ output, input: trackTime, rate, active: true });
  }

  /** Change rate while playing, keeping position continuous. */
  setRate(rate: number, atCtxTime?: number): void {
    const output = atCtxTime ?? this.ctx.currentTime + this.scheduleAhead;
    const input = this.timeline.trackTimeAt(output);
    if (input === null) return;
    const active = this.timeline.activeAt(output);
    this.scheduleChange({ output, input, rate, active });
  }

  pause(): void {
    this.pauseAt(this.ctx.currentTime);
  }

  /** Schedule a stop at a future AudioContext time. */
  pauseAt(ctxTime: number): void {
    const input = this.timeline.trackTimeAt(ctxTime) ?? this.stretch.inputTime;
    const rate = this.timeline.rateAt(ctxTime) || 1;
    this.scheduleChange({ output: ctxTime, input, rate, active: false });
  }

  /**
   * The stretch worklet supports only ONE pending future change: each
   * schedule() prunes everything scheduled after "now" and fast-forwards its
   * map head (it's built for live posting, not upfront queues). So the full
   * schedule lives in our Timeline, and changes are posted to the worklet
   * only when imminent (< LOOKAHEAD_SEC away). Changes must therefore be
   * spaced further apart than LOOKAHEAD_SEC — currently the closest pair is
   * the 3s rate-glide steps.
   */
  private static readonly LOOKAHEAD_SEC = 2;
  private pending: { output: number; input: number; rate: number; active: boolean }[] = [];
  private dispatchTimer: ReturnType<typeof setInterval> | null = null;

  private scheduleChange(p: { output: number; input: number; rate: number; active: boolean }): void {
    this.timeline.add(p);
    this.pending = this.pending.filter((q) => q.output < p.output);
    this.pending.push(p);
    this.dispatch();
    if (this.pending.length > 0 && this.dispatchTimer === null) {
      this.dispatchTimer = setInterval(() => this.dispatch(), 250);
    }
  }

  private dispatch(): void {
    const now = this.ctx.currentTime;
    while (this.pending.length > 0 && this.pending[0].output - now < Deck.LOOKAHEAD_SEC) {
      const { output, input, rate, active } = this.pending.shift()!;
      this.stretch.schedule({ output, input, rate, active });
    }
    if (this.pending.length === 0 && this.dispatchTimer !== null) {
      clearInterval(this.dispatchTimer);
      this.dispatchTimer = null;
    }
  }

  get isPlaying(): boolean {
    return this.timeline.activeAt(this.ctx.currentTime);
  }

  /** Expected track position right now per the timeline (model truth). */
  get expectedTrackTime(): number | null {
    return this.timeline.trackTimeAt(this.ctx.currentTime);
  }

  /** Reported track position from the worklet (measured truth, ~50 ms granularity). */
  get reportedTrackTime(): number {
    return this.stretch.inputTime;
  }

  setVolume(v: number): void {
    try {
      this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
    } catch {
      // param is locked by an active setValueCurveAtTime (mid-transition) — ignore
    }
  }

  /** Jump forward/back while playing, keeping the current rate. */
  scrub(deltaSec: number): void {
    if (!this.loaded || !this.isPlaying) return;
    const now = this.ctx.currentTime;
    const pos = this.timeline.trackTimeAt(now) ?? 0;
    const rate = this.timeline.rateAt(now) || 1;
    const target = Math.min(Math.max(0, pos + deltaSec), Math.max(0, this.durationSec - 1));
    this.playAt({ trackTime: target, rate });
  }

  /** Free played-out audio behind the playhead. */
  async trimBehind(seconds = 30): Promise<void> {
    const pos = this.expectedTrackTime;
    if (pos !== null && pos > seconds) await this.stretch.dropBuffers(pos - seconds);
  }
}
