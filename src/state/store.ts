import { create } from 'zustand';
import type { LibraryFile } from '../lib/library/scanner';
import type { TrackAnalysis, TrackTags } from '../lib/analysis/types';
import type { AnalysisStatus } from '../lib/analysis/analyzer';
import type { Engine } from '../lib/engine/engine';
import { getEngine } from '../lib/engine/engine';
import { AutoDJ, type AutoDJSnapshot } from '../lib/engine/autodj';
import {
  BroadcastController,
  type BroadcastSnapshot,
  type NowPlayingInfo,
} from '../lib/engine/broadcast';
import type { TransitionPlan } from '../lib/engine/transition-scheduler';
import {
  addHistoryEntry,
  getRecentHistory,
  putHistoryEntry,
  type PlayHistoryEntry,
} from '../lib/library/db';

export type LibraryStatus = 'empty' | 'scanning' | 'ready';

interface DeckDisplay {
  title: string;
  artist: string;
}

interface AppState {
  engine: Engine | null;
  libraryStatus: LibraryStatus;
  files: LibraryFile[];
  tags: Record<string, TrackTags>;
  decks: Record<'A' | 'B', DeckDisplay | null>;
  analyses: Record<string, TrackAnalysis>;
  analysisStatus: Record<string, AnalysisStatus>;
  setLibraryStatus: (s: LibraryStatus) => void;
  setFiles: (files: LibraryFile[]) => void;
  mergeTags: (tags: Record<string, TrackTags>) => void;
  setDeckDisplay: (id: 'A' | 'B', d: DeckDisplay | null) => void;
  setAnalysisStatus: (fileKey: string, status: AnalysisStatus, analysis?: TrackAnalysis) => void;
  ensureEngine: () => Promise<Engine>;
  autodj: AutoDJ | null;
  autodjSnap: AutoDJSnapshot | null;
  ensureAutoDJ: () => Promise<AutoDJ>;
  broadcast: BroadcastController | null;
  broadcastSnap: BroadcastSnapshot | null;
  ensureBroadcast: () => Promise<BroadcastController>;
  history: PlayHistoryEntry[];
  historyLoaded: boolean;
  loadHistory: () => Promise<void>;
  recordTransition: (
    from: TrackAnalysis,
    to: TrackAnalysis,
    plan: TransitionPlan,
    requestedBars: number,
    source: 'auto' | 'manual',
  ) => void;
  toggleStar: (id: number) => void;
  setNote: (id: number, note: string) => void;
}

function historyTrackRef(a: TrackAnalysis) {
  return {
    fileKey: a.fileKey,
    title: a.tags.title,
    artist: a.tags.artist,
    bpm: a.bpm,
    camelot: a.camelot,
    gridConfidence: a.gridConfidence,
  };
}

/** The track listeners currently hear: auto-DJ's active deck, else the single playing deck. */
function deriveNowPlaying(s: AppState): NowPlayingInfo | null {
  const engine = s.engine;
  if (!engine) return null;
  const deck =
    s.autodjSnap && s.autodjSnap.state !== 'idle'
      ? engine.deck(s.autodjSnap.activeDeck)
      : engine.decks.find((d) => d.isPlaying && d.loaded);
  if (!deck?.loaded) return null;
  const meta = deck.loaded;
  const analysis = s.analyses[meta.fileKey];
  return {
    fileKey: meta.fileKey,
    title: meta.title || 'Unknown title',
    artist: meta.artist || 'Unknown artist',
    bpm: analysis?.bpm != null ? Math.round(analysis.bpm * 10) / 10 : 0,
    camelot: analysis?.camelot ? `${analysis.camelot.num}${analysis.camelot.letter}` : '?',
  };
}

declare global {
  interface Window {
    __automix?: typeof useAppStore;
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  engine: null,
  libraryStatus: 'empty',
  files: [],
  tags: {},
  decks: { A: null, B: null },
  analyses: {},
  analysisStatus: {},
  setLibraryStatus: (libraryStatus) => set({ libraryStatus }),
  setFiles: (files) => set({ files }),
  mergeTags: (tags) => set((s) => ({ tags: { ...s.tags, ...tags } })),
  setDeckDisplay: (id, d) => set((s) => ({ decks: { ...s.decks, [id]: d } })),
  setAnalysisStatus: (fileKey, status, analysis) =>
    set((s) => ({
      analysisStatus: { ...s.analysisStatus, [fileKey]: status },
      analyses: analysis ? { ...s.analyses, [fileKey]: analysis } : s.analyses,
    })),
  ensureEngine: async () => {
    const existing = get().engine;
    if (existing) return existing;
    const engine = await getEngine();
    set({ engine });
    return engine;
  },
  autodj: null,
  autodjSnap: null,
  ensureAutoDJ: async () => {
    const existing = get().autodj;
    if (existing) return existing;
    const engine = await get().ensureEngine();
    const dj = new AutoDJ(
      engine,
      () => ({ files: get().files, analyses: get().analyses }),
      (snap) => set({ autodjSnap: snap }),
      (from, to, plan, bars) => get().recordTransition(from, to, plan, bars, 'auto'),
    );
    set({ autodj: dj });
    return dj;
  },
  broadcast: null,
  broadcastSnap: null,
  ensureBroadcast: async () => {
    const existing = get().broadcast;
    if (existing) return existing;
    const engine = await get().ensureEngine();
    const controller = new BroadcastController(engine, (snap) => set({ broadcastSnap: snap }));
    set({ broadcast: controller, broadcastSnap: controller.snapshot });
    // Mirror the playing track into the broadcast (bot presence). The controller
    // dedupes by fileKey, so feeding it on every store change is cheap.
    const feed = () => {
      const np = deriveNowPlaying(get());
      if (np) controller.setNowPlaying(np);
    };
    useAppStore.subscribe(feed);
    feed();
    return controller;
  },
  history: [],
  historyLoaded: false,
  loadHistory: async () => {
    if (get().historyLoaded) return;
    try {
      const history = await getRecentHistory();
      set({ history, historyLoaded: true });
    } catch (e) {
      console.warn('History load failed:', e);
      set({ historyLoaded: true });
    }
  },
  recordTransition: (from, to, plan, requestedBars, source) => {
    const entry: PlayHistoryEntry = {
      at: Date.now(),
      source,
      from: historyTrackRef(from),
      to: historyTrackRef(to),
      requestedBars,
      durationSec: plan.durationSec,
      rate: plan.rate,
      fallback: plan.fallback,
      starred: false,
      note: '',
    };
    // fire-and-forget: history must never break playback
    addHistoryEntry(entry)
      .then((id) => set((s) => ({ history: [{ ...entry, id }, ...s.history] })))
      .catch((e) => console.warn('History write failed:', e));
  },
  toggleStar: (id) => {
    const entry = get().history.find((h) => h.id === id);
    if (!entry) return;
    const updated = { ...entry, starred: !entry.starred };
    set((s) => ({ history: s.history.map((h) => (h.id === id ? updated : h)) }));
    putHistoryEntry(updated).catch((e) => console.warn('History update failed:', e));
  },
  setNote: (id, note) => {
    const entry = get().history.find((h) => h.id === id);
    if (!entry) return;
    const updated = { ...entry, note };
    set((s) => ({ history: s.history.map((h) => (h.id === id ? updated : h)) }));
    putHistoryEntry(updated).catch((e) => console.warn('History update failed:', e));
  },
}));

window.__automix = useAppStore;
