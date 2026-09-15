/**
 * Analysis worker: essentia.js (WASM) for BPM/ticks/key, plus our own
 * beat-grid regression, downbeat phase, energy curve, and intro/outro.
 * Input audio must be mono 44100 Hz (RhythmExtractor2013 assumes 44.1k).
 */
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js';
import Essentia from 'essentia.js/dist/essentia.js-core.es.js';
import { fitGrid, normalizeTempo, findDownbeat } from '../lib/analysis/beatgrid';
import { energyCurve, detectIntroOutro } from '../lib/analysis/energy';
import { toCamelot } from '../lib/analysis/camelot';

export interface AnalyzeRequest {
  type: 'analyze';
  fileKey: string;
  samples: Float32Array;
  sampleRate: number;
}

export interface AnalyzeResponse {
  type: 'result' | 'error';
  fileKey: string;
  message?: string;
  result?: {
    bpm: number | null;
    beatIntervalSec: number | null;
    firstDownbeatSec: number | null;
    gridConfidence: number;
    camelot: { num: number; letter: 'A' | 'B' } | null;
    keyName: string | null;
    keyConfidence: number;
    energy: number;
    energyCurve: number[];
    introEndSec: number | null;
    outroStartSec: number | null;
  };
}

const ready = new Promise<void>((resolve) => {
  if (EssentiaWASM.calledRun) resolve();
  else EssentiaWASM.onRuntimeInitialized = () => resolve();
});

let essentia: Essentia | null = null;

self.onmessage = async (ev: MessageEvent<AnalyzeRequest>) => {
  const { fileKey, samples, sampleRate } = ev.data;
  try {
    await ready;
    essentia ??= new Essentia(EssentiaWASM);
    const result = analyze(essentia, samples, sampleRate);
    postMessage({ type: 'result', fileKey, result } satisfies AnalyzeResponse);
  } catch (e) {
    postMessage({ type: 'error', fileKey, message: String(e) } satisfies AnalyzeResponse);
  }
};

function analyze(ess: Essentia, samples: Float32Array, sampleRate: number): AnalyzeResponse['result'] {
  const durationSec = samples.length / sampleRate;
  const vec = ess.arrayToVector(samples);
  try {
    // --- rhythm ---
    const rhythm = ess.RhythmExtractor2013(vec, 208, 'multifeature', 60);
    const ticks = ess.vectorToArray(rhythm.ticks);
    rhythm.ticks.delete();
    rhythm.estimates.delete();
    rhythm.bpmIntervals.delete();
    // essentia multifeature confidence ranges 0..5.32
    const essConfidence = Math.max(0, Math.min(1, rhythm.confidence / 5.32));

    let bpm: number | null = null;
    let beatIntervalSec: number | null = null;
    let firstDownbeatSec: number | null = null;
    let gridConfidence = 0;

    const rawFit = fitGrid(ticks);
    if (rawFit) {
      const fit = normalizeTempo(rawFit);
      bpm = fit.bpm;
      beatIntervalSec = fit.beatIntervalSec;
      const db = findDownbeat(samples, sampleRate, fit.beatIntervalSec, fit.offsetSec);
      firstDownbeatSec = db.firstDownbeatSec;
      // jittery ticks (vs the constant grid) and a weak downbeat both reduce trust
      gridConfidence = essConfidence * Math.exp(-fit.residualMs / 50) * (0.5 + 0.5 * db.confidence);
    }

    // --- key ---
    const key = ess.KeyExtractor(vec);
    const camelot = toCamelot(key.key, key.scale);

    // --- energy / structure ---
    const windowSec = beatIntervalSec ? beatIntervalSec * 16 : 4;
    const curve = energyCurve(samples, sampleRate, windowSec);
    const { introEndSec, outroStartSec } = detectIntroOutro(curve, windowSec, durationSec);
    const energy = curve.reduce((a, b) => a + b, 0) / Math.max(1, curve.length);

    return {
      bpm,
      beatIntervalSec,
      firstDownbeatSec,
      gridConfidence,
      camelot,
      keyName: `${key.key} ${key.scale}`,
      keyConfidence: key.strength,
      energy,
      energyCurve: curve,
      introEndSec,
      outroStartSec,
    };
  } finally {
    vec.delete();
  }
}
