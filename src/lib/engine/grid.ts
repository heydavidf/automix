import type { TrackAnalysis } from '../analysis/types';

export const BEATS_PER_BAR = 4;
export const BEATS_PER_PHRASE = 32; // 8 bars

export interface Grid {
  beatSec: number;
  barSec: number;
  phraseSec: number;
  downbeatSec: number;
  bpm: number;
}

export function gridOf(a: TrackAnalysis): Grid | null {
  if (!a.bpm || !a.beatIntervalSec || a.firstDownbeatSec === null) return null;
  const beatSec = a.beatIntervalSec;
  return {
    beatSec,
    barSec: beatSec * BEATS_PER_BAR,
    phraseSec: beatSec * BEATS_PER_PHRASE,
    downbeatSec: a.firstDownbeatSec + (a.manualOverrides?.gridNudgeBeats ?? 0) * beatSec,
    bpm: a.manualOverrides?.bpm ?? a.bpm,
  };
}

export function phraseAtOrBefore(g: Grid, t: number): number {
  return g.downbeatSec + Math.floor((t - g.downbeatSec) / g.phraseSec) * g.phraseSec;
}

export function phraseAtOrAfter(g: Grid, t: number): number {
  return g.downbeatSec + Math.ceil((t - g.downbeatSec) / g.phraseSec) * g.phraseSec;
}

export function downbeatAtOrAfter(g: Grid, t: number): number {
  return g.downbeatSec + Math.ceil((t - g.downbeatSec) / g.barSec) * g.barSec;
}
