import { useState } from 'react';
import { useAppStore } from '../state/store';
import { scheduleTransition, type TransitionPlan } from '../lib/engine/transition-scheduler';

/**
 * Phase 3 demo controls: pick blend length, force a phrase-aligned mix
 * between the two decks. Requires both decks loaded with analyzed tracks.
 */
export function MixControls() {
  const { engine, analyses, recordTransition } = useAppStore();
  const [bars, setBars] = useState(16);
  const [status, setStatus] = useState<string | null>(null);

  function mix(fromId: 'A' | 'B') {
    if (!engine) return;
    const from = engine.deck(fromId);
    const to = engine.deck(fromId === 'A' ? 'B' : 'A');
    const fromAnalysis = from.loaded ? analyses[from.loaded.fileKey] : undefined;
    const toAnalysis = to.loaded ? analyses[to.loaded.fileKey] : undefined;
    if (!fromAnalysis || !toAnalysis) {
      setStatus('Both decks need loaded, analyzed tracks.');
      return;
    }
    if (!from.isPlaying) {
      setStatus(`Deck ${fromId} is not playing.`);
      return;
    }
    try {
      const plan: TransitionPlan = scheduleTransition({
        from,
        to,
        fromAnalysis,
        toAnalysis,
        bars,
        forceNow: true,
      });
      recordTransition(fromAnalysis, toAnalysis, plan, bars, 'manual');
      const inSec = (plan.t0 - engine.ctx.currentTime).toFixed(1);
      setStatus(
        plan.fallback
          ? `Fallback crossfade in ${inSec}s (no usable grid).`
          : `Mixing in ${inSec}s: ${bars} bars at rate ${plan.rate.toFixed(4)}.`,
      );
    } catch (e) {
      setStatus(String(e));
    }
  }

  return (
    <div className="panel flex flex-col gap-2">
      <h2 className="text-sm font-bold tracking-wide text-zinc-400 uppercase">Mix</h2>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-zinc-400">
          Blend
          <select
            value={bars}
            onChange={(e) => setBars(Number(e.target.value))}
            className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 font-mono text-sm text-zinc-100"
            data-testid="mix-bars"
          >
            <option value={8}>8 bars</option>
            <option value={16}>16 bars</option>
            <option value={32}>32 bars</option>
          </select>
        </label>
        <button className="btn" onClick={() => mix('A')} data-testid="mix-a-to-b">Mix A → B</button>
        <button className="btn" onClick={() => mix('B')} data-testid="mix-b-to-a">Mix B → A</button>
        {status && (
          <span className="font-mono text-xs text-zinc-400" data-testid="mix-status">{status}</span>
        )}
      </div>
    </div>
  );
}
