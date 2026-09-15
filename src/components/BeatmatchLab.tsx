import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../state/store';
import { makeTestLoop } from '../lib/engine/testtones';

/**
 * Phase 1 risk burn-down: prove two stretch decks can play beat-locked for
 * minutes. BPM/offset are hand-entered (or filled by the test-loop generator);
 * the analysis pipeline replaces them in Phase 2.
 */
export function BeatmatchLab() {
  const { engine, ensureEngine, setDeckDisplay } = useAppStore();
  const [bpmA, setBpmA] = useState(124);
  const [bpmB, setBpmB] = useState(132);
  const [offsetA, setOffsetA] = useState(0);
  const [offsetB, setOffsetB] = useState(0);
  const [running, setRunning] = useState(false);
  const [readout, setReadout] = useState({ devA: 0, devB: 0, phaseMs: 0 });
  const ema = useRef({ devA: 0, devB: 0, phaseMs: 0 });

  async function generateLoops() {
    const eng = await ensureEngine();
    const loopA = makeTestLoop(eng.ctx, { bpm: 124, bars: 64, toneHz: 110 });
    const loopB = makeTestLoop(eng.ctx, { bpm: 132, bars: 64, toneHz: 165 });
    await eng.deckA.load(loopA, { fileKey: 'test-124', title: 'Test loop 124 BPM', artist: 'AutoMix' });
    await eng.deckB.load(loopB, { fileKey: 'test-132', title: 'Test loop 132 BPM', artist: 'AutoMix' });
    setDeckDisplay('A', { title: 'Test loop 124 BPM', artist: 'AutoMix' });
    setDeckDisplay('B', { title: 'Test loop 132 BPM', artist: 'AutoMix' });
    setBpmA(124);
    setBpmB(132);
    setOffsetA(0);
    setOffsetB(0);
  }

  async function startMatched() {
    const eng = await ensureEngine();
    if (!eng.deckA.loaded || !eng.deckB.loaded) return;
    const rate = bpmA / bpmB;
    const t0 = eng.ctx.currentTime + Math.max(eng.deckA.scheduleAhead, 0.35);
    eng.deckA.playAt({ ctxTime: t0, trackTime: offsetA, rate: 1 });
    eng.deckB.playAt({ ctxTime: t0, trackTime: offsetB, rate });
    setRunning(true);
  }

  function stop() {
    engine?.deckA.pause();
    engine?.deckB.pause();
    setRunning(false);
  }

  useEffect(() => {
    if (!running || !engine) return;
    const beatOutSec = 60 / bpmA;
    const id = setInterval(() => {
      const { deckA, deckB } = engine;
      const devA = ((deckA.reportedTrackTime - (deckA.expectedTrackTime ?? 0)) * 1000);
      const devB = ((deckB.reportedTrackTime - (deckB.expectedTrackTime ?? 0)) * 1000);
      const beatsA = (deckA.reportedTrackTime - offsetA) / (60 / bpmA);
      const beatsB = (deckB.reportedTrackTime - offsetB) / (60 / bpmB);
      let diff = (beatsA - beatsB) % 1;
      if (diff > 0.5) diff -= 1;
      if (diff < -0.5) diff += 1;
      const phaseMs = diff * beatOutSec * 1000;
      const a = 0.3;
      ema.current = {
        devA: ema.current.devA + a * (devA - ema.current.devA),
        devB: ema.current.devB + a * (devB - ema.current.devB),
        phaseMs: ema.current.phaseMs + a * (phaseMs - ema.current.phaseMs),
      };
      setReadout({ ...ema.current });
    }, 250);
    return () => clearInterval(id);
  }, [running, engine, bpmA, bpmB, offsetA, offsetB]);

  return (
    <div className="panel flex flex-col gap-3">
      <h2 className="text-sm font-bold tracking-wide text-zinc-400 uppercase">Beatmatch lab</h2>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        <Num label="BPM A" value={bpmA} onChange={setBpmA} />
        <Num label="First beat A (s)" value={offsetA} onChange={setOffsetA} step={0.001} />
        <Num label="BPM B" value={bpmB} onChange={setBpmB} />
        <Num label="First beat B (s)" value={offsetB} onChange={setOffsetB} step={0.001} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-ghost" onClick={generateLoops} data-testid="gen-loops">
          Generate test loops (124 / 132)
        </button>
        <button className="btn" onClick={startMatched} data-testid="start-matched">
          Start beatmatched
        </button>
        <button className="btn-ghost" onClick={stop}>Stop</button>
        <span className="ml-auto font-mono text-xs text-zinc-400" data-testid="drift-readout">
          devA {readout.devA.toFixed(1)}ms · devB {readout.devB.toFixed(1)}ms · phase {readout.phaseMs.toFixed(1)}ms
        </span>
      </div>
      <p className="text-xs text-zinc-600">
        Deck B is stretched to Deck A's tempo (rate {(bpmA / bpmB).toFixed(4)}). Phase = beat-phase offset
        between decks from worklet-reported positions; dev = reported vs scheduled position per deck.
      </p>
    </div>
  );
}

function Num({ label, value, onChange, step = 0.1 }: {
  label: string; value: number; onChange: (v: number) => void; step?: number;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-xs text-zinc-400">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-sm text-zinc-100"
      />
    </label>
  );
}
