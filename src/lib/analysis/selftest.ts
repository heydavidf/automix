import { makeTestLoop } from '../engine/testtones';
import type { AnalyzeResponse } from '../../workers/analysis.worker';

/**
 * End-to-end analysis check on a synthesized 124 BPM / A-minor-ish loop.
 * Callable from the console (window.__automixSelfTest()) in any build —
 * exercises the bundled worker without needing a music folder.
 */
export async function analysisSelfTest(): Promise<AnalyzeResponse> {
  const off = new OfflineAudioContext({ numberOfChannels: 1, length: 1, sampleRate: 44100 });
  const loop = makeTestLoop(off, { bpm: 124, bars: 32, toneHz: 110 });
  const mono = loop.getChannelData(0).slice();
  const worker = new Worker(new URL('../../workers/analysis.worker.ts', import.meta.url), {
    type: 'module',
  });
  try {
    return await new Promise<AnalyzeResponse>((resolve) => {
      worker.onmessage = (ev: MessageEvent<AnalyzeResponse>) => resolve(ev.data);
      worker.onerror = (ev) => resolve({ type: 'error', fileKey: 'selftest', message: ev.message });
      worker.postMessage({ type: 'analyze', fileKey: 'selftest', samples: mono, sampleRate: 44100 }, [mono.buffer]);
    });
  } finally {
    worker.terminate();
  }
}

declare global {
  interface Window {
    __automixSelfTest?: typeof analysisSelfTest;
  }
}

window.__automixSelfTest = analysisSelfTest;
