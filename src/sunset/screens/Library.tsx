import { useEffect, useState } from 'react';
import { useAppStore } from '../../state/store';
import { pickLibraryFolder, restoreLibraryFolder, hasSavedLibrary, isFsAccessSupported } from '../../lib/library/fs-access';
import { scanFolder, type LibraryFile } from '../../lib/library/scanner';
import { readTags } from '../../lib/library/metadata';
import { getAnalyzer } from '../../lib/analysis/analyzer';
import type { TrackTags } from '../../lib/analysis/types';
import { Window, KeyBadge, EnergyMeter } from '../chrome';

export function Library() {
  const {
    libraryStatus, files, tags, analyses, analysisStatus,
    setLibraryStatus, setFiles, mergeTags, setAnalysisStatus,
    ensureEngine, setDeckDisplay,
  } = useAppStore();
  const [canResume, setCanResume] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [dirName, setDirName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hasSavedLibrary().then(setCanResume);
  }, []);

  async function openFolder(restore: boolean) {
    setError(null);
    try {
      const dir = restore ? await restoreLibraryFolder() : await pickLibraryFolder();
      if (!dir) {
        setError('RESTORE FAILED — PERMISSION DENIED');
        return;
      }
      setDirName(dir.name);
      setLibraryStatus('scanning');
      const found = await scanFolder(dir, setScanCount);
      setFiles(found);
      setLibraryStatus('ready');
      const allTags = await readAllTags(found, mergeTags);
      const analyzer = getAnalyzer({
        onStatus: (fileKey, status, analysis) => setAnalysisStatus(fileKey, status, analysis),
      });
      void analyzer.enqueue(found, (fileKey) => allTags[fileKey]);
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') setError(String(e).toUpperCase().slice(0, 80));
      setLibraryStatus(files.length ? 'ready' : 'empty');
    }
  }

  async function loadToDeck(file: LibraryFile, deckId: 'A' | 'B') {
    const engine = await ensureEngine();
    const f = await file.handle.getFile();
    const buffer = await engine.decode(f);
    const t = tags[file.fileKey];
    const meta = { fileKey: file.fileKey, title: t?.title ?? file.name, artist: t?.artist ?? 'Unknown artist' };
    await engine.deck(deckId).load(buffer, meta);
    setDeckDisplay(deckId, { title: meta.title, artist: meta.artist });
  }

  if (!isFsAccessSupported()) {
    return (
      <div className="flex min-h-[calc(100vh-2rem)] items-start justify-center p-8">
        <Window title="LIBRARY.EXE // ERROR" variant="inactive" className="w-[480px]">
          <p className="p-4 font-label text-[11px] uppercase">FILE SYSTEM ACCESS API MISSING — USE CHROME</p>
        </Window>
      </div>
    );
  }

  const doneCount = files.filter((f) => analysisStatus[f.fileKey] === 'done').length;
  const analyzing = files.some((f) => analysisStatus[f.fileKey] === 'analyzing' || analysisStatus[f.fileKey] === 'pending');
  const pct = files.length ? Math.round((doneCount / files.length) * 100) : 0;

  return (
    <div className="relative min-h-[calc(100vh-2rem)] p-8">
      <div className="mx-auto max-w-4xl shadow-2xl">
        <Window
          title="LIBRARY.EXE"
          variant="active"
          statusLeft={`${files.length} TRACKS / ${doneCount} ANALYZED / ${doneCount > 0 ? 'CACHE WARM' : 'CACHE COLD'}`}
          statusRight={
            <a
              href="#/"
              className="flex cursor-pointer items-center gap-1 border-0 bg-magenta px-4 py-1.5 font-headline text-[11px] font-bold tracking-wider text-white italic no-underline retro-bevel-out hover:brightness-110"
            >
              OPEN MIX
              <span className="material-symbols-outlined text-[12px]">queue_music</span>
            </a>
          }
        >
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 border-b border-bevel-shadow p-2">
            <div className="lcd-display flex items-center gap-2 px-2 py-1">
              <span className="material-symbols-outlined text-[12px]">folder_open</span>
              <span className="font-label text-[10px] tracking-tight uppercase">{dirName ? `~/${dirName}` : 'NO FOLDER MOUNTED'}</span>
            </div>
            <button
              className="cursor-pointer border-0 bg-cream px-3 py-1 font-label text-[10px] tracking-widest text-onyx uppercase retro-bevel-out hover:bg-blush"
              onClick={() => openFolder(false)}
            >
              Choose Folder
            </button>
            {canResume && (
              <button
                className="cursor-pointer border-0 bg-cream px-3 py-1 font-label text-[10px] tracking-widest text-onyx uppercase retro-bevel-out hover:bg-blush"
                onClick={() => openFolder(true)}
                data-testid="sunset-resume-library"
              >
                Resume Library
              </button>
            )}
            {libraryStatus === 'scanning' && (
              <span className="font-label text-[10px] tracking-widest uppercase opacity-70">SCANNING… {scanCount} FILES</span>
            )}
            {libraryStatus === 'ready' && analyzing && (
              <div className="flex min-w-[160px] flex-1 items-center gap-2">
                <span className="font-label text-[10px] tracking-widest uppercase opacity-70">
                  ANALYZING {doneCount} OF {files.length}
                </span>
                <div className="h-2 flex-1 overflow-hidden bg-white retro-bevel-in">
                  <div className="h-full bg-gradient-sunset" style={{ width: `${pct}%` }}></div>
                </div>
                <span className="font-label text-[10px]">{pct}%</span>
              </div>
            )}
          </div>

          {error && (
            <div className="m-2 lcd-display px-2 py-1">
              <span className="font-label text-[10px] uppercase">{error}</span>
            </div>
          )}

          {libraryStatus === 'empty' && !error && (
            <p className="p-4 font-label text-[11px] tracking-widest uppercase opacity-60">
              POINT AUTOMIX AT A FOLDER OF MUSIC TO BEGIN
            </p>
          )}

          {libraryStatus === 'ready' && (
            <div className="m-2 max-h-[60vh] overflow-y-auto bg-white/40 p-1 retro-bevel-in">
              <div className="grid grid-cols-12 gap-2 px-2 py-1 opacity-50">
                <div className="col-span-5 font-label text-[10px] tracking-widest uppercase">Track / Artist</div>
                <div className="col-span-2 text-center font-label text-[10px] tracking-widest uppercase">BPM</div>
                <div className="col-span-1 text-center font-label text-[10px] tracking-widest uppercase">Key</div>
                <div className="col-span-2 text-center font-label text-[10px] tracking-widest uppercase">Energy</div>
                <div className="col-span-2 text-right font-label text-[10px] tracking-widest uppercase">Load</div>
              </div>
              {files.map((f, i) => {
                const t = tags[f.fileKey];
                const a = analyses[f.fileKey];
                const status = analysisStatus[f.fileKey];
                if (status === 'analyzing') {
                  return (
                    <div key={f.fileKey} className="grid grid-cols-12 items-center gap-2 bg-cream/30 px-2 py-1.5 shimmer">
                      <div className="col-span-6 font-label text-[11px] italic opacity-40">
                        {t?.title ?? f.name} - <span className="opacity-70">ANALYZING...</span>
                      </div>
                      <div className="col-span-6 text-center font-label text-[10px] tracking-widest uppercase opacity-40">
                        PROCESSING SIGNAL CHAIN...
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={f.fileKey}
                    className={`grid grid-cols-12 items-center gap-2 px-2 py-1.5 ${i % 2 === 0 ? 'bg-cream/60 hover:bg-cream' : 'bg-cream/30 hover:bg-cream'}`}
                    data-testid="sunset-track-row"
                  >
                    <div className="col-span-5 min-w-0 truncate" title={f.path}>
                      <span className="font-label text-[11px] font-bold text-onyx">{t?.title ?? f.name}</span>
                      <span className="font-label text-[10px] opacity-60"> - {t?.artist ?? '…'}</span>
                    </div>
                    <div className="col-span-2 flex justify-center">
                      <div className="lcd-display min-w-[42px] px-1.5 py-0 text-center">
                        <span className="font-label text-[11px] font-bold">{a?.bpm ? a.bpm.toFixed(1) : statusGlyph(status)}</span>
                      </div>
                    </div>
                    <div className="col-span-1 text-center">
                      {a?.camelot ? <KeyBadge camelot={a.camelot} tint="lavender" /> : <span className="font-label text-[10px] opacity-30">—</span>}
                    </div>
                    <div className="col-span-2 text-center">{a ? <EnergyMeter energy={a.energy} /> : null}</div>
                    <div className="col-span-2 flex justify-end gap-1">
                      <button
                        className="cursor-pointer border-0 bg-cream px-2 py-0.5 font-label text-[10px] font-bold text-onyx retro-bevel-out hover:bg-peach"
                        onClick={() => void loadToDeck(f, 'A')}
                      >
                        A
                      </button>
                      <button
                        className="cursor-pointer border-0 bg-cream px-2 py-0.5 font-label text-[10px] font-bold text-onyx retro-bevel-out hover:bg-peach"
                        onClick={() => void loadToDeck(f, 'B')}
                      >
                        B
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Window>
      </div>
    </div>
  );
}

function statusGlyph(status?: string): string {
  if (status === 'error') return '✕';
  if (status === 'pending') return '·';
  return '—';
}

async function readAllTags(
  files: LibraryFile[],
  mergeTags: (t: Record<string, TrackTags>) => void,
): Promise<Record<string, TrackTags>> {
  const all: Record<string, TrackTags> = {};
  const BATCH = 8;
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const entries = await Promise.all(
      batch.map(async (f) => [f.fileKey, await readTags(await f.handle.getFile())] as const),
    );
    for (const [k, v] of entries) all[k] = v;
    mergeTags(Object.fromEntries(entries));
  }
  return all;
}
