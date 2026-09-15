/**
 * Beat-grid derivation: turn essentia's raw beat ticks into a constant-tempo
 * grid (least-squares fit) and find the downbeat phase by testing which of
 * the 4 candidate phases maximizes kick-band energy on beat 1.
 */

export interface GridFit {
  bpm: number;
  beatIntervalSec: number;
  /** Time of grid beat 0 (not necessarily a downbeat). */
  offsetSec: number;
  /** RMS residual of ticks vs the fitted grid, in ms. */
  residualMs: number;
}

export function fitGrid(ticks: ArrayLike<number>): GridFit | null {
  const n = ticks.length;
  if (n < 8) return null;
  // least squares t_i = offset + i * interval
  let sumI = 0, sumT = 0, sumII = 0, sumIT = 0;
  for (let i = 0; i < n; i++) {
    sumI += i;
    sumT += ticks[i];
    sumII += i * i;
    sumIT += i * ticks[i];
  }
  const denom = n * sumII - sumI * sumI;
  if (denom === 0) return null;
  const interval = (n * sumIT - sumI * sumT) / denom;
  const offset = (sumT - interval * sumI) / n;
  if (interval <= 0) return null;
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const r = ticks[i] - (offset + i * interval);
    ss += r * r;
  }
  const residualMs = Math.sqrt(ss / n) * 1000;
  return { bpm: 60 / interval, beatIntervalSec: interval, offsetSec: offset, residualMs };
}

/** Fold tempo into the 70-180 BPM range (half/double-time disambiguation). */
export function normalizeTempo(fit: GridFit): GridFit {
  let { bpm, beatIntervalSec } = fit;
  while (bpm < 70) {
    bpm *= 2;
    beatIntervalSec /= 2;
  }
  while (bpm > 180) {
    bpm /= 2;
    beatIntervalSec *= 2;
  }
  return { ...fit, bpm, beatIntervalSec };
}

export interface DownbeatResult {
  /** Time of the first downbeat (>= 0). */
  firstDownbeatSec: number;
  /** 0-1: separation of the winning phase from the runner-up. */
  confidence: number;
}

export function findDownbeat(
  samples: Float32Array,
  sampleRate: number,
  beatIntervalSec: number,
  offsetSec: number,
): DownbeatResult {
  const low = kickBandEnvelope(samples, sampleRate);
  const durationSec = samples.length / sampleRate;
  const windowSec = 0.08;
  const half = Math.round((windowSec / 2) * sampleRate);

  const scores = [0, 0, 0, 0];
  const counts = [0, 0, 0, 0];
  for (let i = 0; ; i++) {
    const t = offsetSec + i * beatIntervalSec;
    if (t + windowSec > durationSec) break;
    const c = Math.round(t * sampleRate);
    let acc = 0;
    const from = Math.max(0, c - half);
    const to = Math.min(low.length, c + half);
    for (let s = from; s < to; s++) acc += low[s];
    const phase = i % 4;
    scores[phase] += acc / Math.max(1, to - from);
    counts[phase]++;
  }
  for (let p = 0; p < 4; p++) scores[p] /= Math.max(1, counts[p]);

  let best = 0;
  for (let p = 1; p < 4; p++) if (scores[p] > scores[best]) best = p;
  const sorted = [...scores].sort((a, b) => b - a);
  const confidence = sorted[0] > 0 ? (sorted[0] - sorted[1]) / sorted[0] : 0;

  let firstDownbeatSec = offsetSec + best * beatIntervalSec;
  const barSec = 4 * beatIntervalSec;
  while (firstDownbeatSec - barSec >= 0) firstDownbeatSec -= barSec;
  return { firstDownbeatSec, confidence };
}

/** One-pole lowpass (~150 Hz) then squared signal = kick-band energy envelope. */
function kickBandEnvelope(samples: Float32Array, sampleRate: number): Float32Array {
  const out = new Float32Array(samples.length);
  const alpha = 1 - Math.exp((-2 * Math.PI * 150) / sampleRate);
  let y = 0;
  for (let i = 0; i < samples.length; i++) {
    y += alpha * (samples[i] - y);
    out[i] = y * y;
  }
  return out;
}
