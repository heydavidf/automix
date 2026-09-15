import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../state/store';
import type { Band } from '../lib/engine/eq';

interface Props {
  deckId: 'A' | 'B';
}

/**
 * Live mirror of the deck: position, rate, volume, and EQ are polled from
 * the audio graph so transition automation is visible on the sliders.
 * Only the slider currently being dragged is exempt from polling — tracked
 * via pointerdown + window pointerup, so a release outside the element
 * can't freeze the panel.
 */
export function DeckPanel({ deckId }: Props) {
  const engine = useAppStore((s) => s.engine);
  const [display, setDisplay] = useState<{ title: string; artist: string } | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [eqGains, setEqGains] = useState<Record<Band, number>>({ low: 0, mid: 0, high: 0 });
  const dragging = useRef<string | null>(null);

  const deck = engine?.deck(deckId) ?? null;

  useEffect(() => {
    const clear = () => {
      dragging.current = null;
    };
    window.addEventListener('pointerup', clear);
    window.addEventListener('pointercancel', clear);
    return () => {
      window.removeEventListener('pointerup', clear);
      window.removeEventListener('pointercancel', clear);
    };
  }, []);

  useEffect(() => {
    if (!deck) return;
    const id = setInterval(() => {
      setPosition(deck.expectedTrackTime ?? 0);
      setDuration(deck.durationSec);
      setPlaying(deck.isPlaying);
      setDisplay((prev) => {
        const l = deck.loaded;
        if (!l) return prev === null ? prev : null;
        return prev?.title === l.title && prev?.artist === l.artist ? prev : { title: l.title, artist: l.artist };
      });
      const drag = dragging.current;
      const ctx = deck.stretch.context as AudioContext;
      if (drag !== 'rate') {
        const liveRate = deck.timeline.rateAt(ctx.currentTime);
        if (liveRate > 0) setRate(liveRate);
      }
      if (drag !== 'vol') setVolume(deck.gain.gain.value);
      setEqGains((prev) => ({
        low: drag === 'low' ? prev.low : deck.eq.getGain('low'),
        mid: drag === 'mid' ? prev.mid : deck.eq.getGain('mid'),
        high: drag === 'high' ? prev.high : deck.eq.getGain('high'),
      }));
    }, 150);
    return () => clearInterval(id);
  }, [deck]);

  function togglePlay() {
    if (!deck || !deck.loaded) return;
    if (deck.isPlaying) {
      deck.pause();
    } else {
      const from = deck.expectedTrackTime ?? 0;
      deck.playAt({ trackTime: from >= deck.durationSec ? 0 : from, rate });
    }
  }

  function onRate(v: number) {
    setRate(v);
    deck?.setRate(v);
  }

  function onVolume(v: number) {
    setVolume(v);
    deck?.setVolume(v);
  }

  function onEq(band: Band, dB: number) {
    setEqGains((g) => ({ ...g, [band]: dB }));
    deck?.eq.setGain(band, dB);
  }

  const grab = (key: string) => () => {
    dragging.current = key;
  };

  return (
    <div className="panel flex flex-col gap-2" data-testid={`deck-${deckId}`}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold tracking-wide text-zinc-400 uppercase">Deck {deckId}</h2>
        <span className="font-mono text-xs text-zinc-500" data-testid={`deck-${deckId}-pos`}>
          {fmt(position)} / {fmt(duration)}
        </span>
      </div>
      <div className="truncate text-sm">
        {display ? (
          <>
            <span className="font-semibold">{display.title}</span>
            <span className="text-zinc-400"> — {display.artist}</span>
          </>
        ) : (
          <span className="text-zinc-600">Nothing loaded</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button className="btn w-20" disabled={!display} onClick={togglePlay} data-testid={`deck-${deckId}-play`}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <Slider label={`Rate ${((rate - 1) * 100).toFixed(1)}%`} min={0.9} max={1.1} step={0.001}
          value={clamp(rate, 0.9, 1.1)} onChange={onRate} onGrab={grab('rate')} testid={`deck-${deckId}-rate`} />
      </div>
      <div className="flex items-center gap-3">
        <Slider label={`Vol ${(volume * 100).toFixed(0)}%`} min={0} max={1} step={0.01}
          value={clamp(volume, 0, 1)} onChange={onVolume} onGrab={grab('vol')} testid={`deck-${deckId}-vol`} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(['low', 'mid', 'high'] as Band[]).map((band) => (
          <Slider
            key={band}
            label={`${band} ${eqGains[band].toFixed(0)}dB`}
            min={-26}
            max={6}
            step={1}
            value={clamp(eqGains[band], -26, 6)}
            onChange={(v) => onEq(band, v)}
            onGrab={grab(band)}
            testid={`deck-${deckId}-eq-${band}`}
          />
        ))}
      </div>
    </div>
  );
}

function Slider({ label, min, max, step, value, onChange, onGrab, testid }: {
  label: string; min: number; max: number; step: number; value: number;
  onChange: (v: number) => void; onGrab: () => void; testid?: string;
}) {
  return (
    <label className="flex flex-1 flex-col gap-0.5 text-xs text-zinc-400">
      <span className="font-mono">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        data-testid={testid}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={onGrab}
        className="accent-blue-600"
      />
    </label>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
