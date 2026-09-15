import { useEffect, useState } from 'react';
import { useAppStore } from '../state/store';
import { pickLibraryFolder, restoreLibraryFolder, hasSavedLibrary, isFsAccessSupported } from '../lib/library/fs-access';
import { scanFolder, type LibraryFile } from '../lib/library/scanner';
import { readTags } from '../lib/library/metadata';
import { getAnalyzer } from '../lib/analysis/analyzer';
import { formatCamelot } from '../lib/analysis/camelot';
import type { TrackTags } from '../lib/analysis/types';

interface Props {
  onLoadToDeck: (file: LibraryFile, deck: 'A' | 'B') => void;
}

export function LibraryPanel({ onLoadToDeck }: Props) {
  const { libraryStatus, files, tags, analyses, analysisStatus, setLibraryStatus, setFiles, mergeTags, setAnalysisStatus } =
    useAppStore();
  const [canResume, setCanResume] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hasSavedLibrary().then(setCanResume);
  }, []);

  async function openFolder(restore: boolean) {
    setError(null);
    try {
      const dir = restore ? await restoreLibraryFolder() : await pickLibraryFolder();
      if (!dir) {
        setError('Could not restore the saved folder — permission denied.');
        return;
      }
      setLibraryStatus('scanning');
      const found = await scanFolder(dir, setScanCount);
      setFiles(found);
      setLibraryStatus('ready');
      // tags first (fast), then the slow analysis queue with tags available
      const allTags = await readAllTags(found, mergeTags);
      const analyzer = getAnalyzer({
        onStatus: (fileKey, status, analysis) => setAnalysisStatus(fileKey, status, analysis),
      });
      void analyzer.enqueue(found, (fileKey) => allTags[fileKey]);
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') setError(String(e));
      setLibraryStatus(files.length ? 'ready' : 'empty');
    }
  }

  if (!isFsAccessSupported()) {
    return <div className="panel text-red-400">This browser lacks the File System Access API — use Chrome.</div>;
  }

  const doneCount = files.filter((f) => analysisStatus[f.fileKey] === 'done').length;
  const analyzing = files.some((f) => analysisStatus[f.fileKey] === 'analyzing' || analysisStatus[f.fileKey] === 'pending');

  return (
    <div className="panel flex min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="mr-auto text-sm font-bold tracking-wide text-zinc-400 uppercase">Library</h2>
        <button className="btn" onClick={() => openFolder(false)}>Choose folder</button>
        {canResume && (
          <button className="btn-ghost" onClick={() => openFolder(true)} data-testid="resume-library">Resume library</button>
        )}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {libraryStatus === 'scanning' && <p className="text-sm text-zinc-400">Scanning… {scanCount} files found</p>}
      {libraryStatus === 'empty' && !error && (
        <p className="text-sm text-zinc-500">Point AutoMix at a folder of music to get started.</p>
      )}
      {libraryStatus === 'ready' && (
        <>
          {analyzing && (
            <p className="text-xs text-amber-400" data-testid="analysis-progress">
              Analyzing… {doneCount}/{files.length}
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-zinc-900 text-xs text-zinc-500">
                <tr>
                  <th className="py-1 pr-2 font-medium">Track</th>
                  <th className="py-1 pr-2 font-medium">Artist</th>
                  <th className="py-1 pr-2 text-right font-medium">BPM</th>
                  <th className="py-1 pr-2 font-medium">Key</th>
                  <th className="py-1 pr-2 font-medium">Energy</th>
                  <th className="py-1 font-medium">Load</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => {
                  const t = tags[f.fileKey];
                  const a = analyses[f.fileKey];
                  const status = analysisStatus[f.fileKey];
                  return (
                    <tr key={f.fileKey} className="border-t border-zinc-800 hover:bg-zinc-800/50">
                      <td className="max-w-56 truncate py-1.5 pr-2" title={f.path}>{t?.title ?? f.name}</td>
                      <td className="max-w-32 truncate py-1.5 pr-2 text-zinc-400">{t?.artist ?? '…'}</td>
                      <td className="py-1.5 pr-2 text-right font-mono text-xs">
                        {a?.bpm ? a.bpm.toFixed(1) : statusGlyph(status)}
                      </td>
                      <td className="py-1.5 pr-2">
                        {a?.camelot ? <CamelotBadge num={a.camelot.num} letter={a.camelot.letter} /> : ''}
                      </td>
                      <td className="py-1.5 pr-2">
                        {a ? <EnergyBar value={a.energy} /> : ''}
                      </td>
                      <td className="py-1.5 whitespace-nowrap">
                        <button className="btn-ghost mr-1 px-2 py-0.5 text-xs" onClick={() => onLoadToDeck(f, 'A')}>A</button>
                        <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => onLoadToDeck(f, 'B')}>B</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="pt-2 text-xs text-zinc-500">{files.length} tracks · {doneCount} analyzed</p>
          </div>
        </>
      )}
    </div>
  );
}

function statusGlyph(status?: string): string {
  if (status === 'analyzing') return '…';
  if (status === 'error') return '✕';
  if (status === 'pending') return '·';
  return '';
}

function CamelotBadge({ num, letter }: { num: number; letter: 'A' | 'B' }) {
  const hue = ((num - 1) * 30) % 360;
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 font-mono text-xs font-bold"
      style={{ backgroundColor: `hsl(${hue} 60% 22%)`, color: `hsl(${hue} 80% 75%)` }}
    >
      {formatCamelot({ num, letter })}
    </span>
  );
}

function EnergyBar({ value }: { value: number }) {
  return (
    <span className="inline-block h-1.5 w-12 rounded bg-zinc-800 align-middle">
      <span
        className="block h-full rounded bg-emerald-500"
        style={{ width: `${Math.round(Math.min(1, value) * 100)}%` }}
      />
    </span>
  );
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
