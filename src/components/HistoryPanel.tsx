import { useEffect, useState } from 'react';
import { useAppStore } from '../state/store';
import { formatCamelot } from '../lib/analysis/camelot';
import type { PlayHistoryEntry } from '../lib/library/db';

const MAX_ROWS = 50;

/**
 * Persisted transition log: which mixes ran, how they were blended, and a
 * one-tap star + note so the pairings that landed are findable later.
 */
export function HistoryPanel() {
  const { history, loadHistory, toggleStar, setNote } = useAppStore();

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <div className="panel flex flex-col gap-2" data-testid="history-panel">
      <h2 className="text-sm font-bold tracking-wide text-zinc-400 uppercase">History</h2>
      {history.length === 0 ? (
        <p className="text-sm text-zinc-500">Transitions will appear here once a mix runs.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          {history.slice(0, MAX_ROWS).map((h) => (
            <HistoryRow key={h.id} entry={h} onStar={toggleStar} onNote={setNote} />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryRow({
  entry,
  onStar,
  onNote,
}: {
  entry: PlayHistoryEntry;
  onStar: (id: number) => void;
  onNote: (id: number, note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.note);

  function saveNote() {
    setEditing(false);
    if (draft !== entry.note && entry.id !== undefined) onNote(entry.id, draft);
  }

  return (
    <div className="border-t border-zinc-800 py-1.5 text-sm hover:bg-zinc-800/50" data-testid="history-row">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-zinc-500">{timeOf(entry.at)}</span>
        <span className="min-w-0 flex-1 truncate" title={`${entry.from.title} → ${entry.to.title}`}>
          {entry.from.title} <span className="text-zinc-500">→</span> {entry.to.title}
        </span>
        <button
          className="btn-ghost px-1.5 py-0.5 text-xs"
          onClick={() => {
            setDraft(entry.note);
            setEditing(true);
          }}
          title="Add note"
        >
          ✎
        </button>
        <button
          className={`px-1 text-base leading-none ${entry.starred ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-400'}`}
          onClick={() => entry.id !== undefined && onStar(entry.id)}
          title={entry.starred ? 'Unstar' : 'Star this mix'}
          data-testid="history-star"
        >
          {entry.starred ? '★' : '☆'}
        </button>
      </div>
      <div className="flex items-center gap-2 pl-12 font-mono text-xs text-zinc-500">
        <span>
          {formatCamelot(entry.from.camelot)}→{formatCamelot(entry.to.camelot)}
        </span>
        <span>
          {fmtBpm(entry.from.bpm)}→{fmtBpm(entry.to.bpm)}
        </span>
        <span className={entry.fallback ? 'text-zinc-400' : 'text-emerald-500'}>{blendLabel(entry)}</span>
        <span className="rounded bg-zinc-800 px-1 text-[10px] tracking-wide uppercase">{entry.source}</span>
      </div>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={saveNote}
          onKeyDown={(e) => e.key === 'Enter' && saveNote()}
          placeholder="What made this mix land (or not)?"
          className="mt-1 ml-12 w-2/3 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-xs text-zinc-100"
          data-testid="history-note-input"
        />
      ) : (
        entry.note && <p className="pl-12 text-xs text-zinc-400 italic">{entry.note}</p>
      )}
    </div>
  );
}

function timeOf(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtBpm(bpm: number | null): string {
  return bpm ? bpm.toFixed(0) : '?';
}

function blendLabel(entry: PlayHistoryEntry): string {
  if (entry.fallback) return `crossfade ${entry.durationSec.toFixed(0)}s`;
  const bpm = entry.from.bpm;
  if (!bpm) return `blend ${entry.durationSec.toFixed(0)}s`;
  const bars = Math.round(entry.durationSec / (4 * (60 / bpm)));
  return `${bars} bars`;
}
