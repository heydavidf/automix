export interface CamelotKey {
  num: number; // 1-12
  letter: 'A' | 'B'; // A = minor, B = major
}

export interface TrackTags {
  title: string;
  artist: string;
  album?: string;
}

export const ANALYSIS_VERSION = 1;

export interface TrackAnalysis {
  fileKey: string;
  path: string;
  tags: TrackTags;
  durationSec: number;
  bpm: number | null;
  /** Seconds per beat of the regressed constant grid. */
  beatIntervalSec: number | null;
  firstDownbeatSec: number | null;
  /** 0-1; below threshold we fall back to plain crossfades. */
  gridConfidence: number;
  camelot: CamelotKey | null;
  keyName: string | null;
  keyConfidence: number;
  /** 0-1 overall energy. */
  energy: number;
  /** Per-phrase energy, 0-1. */
  energyCurve: number[];
  introEndSec: number | null;
  outroStartSec: number | null;
  analysisVersion: number;
  manualOverrides?: {
    bpm?: number;
    camelot?: CamelotKey;
    gridNudgeBeats?: number;
  };
}
