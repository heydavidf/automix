import type { LibraryFile } from '../library/scanner';
import type { TrackAnalysis } from '../analysis/types';
import type { Engine } from './engine';
import type { Deck } from './deck';
import { rankCandidates, type Candidate, type EnergyDirection } from './selector';
import {
  scheduleTransition,
  effectiveBlendBars,
  MIN_GRID_CONFIDENCE,
  type TransitionPlan,
} from './transition-scheduler';
import { gridOf, phraseAtOrBefore } from './grid';

export type AutoDJState = 'idle' | 'playing' | 'scheduled';

export interface AutoDJSnapshot {
  state: AutoDJState;
  activeDeck: 'A' | 'B';
  currentKey: string | null;
  nextKey: string | null;
  nextLoaded: boolean;
  candidates: Candidate[];
  /** AudioContext time of the next blend start, when scheduled. */
  transitionAt: number | null;
  transitionDuration: number | null;
}

export interface LibrarySource {
  files: LibraryFile[];
  analyses: Record<string, TrackAnalysis>;
}

const PRELOAD_WINDOW_SEC = 60;
const SCHEDULE_WINDOW_SEC = 12;
const EMERGENCY_REMAINING_SEC = 10;

/**
 * The auto-mix loop: pick a harmonic next track, preload it into the idle
 * deck as the mix-out point approaches, schedule the blend, flip decks,
 * repeat. All timing decisions read the active deck's timeline; the tick
 * only decides, the Web Audio clock executes.
 */
export class AutoDJ {
  transitionBars = 16;
  energyDirection: EnergyDirection = 0;

  private state: AutoDJState = 'idle';
  private active: 'A' | 'B' = 'A';
  private history: string[] = [];
  private nextKey: string | null = null;
  private nextLoadedKey: string | null = null;
  private candidates: Candidate[] = [];
  private plan: TransitionPlan | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private loadToken = 0;

  constructor(
    private engine: Engine,
    private getLibrary: () => LibrarySource,
    private onUpdate: (snap: AutoDJSnapshot) => void,
    private onTransition?: (
      from: TrackAnalysis,
      to: TrackAnalysis,
      plan: TransitionPlan,
      bars: number,
    ) => void,
  ) {}

  private deck(id: 'A' | 'B'): Deck {
    return this.engine.deck(id);
  }

  private get activeDeck(): Deck {
    return this.deck(this.active);
  }

  private get idleDeck(): Deck {
    return this.deck(this.active === 'A' ? 'B' : 'A');
  }

  get snapshot(): AutoDJSnapshot {
    return {
      state: this.state,
      activeDeck: this.active,
      currentKey: this.activeDeck.loaded?.fileKey ?? null,
      nextKey: this.nextKey,
      nextLoaded: this.nextKey !== null && this.nextLoadedKey === this.nextKey,
      candidates: this.candidates.slice(0, 8),
      transitionAt: this.plan?.t0 ?? null,
      transitionDuration: this.plan?.durationSec ?? null,
    };
  }

  async start(fileKey?: string): Promise<void> {
    const { files, analyses } = this.getLibrary();
    const playable = Object.values(analyses).filter((a) => a.bpm && a.camelot);
    const first =
      (fileKey && analyses[fileKey]) ||
      playable[Math.floor(Math.random() * Math.max(1, playable.length))] ||
      Object.values(analyses)[0];
    if (!first) throw new Error('No analyzed tracks in the library yet.');
    const file = files.find((f) => f.fileKey === first.fileKey);
    if (!file) throw new Error('Track file not found in the current library.');

    const buffer = await this.engine.decode(await file.handle.getFile());
    await this.activeDeck.load(buffer, {
      fileKey: first.fileKey,
      title: first.tags.title,
      artist: first.tags.artist,
    });
    this.activeDeck.setVolume(1);
    this.activeDeck.eq.reset();
    this.activeDeck.playAt({ trackTime: 0, rate: 1 });
    this.history.unshift(first.fileKey);
    this.state = 'playing';
    this.timer ??= setInterval(() => void this.tick(), 1000);
    this.push();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.loadToken++;
    this.engine.deckA.pause();
    this.engine.deckB.pause();
    this.state = 'idle';
    this.plan = null;
    this.nextKey = null;
    this.nextLoadedKey = null;
    this.push();
  }

  /** User picks a different next track (only before a blend is scheduled). */
  overrideNext(fileKey: string): void {
    if (this.state !== 'playing') return;
    this.nextKey = fileKey;
    this.push();
  }

  /** Re-roll the next pick. */
  skipNext(): void {
    if (this.state !== 'playing' || !this.nextKey) return;
    const skipped = this.nextKey;
    this.candidates = this.candidates.filter((c) => c.analysis.fileKey !== skipped);
    this.nextKey = this.candidates[0]?.analysis.fileKey ?? null;
    this.push();
  }

