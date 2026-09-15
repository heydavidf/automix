import type { TrackAnalysis } from '../analysis/types';
import type { Deck } from './deck';
import { gridOf, phraseAtOrBefore, phraseAtOrAfter, downbeatAtOrAfter, BEATS_PER_BAR } from './grid';

export interface TransitionRequest {
  from: Deck;
  to: Deck;
  fromAnalysis: TrackAnalysis;
  toAnalysis: TrackAnalysis;
  /** Blend length in bars (of the outgoing track's tempo). */
  bars: number;
  /** Start at the outgoing track's next downbeat instead of its natural mix-out point. */
  forceNow?: boolean;
}

export interface TransitionPlan {
  /** AudioContext time the blend starts. */
  t0: number;
  /** Blend duration in seconds (output time). */
  durationSec: number;
  /** Incoming track position at t0. */
  mixInTrackTime: number;
  /** Outgoing track position at t0. */
  mixOutTrackTime: number;
  /** Rate the incoming deck plays at during the blend. */
  rate: number;
  /** True when grids were unusable and a plain crossfade was scheduled. */
  fallback: boolean;
}

// Below this, a beat-lock is more likely confidently WRONG than right (a
// 0.17 grid locked precisely off-beat) — a clean crossfade beats a bad
// beatmatch. 0.3 proved too aggressive on loose lofi (every mix fell back);
// 0.2-0.45 grids now beatmatch but only for the short 4-bar tier, so a
// wrong lock costs ~11s, not a 46s blend.
export const MIN_GRID_CONFIDENCE = 0.2;
// Bass swap depth: full on long blends with room for it; gentle on short
// blends so piano-led lows aren't gutted but the cross is still audible.
const KILL_DB = -12;
const SHORT_BLEND_KILL_DB = -6;
const FULL_SWAP_MIN_BARS = 8;

/**
 * Confidence-scaled blend length: the UI's bar count is a MAX, not a command.
 * Long overlaps are a house/techno assumption — two melodic tracks over a
 * shaky grid for 46s is mush, so weaker grids get shorter blends.
 */
export function effectiveBlendBars(
  requestedBars: number,
  fromConfidence: number,
  toConfidence: number,
): number {
  const conf = Math.min(fromConfidence, toConfidence);
  if (conf >= 0.6) return requestedBars;
  if (conf >= 0.45) return Math.min(requestedBars, 8);
  return Math.min(requestedBars, 4);
}

/**
 * Schedule a phrase-aligned DJ blend on the Web Audio clock:
 * - incoming starts at its pre-full-energy phrase boundary, stretched to the
 *   outgoing tempo
 * - equal-power gain cross over the window
 * - bass swap over 1 bar at the midpoint, gentle high-shelf cross over the window
 * - outgoing stops at the end; incoming glides back to rate 1
 */
