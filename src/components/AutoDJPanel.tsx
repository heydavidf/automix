import { useEffect, useState } from 'react';
import { useAppStore } from '../state/store';
import { formatCamelot } from '../lib/analysis/camelot';
import type { EnergyDirection } from '../lib/engine/selector';
import type { TrackAnalysis } from '../lib/analysis/types';

/** Main control surface: start/stop the auto-mix, see and steer what's next. */
export function AutoDJPanel() {
  const { analyses, analysisStatus, autodj, autodjSnap, ensureAutoDJ } = useAppStore();
  const [bars, setBars] = useState(16);
  const [energy, setEnergy] = useState<EnergyDirection>(0);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const analyzedCount = Object.values(analysisStatus).filter((s) => s === 'done').length;
  const running = autodjSnap !== null && autodjSnap.state !== 'idle';
  const current = autodjSnap?.currentKey ? analyses[autodjSnap.currentKey] : null;
  const next = autodjSnap?.nextKey ? analyses[autodjSnap.nextKey] : null;

  useEffect(() => {
    if (!autodj || !autodjSnap?.transitionAt) {
      setCountdown(null);
      return;
    }
    const engine = useAppStore.getState().engine;
    if (!engine) return;
    const id = setInterval(() => {
      setCountdown(Math.max(0, autodjSnap.transitionAt! - engine.ctx.currentTime));
    }, 250);
    return () => clearInterval(id);
  }, [autodj, autodjSnap?.transitionAt]);

  async function start() {
    setError(null);
    try {
      const dj = await ensureAutoDJ();
      dj.transitionBars = bars;
      dj.energyDirection = energy;
      await dj.start();
    } catch (e) {
      setError(String(e));
    }
  }

  function applySettings(newBars: number, newEnergy: EnergyDirection) {
    setBars(newBars);
    setEnergy(newEnergy);
    if (autodj) {
      autodj.transitionBars = newBars;
      autodj.energyDirection = newEnergy;
    }
  }

  return (
    <div className="panel flex flex-col gap-3" data-testid="autodj">
      <div className="flex items-center gap-2">
        <h2 className="mr-auto text-sm font-bold tracking-wide text-zinc-400 uppercase">Auto-mix</h2>
        <label className="flex items-center gap-1 text-xs text-zinc-400">
          Blend
          <select
            value={bars}
            onChange={(e) => applySettings(Number(e.target.value), energy)}
            className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 font-mono text-sm text-zinc-100"
          >
            <option value={8}>8 bars</option>
            <option value={16}>16 bars</option>
            <option value={32}>32 bars</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-zinc-400">
          Energy
          <select
            value={energy}
            onChange={(e) => applySettings(bars, Number(e.target.value) as EnergyDirection)}
            className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 font-mono text-sm text-zinc-100"
          >
            <option value={1}>Up</option>
            <option value={0}>Hold</option>
            <option value={-1}>Down</option>
          </select>
        </label>
        {!running ? (
          <button className="btn" onClick={start} disabled={analyzedCount < 2} data-testid="autodj-start">
            ▶ Start
          </button>
        ) : (
          <button className="btn-ghost" onClick={() => autodj?.stop()} data-testid="autodj-stop">
            ■ Stop
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {!running && analyzedCount < 2 && (
        <p className="text-xs text-zinc-500">Needs at least 2 analyzed tracks.</p>
      )}

      {running && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <TrackCard label={`Now playing · Deck ${autodjSnap.activeDeck}`} a={current} />
          <div className="flex flex-col gap-1">
            <TrackCard
              label={autodjSnap.state === 'scheduled' ? `Mixing in ${countdown?.toFixed(0) ?? '…'}s` : 'Next up'}
              a={next}
              dim={!autodjSnap.nextLoaded}
            />
            {autodjSnap.state === 'playing' && (
              <div className="flex gap-1">
                <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => autodj?.skipNext()} data-testid="autodj-skip">
                  Skip pick
                </button>
                <button
                  className="btn-ghost px-2 py-0.5 text-xs"
                  onClick={() => void autodj?.forceTransition()}
                  disabled={!autodjSnap.nextKey}
                  data-testid="autodj-force"
                >
                  Mix now
                </button>
                {autodjSnap.candidates.length > 1 && (
                  <select
                    className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-xs text-zinc-300"
                    value={autodjSnap.nextKey ?? ''}
                    onChange={(e) => autodj?.overrideNext(e.target.value)}
                    data-testid="autodj-override"
                  >
                    {autodjSnap.candidates.map((c) => (
                      <option key={c.analysis.fileKey} value={c.analysis.fileKey}>
                        {c.analysis.tags.title} · {formatCamelot(c.analysis.camelot)} · {c.analysis.bpm?.toFixed(0)} · {c.score.toFixed(1)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TrackCard({ label, a, dim }: { label: string; a: TrackAnalysis | null; dim?: boolean }) {
  return (
    <div className={`rounded-lg border border-zinc-800 bg-zinc-900/60 p-2 ${dim ? 'opacity-60' : ''}`}>
      <p className="text-[10px] font-bold tracking-wide text-zinc-500 uppercase">{label}</p>
      {a ? (
        <p className="truncate text-sm">
          <span className="font-semibold">{a.tags.title}</span>
          <span className="text-zinc-400"> — {a.tags.artist}</span>
        </p>
      ) : (
        <p className="text-sm text-zinc-600">—</p>
      )}
      {a && (
        <p className="font-mono text-xs text-zinc-400">
          {a.bpm?.toFixed(1)} BPM · {formatCamelot(a.camelot)} · energy {(a.energy * 100).toFixed(0)}%
        </p>
      )}
    </div>
  );
}
