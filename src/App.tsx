import { useEffect } from 'react';
import { useAppStore } from './state/store';
import { LibraryPanel } from './components/LibraryPanel';
import { DeckPanel } from './components/DeckPanel';
import { BeatmatchLab } from './components/BeatmatchLab';
import { MixControls } from './components/MixControls';
import { AutoDJPanel } from './components/AutoDJPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { SynthLab } from './components/SynthLab';
import { BroadcastLab } from './components/BroadcastLab';
import type { LibraryFile } from './lib/library/scanner';

export default function App() {
  const { ensureEngine, tags, setDeckDisplay } = useAppStore();

  // arrow keys scrub the playing deck ±10s (ignored while typing in a field
  // or mid-blend when both decks play — scrubbing one would break the sync)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      const engine = useAppStore.getState().engine;
      if (!engine) return;
      const playing = engine.decks.filter((d) => d.isPlaying && d.loaded);
      if (playing.length !== 1) return;
      e.preventDefault();
      playing[0].scrub(e.key === 'ArrowRight' ? 10 : -10);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function loadToDeck(file: LibraryFile, deckId: 'A' | 'B') {
    const engine = await ensureEngine();
    const f = await file.handle.getFile();
    const buffer = await engine.decode(f);
    const t = tags[file.fileKey];
    const meta = {
      fileKey: file.fileKey,
      title: t?.title ?? file.name,
      artist: t?.artist ?? 'Unknown artist',
    };
    await engine.deck(deckId).load(buffer, meta);
    setDeckDisplay(deckId, { title: meta.title, artist: meta.artist });
  }

  return (
    <div className="mx-auto flex h-dvh max-w-6xl flex-col gap-4 p-4">
      <header className="flex items-baseline gap-3">
        <h1 className="text-xl font-black tracking-tight">AutoMix</h1>
        <span className="text-xs text-zinc-500">harmonic auto-mixing player — engine prototype</span>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <LibraryPanel onLoadToDeck={loadToDeck} />
        <div className="flex flex-col gap-4 overflow-y-auto">
          <AutoDJPanel />
          <DeckPanel deckId="A" />
          <DeckPanel deckId="B" />
          <MixControls />
          <SynthLab />
          <BroadcastLab />
          <HistoryPanel />
          <BeatmatchLab />
        </div>
      </div>
    </div>
  );
}