  /** Blend to the next track at the active deck's next downbeat. */
  async forceTransition(): Promise<void> {
    if (this.state !== 'playing' || !this.nextKey) return;
    if (this.nextLoadedKey !== this.nextKey) await this.loadNext(this.nextKey);
    if (this.nextLoadedKey === this.nextKey) this.scheduleBlend(true);
    this.push();
  }

  private currentAnalysis(): TrackAnalysis | null {
    const key = this.activeDeck.loaded?.fileKey;
    return key ? (this.getLibrary().analyses[key] ?? null) : null;
  }

  private async tick(): Promise<void> {
    if (this.ticking || this.state === 'idle') return;
    this.ticking = true;
    try {
      const now = this.engine.ctx.currentTime;
      void this.activeDeck.trimBehind(45);

      if (this.state === 'scheduled') {
        if (this.plan && now > this.plan.t0 + this.plan.durationSec + 0.3) this.completeTransition();
        this.push();
        return;
      }

      const cur = this.currentAnalysis();
      if (!cur) return;

      if (!this.nextKey) {
        this.candidates = rankCandidates(cur, Object.values(this.getLibrary().analyses), {
          energyDirection: this.energyDirection,
          recentFileKeys: this.history,
        });
        this.nextKey = this.candidates[0]?.analysis.fileKey ?? null;
      }

      const remaining = this.timeToMixOut(cur);

      if (this.nextKey && this.nextLoadedKey !== this.nextKey && remaining < PRELOAD_WINDOW_SEC) {
        await this.loadNext(this.nextKey);
      }

      const ready = this.nextKey !== null && this.nextLoadedKey === this.nextKey;
      if (ready && remaining < SCHEDULE_WINDOW_SEC) {
        this.scheduleBlend(false);
      } else if (ready && this.trackRemaining() < EMERGENCY_REMAINING_SEC) {
        this.scheduleBlend(true);
      }
      this.push();
    } finally {
      this.ticking = false;
    }
  }

  /** Output seconds until the natural blend start on the active deck. */
  private timeToMixOut(cur: TrackAnalysis): number {
    const now = this.engine.ctx.currentTime;
    const pos = this.activeDeck.expectedTrackTime ?? 0;
    const grid = gridOf(cur);
    if (!grid || cur.gridConfidence < MIN_GRID_CONFIDENCE) {
      const target = (cur.outroStartSec ?? cur.durationSec) - 12;
      return Math.max(0, target - pos);
    }
    const outRate = this.activeDeck.timeline.rateAt(now) || 1;
    const effBpm = grid.bpm * outRate;
    const next = this.nextKey ? this.getLibrary().analyses[this.nextKey] : null;
    const bars = effectiveBlendBars(this.transitionBars, cur.gridConfidence, next?.gridConfidence ?? 1);
    const blendOutputSec = bars * 4 * (60 / effBpm);
    const blendInputSec = blendOutputSec * outRate;
    let mixOut = phraseAtOrBefore(grid, (cur.outroStartSec ?? cur.durationSec) - blendInputSec);
    mixOut = Math.min(mixOut, phraseAtOrBefore(grid, cur.durationSec - blendInputSec - grid.barSec));
    const t0 = this.activeDeck.timeline.ctxTimeAt(mixOut, now);
    return t0 === null ? 0 : Math.max(0, t0 - now);
  }

  private trackRemaining(): number {
    const pos = this.activeDeck.expectedTrackTime ?? 0;
    return this.activeDeck.durationSec - pos;
  }

  private async loadNext(fileKey: string): Promise<void> {
    const token = ++this.loadToken;
    const { files, analyses } = this.getLibrary();
    const a = analyses[fileKey];
    const f = files.find((x) => x.fileKey === fileKey);
    if (!a || !f) {
      this.nextKey = null;
      return;
    }
    const buffer = await this.engine.decode(await f.handle.getFile());
    if (token !== this.loadToken) return; // superseded by stop() or a newer load
    await this.idleDeck.load(buffer, { fileKey, title: a.tags.title, artist: a.tags.artist });
    this.idleDeck.setVolume(1);
    this.idleDeck.eq.reset();
    this.nextLoadedKey = fileKey;
  }

  private scheduleBlend(forceNow: boolean): void {
    const cur = this.currentAnalysis();
    const next = this.nextKey ? this.getLibrary().analyses[this.nextKey] : null;
    if (!cur || !next) return;
    this.plan = scheduleTransition({
      from: this.activeDeck,
      to: this.idleDeck,
      fromAnalysis: cur,
      toAnalysis: next,
      bars: this.transitionBars,
      forceNow,
    });
    this.state = 'scheduled';
    this.onTransition?.(cur, next, this.plan, this.transitionBars);
  }

  private completeTransition(): void {
    this.active = this.active === 'A' ? 'B' : 'A';
    if (this.nextKey) this.history.unshift(this.nextKey);
    this.history.length = Math.min(this.history.length, 50);
    this.nextKey = null;
    this.nextLoadedKey = null;
    this.plan = null;
    this.candidates = [];
    this.state = 'playing';
  }

  private push(): void {
    this.onUpdate(this.snapshot);
  }
}