export function scheduleTransition(req: TransitionRequest): TransitionPlan {
  const { from, to, fromAnalysis, toAnalysis, bars, forceNow } = req;
  const ctx = from.stretch.context as AudioContext;
  const now = ctx.currentTime;
  const earliest = now + Math.max(from.scheduleAhead, to.scheduleAhead) + 0.1;

  const fromGrid = gridOf(fromAnalysis);
  const toGrid = gridOf(toAnalysis);
  const gridsUsable =
    fromGrid !== null &&
    toGrid !== null &&
    fromAnalysis.gridConfidence >= MIN_GRID_CONFIDENCE &&
    toAnalysis.gridConfidence >= MIN_GRID_CONFIDENCE;

  if (!gridsUsable) return scheduleFallback(req, earliest);

  const outRate = from.timeline.rateAt(now) || 1;
  const effectiveFromBpm = fromGrid.bpm * outRate;
  // fold half/double-time so the stretch stays near 1 (64 vs 128 BPM still beat-locks)
  const rawRate = effectiveFromBpm / toGrid.bpm;
  const rate = [rawRate, rawRate / 2, rawRate * 2].reduce((best, r) =>
    Math.abs(r - 1) < Math.abs(best - 1) ? r : best,
  );
  // tempo gap too wide to beatmatch musically — cross-fade instead of chipmunking
  if (Math.abs(rate - 1) > 0.08) return scheduleFallback(req, earliest);
  // blend length measured in output seconds at the outgoing tempo
  const effBars = effectiveBlendBars(bars, fromAnalysis.gridConfidence, toAnalysis.gridConfidence);
  const durationSec = effBars * BEATS_PER_BAR * (60 / effectiveFromBpm);

  // --- outgoing mix-out point (track time) ---
  let mixOutTrackTime: number;
  const fromPos = from.expectedTrackTime ?? 0;
  if (forceNow) {
    const earliestTrack = from.timeline.trackTimeAt(earliest) ?? fromPos;
    mixOutTrackTime = downbeatAtOrAfter(fromGrid, earliestTrack);
  } else {
    const outro = fromAnalysis.outroStartSec ?? fromAnalysis.durationSec;
    const blendInputSec = durationSec * outRate;
    mixOutTrackTime = phraseAtOrBefore(fromGrid, outro - blendInputSec);
    const latestStart = fromAnalysis.durationSec - blendInputSec - fromGrid.barSec;
    mixOutTrackTime = Math.min(mixOutTrackTime, phraseAtOrBefore(fromGrid, latestStart));
    if (mixOutTrackTime < fromPos) {
      // too late for the natural point — go at the next phrase instead
      mixOutTrackTime = phraseAtOrAfter(fromGrid, from.timeline.trackTimeAt(earliest) ?? fromPos);
    }
  }

  let t0 = from.timeline.ctxTimeAt(mixOutTrackTime, now);
  if (t0 === null || t0 < earliest) {
    mixOutTrackTime = downbeatAtOrAfter(fromGrid, from.timeline.trackTimeAt(earliest) ?? fromPos);
    t0 = from.timeline.ctxTimeAt(mixOutTrackTime, now);
    if (t0 === null) return scheduleFallback(req, earliest);
  }

  // --- incoming mix-in point (track time) ---
  const introEnd = toAnalysis.introEndSec ?? 0;
  const fullEnergyPhrase = phraseAtOrAfter(toGrid, Math.max(introEnd, toGrid.downbeatSec));
  let mixInTrackTime = fullEnergyPhrase - durationSec * rate;
  if (mixInTrackTime < toGrid.downbeatSec) mixInTrackTime = toGrid.downbeatSec;

  // --- schedule transport ---
  to.playAt({ ctxTime: t0, trackTime: mixInTrackTime, rate });
  from.pauseAt(t0 + durationSec + 0.05);

  // --- gains: equal-power cross ---
  applyEqualPowerCross(from.gain.gain, to.gain.gain, t0, durationSec);

  // --- EQ: bass swap at midpoint over 1 bar, highs cross the whole window ---
  const swapDb = effBars >= FULL_SWAP_MIN_BARS ? KILL_DB : SHORT_BLEND_KILL_DB;
  const mid = t0 + durationSec / 2;
  const barOutSec = fromGrid.barSec / outRate;
  to.eq.setGainAt('low', swapDb, t0 - 0.02);
  from.eq.rampGain('low', 0, swapDb, mid - barOutSec / 2, barOutSec);
  to.eq.rampGain('low', swapDb, 0, mid - barOutSec / 2, barOutSec);
  from.eq.rampGain('high', 0, -8, t0, durationSec);
  to.eq.setGainAt('high', -8, t0 - 0.02);
  to.eq.rampGain('high', -8, 0, t0, durationSec);

  // --- after the blend: outgoing cleanup + incoming rate glide to 1 ---
  const tEnd = t0 + durationSec;
  scheduleAfter(ctx, tEnd + 0.2, () => {
    from.eq.reset();
    from.setVolume(1);
  });
  glideRateToUnity(to, rate, tEnd);

  return { t0, durationSec, mixInTrackTime, mixOutTrackTime, rate, fallback: false };
}

/** No usable grid: plain equal-power volume fade, no beatmatch, no EQ moves. */
function scheduleFallback(req: TransitionRequest, earliest: number): TransitionPlan {
  const { from, to, toAnalysis } = req;
  const ctx = from.stretch.context as AudioContext;
  const durationSec = 12;
  const t0 = earliest;
  const mixInTrackTime = toAnalysis.introEndSec ?? 0;
  to.playAt({ ctxTime: t0, trackTime: mixInTrackTime, rate: 1 });
  from.pauseAt(t0 + durationSec + 0.05);
  applyEqualPowerCross(from.gain.gain, to.gain.gain, t0, durationSec);
  scheduleAfter(ctx, t0 + durationSec + 0.2, () => {
    from.eq.reset();
    from.setVolume(1);
  });
  return {
    t0,
    durationSec,
    mixInTrackTime,
    mixOutTrackTime: from.expectedTrackTime ?? 0,
    rate: 1,
    fallback: true,
  };
}

function applyEqualPowerCross(outParam: AudioParam, inParam: AudioParam, t0: number, durationSec: number): void {
  const N = 65;
  const fadeOut = new Float32Array(N);
  const fadeIn = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    fadeOut[i] = Math.cos((x * Math.PI) / 2);
    fadeIn[i] = Math.sin((x * Math.PI) / 2);
  }
  outParam.cancelScheduledValues(t0 - 0.03);
  inParam.cancelScheduledValues(t0 - 0.03);
  outParam.setValueAtTime(1, t0 - 0.02);
  inParam.setValueAtTime(0, t0 - 0.02);
  outParam.setValueCurveAtTime(fadeOut, t0, durationSec);
  inParam.setValueCurveAtTime(fadeIn, t0, durationSec);
}

/** Step the incoming deck's rate back to 1.0 in inaudible ~0.8% increments. */
function glideRateToUnity(deck: Deck, fromRate: number, startCtxTime: number): void {
  if (Math.abs(fromRate - 1) < 0.002) {
    deck.setRate(1, startCtxTime + 0.5);
    return;
  }
  const steps = 8;
  const stepSec = 3;
  for (let i = 1; i <= steps; i++) {
    const r = fromRate + (1 - fromRate) * (i / steps);
    deck.setRate(r, startCtxTime + i * stepSec);
  }
}

/** Fire a callback near an AudioContext time (cosmetic cleanup only). */
function scheduleAfter(ctx: AudioContext, ctxTime: number, fn: () => void): void {
  setTimeout(fn, Math.max(0, (ctxTime - ctx.currentTime) * 1000));
}
