import type { LibraryFile } from '../library/scanner';
import type { TrackAnalysis, TrackTags } from './types';
import { ANALYSIS_VERSION } from './types';
import { getAnalysis, putAnalysis } from '../library/db';
import type { AnalyzeResponse } from '../../workers/analysis.worker';

export type AnalysisStatus = 'pending' | 'analyzing' | 'done' | 'error';

export interface AnalyzerCallbacks {
  onStatus: (fileKey: string, status: AnalysisStatus, analysis?: TrackAnalysis, error?: string) => void;
}

const ANALYSIS_SR = 44100; // RhythmExtractor2013 assumes 44.1 kHz

/**
 * Sequential analysis queue: decode at 44.1k -> mono downmix -> transfer to
 * the essentia worker -> persist TrackAnalysis to IndexedDB. One track at a
 * time keeps peak memory at one decoded file.
 */
export class Analyzer {
  private worker: Worker;
  private queue: { file: LibraryFile; tags: TrackTags }[] = [];
  private running = false;
  private pendingResolve: ((r: AnalyzeResponse) => void) | null = null;

  constructor(private callbacks: AnalyzerCallbacks) {
    this.worker = new Worker(new URL('../../workers/analysis.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (ev: MessageEvent<AnalyzeResponse>) => {
      this.pendingResolve?.(ev.data);
      this.pendingResolve = null;
    };
    this.worker.onerror = (ev) => {
      this.pendingResolve?.({ type: 'error', fileKey: '', message: ev.message ?? 'worker error' });
      this.pendingResolve = null;
    };
  }

  /** Queue all files; cached analyses resolve immediately. */
  async enqueue(files: LibraryFile[], getTags: (fileKey: string) => TrackTags | undefined): Promise<void> {
    for (const file of files) {
      const cached = await getAnalysis(file.fileKey);
      if (cached && cached.analysisVersion === ANALYSIS_VERSION) {
        this.callbacks.onStatus(file.fileKey, 'done', cached);
        continue;
      }
      this.callbacks.onStatus(file.fileKey, 'pending');
      this.queue.push({
        file,
        tags: getTags(file.fileKey) ?? { title: file.name, artist: 'Unknown artist' },
      });
    }
    void this.run();
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0) {
      const { file, tags } = this.queue.shift()!;
      this.callbacks.onStatus(file.fileKey, 'analyzing');
      try {
        const analysis = await this.analyzeOne(file, tags);
        await putAnalysis(analysis);
        this.callbacks.onStatus(file.fileKey, 'done', analysis);
      } catch (e) {
        this.callbacks.onStatus(file.fileKey, 'error', undefined, String(e));
      }
    }
    this.running = false;
  }

  private async analyzeOne(file: LibraryFile, tags: TrackTags): Promise<TrackAnalysis> {
    const f = await file.handle.getFile();
    const arrayBuffer = await f.arrayBuffer();
    const decodeCtx = new OfflineAudioContext({ numberOfChannels: 1, length: 1, sampleRate: ANALYSIS_SR });
    const buffer = await decodeCtx.decodeAudioData(arrayBuffer);
    const mono = downmixToMono(buffer);
    const durationSec = buffer.duration;

    const response = await new Promise<AnalyzeResponse>((resolve, reject) => {
      this.pendingResolve = resolve;
      try {
        this.worker.postMessage(
          { type: 'analyze', fileKey: file.fileKey, samples: mono, sampleRate: ANALYSIS_SR },
          [mono.buffer],
        );
      } catch (e) {
        this.pendingResolve = null;
        reject(e);
      }
    });

    if (response.type === 'error' || !response.result) {
      throw new Error(response.message ?? 'analysis failed');
    }
    return {
      fileKey: file.fileKey,
      path: file.path,
      tags,
      durationSec,
      ...response.result,
      analysisVersion: ANALYSIS_VERSION,
    };
  }
}

function downmixToMono(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  if (channels === 1) return buffer.getChannelData(0).slice();
  const out = new Float32Array(buffer.length);
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < out.length; i++) out[i] += data[i] / channels;
  }
  return out;
}

let analyzerInstance: Analyzer | null = null;

export function getAnalyzer(callbacks: AnalyzerCallbacks): Analyzer {
  analyzerInstance ??= new Analyzer(callbacks);
  return analyzerInstance;
}
