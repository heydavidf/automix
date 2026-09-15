import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../state/store';
import type { EnergyDirection } from '../../lib/engine/selector';
import type { TrackAnalysis } from '../../lib/analysis/types';
import type { Band } from '../../lib/engine/eq';
import type { Deck } from '../../lib/engine/deck';
import type { PlayHistoryEntry } from '../../lib/library/db';
import { Window, KeyBadge, Lcd, EnergyMeter } from '../chrome';
import { formatCamelot } from '../../lib/analysis/camelot';

export function Mix() {
  return (
    <div className="flex min-h-[calc(100vh-2rem)] flex-wrap items-start justify-center gap-6 p-8">
      <div className="flex w-[640px] max-w-full flex-col shadow-2xl">
        <QueueWindow />
        <MixerDesk />
      </div>
      <div className="flex w-72 flex-col shadow-2xl">
        <MachineParams />
        <HistoryWindow />
      </div>
    </div>
  );
}

/** Two channel strips mirroring the audio graph live: the sliders move on
    their own as blend automation drives gain and EQ (same polling pattern
    as the debug UI's DeckPanel; only a grabbed slider is exempt). */
function MixerDesk() {
  return (
    <Window title="MIXER_DESK.BIN" variant="secondary" icon="instant_mix" docked>
      <div className="grid grid-cols-2 gap-2 p-3">
        <ChannelStrip deckId="A" />
        <ChannelStrip deckId="B" />
      </div>
    </Window>
  );
}

const EQ_BANDS: Band[] = ['low', 'mid', 'high'];
const EQ_MIN = -26;
const EQ_MAX = 6;

function ChannelStrip({ deckId }: { deckId: 'A' | 'B' }) {
  const engine = useAppStore((s) => s.engine);
  const deck = engine?.deck(deckId) ?? null;
  const dragging = useRef<string | null>(null);
  const [live, setLive] = useState({ title: null as string | null, playing: false, volume: 1, low: 0, mid: 0, high: 0 });

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
      const drag = dragging.current;
      setLive((prev) => ({
        title: deck.loaded?.title ?? null,
        playing: deck.isPlaying,
        volume: drag === 'vol' ? prev.volume : deck.gain.gain.value,
        low: drag === 'low' ? prev.low : deck.eq.getGain('low'),
        mid: drag === 'mid' ? prev.mid : deck.eq.getGain('mid'),
        high: drag === 'high' ? prev.high : deck.eq.getGain('high'),
      }));
    }, 100);
    return () => clearInterval(id);
  }, [deck]);

  const loaded = live.title !== null;

  return (
    <div className={`flex flex-col gap-1.5 bg-white/30 p-2 retro-bevel-in ${loaded ? '' : 'opacity-50'}`} data-testid={`sunset-strip-${deckId}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-label text-[10px] font-bold tracking-widest uppercase">
          DECK {deckId}
          <span className={`ml-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${live.playing ? 'bg-magenta pulse-dot' : 'bg-onyx/20'}`}></span>
        </span>
        <span className="min-w-0 flex-1 truncate text-right font-label text-[9px] uppercase opacity-50">{live.title ?? 'EMPTY'}</span>
      </div>
      <StripSlider
        label="VOL"
        min={0}
        max={1}
        step={0.01}
        value={live.volume}
        display={`${Math.round(live.volume * 100)}`}
        onGrab={() => (dragging.current = 'vol')}
        onChange={(v) => {
          setLive((p) => ({ ...p, volume: v }));
          deck?.setVolume(v);
        }}
        testid={`sunset-strip-${deckId}-vol`}
      />
      {EQ_BANDS.map((band) => (
        <StripSlider
          key={band}
          label={band.toUpperCase()}
          min={EQ_MIN}
          max={EQ_MAX}
          step={0.5}
          value={live[band]}
          display={`${live[band] > 0 ? '+' : ''}${live[band].toFixed(0)}`}
          onGrab={() => (dragging.current = band)}
          onChange={(v) => {
            setLive((p) => ({ ...p, [band]: v }));
            deck?.eq.setGain(band, v);
          }}
          testid={`sunset-strip-${deckId}-${band}`}
        />
      ))}
    </div>
  );
}

function StripSlider({ label, min, max, step, value, display, onChange, onGrab, testid }: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (v: number) => void;
  onGrab: () => void;
  testid: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 font-label text-[9px] tracking-widest uppercase opacity-60">{label}</span>
      <input
        type="range"
        className="sunset-slider min-w-0 flex-1"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onPointerDown={onGrab}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid={testid}
      />
      <span className="w-7 text-right font-label text-[9px] font-bold">{display}</span>
    </div>
  );
}

function QueueWindow() {
  const { engine, analyses, autodj, autodjSnap } = useAppStore();
  const [position, setPosition] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);

  const running = autodjSnap !== null && autodjSnap.state !== 'idle';
  const current = autodjSnap?.currentKey ? (analyses[autodjSnap.currentKey] ?? null) : null;
  const next = autodjSnap?.nextKey ? (analyses[autodjSnap.nextKey] ?? null) : null;
  const rest = (autodjSnap?.candidates ?? []).filter((c) => c.analysis.fileKey !== autodjSnap?.nextKey);

  useEffect(() => {
    const id = setInterval(() => {
      const { engine, autodjSnap: snap } = useAppStore.getState();
      if (!engine || !snap || snap.state === 'idle') return;
      setPosition(engine.deck(snap.activeDeck).expectedTrackTime ?? 0);
      setCountdown(snap.transitionAt !== null ? Math.max(0, snap.transitionAt - engine.ctx.currentTime) : null);
    }, 250);
    return () => clearInterval(id);
  }, []);

  return (
    <Window
      title="MIX.EXE"
      variant="active"
      icon="queue_music"
      statusLeft={running ? 'SYSTEM STATUS: NOMINAL · ←/→ SCRUB 10S' : 'SYSTEM STATUS: IDLE'}
      statusRight={
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${running ? 'bg-magenta pulse-dot' : 'bg-onyx/20'}`}></span>
          <span className="font-label text-[10px] tracking-widest uppercase">{running ? 'AUTO-DJ ON' : 'AUTO-DJ OFF'}</span>
          {countdown !== null && (
            <div className="lcd-display px-2 py-0.5">
              <span className="lcd-live font-label text-[10px] font-bold uppercase" data-testid="sunset-next-mix">
                NEXT MIX IN {countdown.toFixed(0)}S
              </span>
            </div>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3 p-3">
        {!running && (
          <div className="bg-white/30 p-4 text-center retro-bevel-in">
            <span className="font-label text-[11px] tracking-widest uppercase opacity-60">
              AUTO-DJ STANDING BY — PRESS START IN MACHINE_PARAMS.EXE
            </span>
          </div>
        )}

        {running && (
          <>
            {/* Now playing strip */}
            <div className="flex items-center gap-3 bg-white/30 p-2 retro-bevel-in" data-testid="sunset-now-playing">
              <div className="min-w-0 flex-1">
                <span className="block font-label text-[10px] tracking-widest uppercase opacity-50">Now Playing · Deck {autodjSnap.activeDeck}</span>
                <span className="font-headline text-base font-bold tracking-tight uppercase italic">{current?.tags.title ?? '—'}</span>
                <span className="block font-label text-[10px] opacity-60">{current?.tags.artist ?? ''}</span>
              </div>
              <VuMeter deck={engine?.deck(autodjSnap.activeDeck) ?? null} />
              <Lcd label="TIMER" value={fmt(position)} live />
              {current?.camelot && <KeyBadge camelot={current.camelot} tint="magenta" />}
            </div>

            {/* Next pick */}
            <div className="flex gap-3 bg-white/30 p-3 retro-bevel-in" data-testid="sunset-next-pick">
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="block font-label text-[10px] font-bold tracking-widest text-magenta uppercase">
                      {autodjSnap.state === 'scheduled' ? 'Locked In' : 'Next Pick'}
                    </span>
                    <span className={`font-headline text-lg font-bold tracking-tight uppercase italic ${autodjSnap.nextLoaded ? '' : 'opacity-50'}`}>
                      {next?.tags.title ?? 'CHOOSING…'}
                    </span>
                    <span className="block font-label text-[10px] opacity-60">{next?.tags.artist ?? ''}</span>
                  </div>
                  {next?.camelot && <KeyBadge camelot={next.camelot} tint="lavender" />}
                </div>
                <div className="lcd-display my-2 px-2 py-1">
                  <span className="font-label text-[10px] tracking-tighter uppercase">{reasoningFor(current, next)}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    className="cursor-pointer border-0 bg-cream px-4 py-1.5 font-label text-[10px] font-bold tracking-widest text-magenta uppercase retro-bevel-out hover:bg-blush disabled:opacity-40"
                    onClick={() => autodj?.skipNext()}
                    disabled={autodjSnap.state !== 'playing' || !autodjSnap.nextKey}
                    data-testid="sunset-skip-pick"
                  >
                    SKIP PICK
                  </button>
                  <button
                    className="flex-1 cursor-pointer border-0 bg-magenta py-1.5 font-headline text-[11px] font-bold tracking-wider text-white italic retro-bevel-out hover:brightness-110 disabled:opacity-40"
                    onClick={() => void autodj?.forceTransition()}
                    disabled={autodjSnap.state !== 'playing' || !autodjSnap.nextKey}
                    data-testid="sunset-mix-now"
                  >
                    MIX NOW
                  </button>
                </div>
              </div>
            </div>

            {/* Continuing queue */}
            <div>
              <span className="mb-1 block px-1 font-label text-[10px] tracking-[0.3em] uppercase opacity-50">Continuing Queue</span>
              <div className="flex flex-col bg-white/30 p-1 retro-bevel-in">
                {rest.length === 0 && (
                  <span className="px-2 py-1.5 font-label text-[10px] tracking-widest uppercase opacity-40">
                    NO FURTHER CANDIDATES — LIBRARY EXHAUSTED OR TOO SMALL
                  </span>
                )}
                {rest.map((c, i) => (
                  <div
                    key={c.analysis.fileKey}
                    className={`flex cursor-pointer items-center gap-3 px-2 py-1.5 ${i % 2 === 0 ? 'bg-cream/60' : 'bg-cream/30'} hover:bg-cream`}
                    onClick={() => autodjSnap.state === 'playing' && autodj?.overrideNext(c.analysis.fileKey)}
                    title="Make this the next pick"
                    data-testid="sunset-queue-row"
                  >
                    <span className="w-5 font-label text-[10px] opacity-40">{String(i + 2).padStart(2, '0')}</span>
                    <div className="min-w-0 flex-1 truncate">
                      <span className="font-label text-[11px] font-bold">{c.analysis.tags.title}</span>
                      <span className="font-label text-[10px] opacity-60"> - {c.analysis.tags.artist}</span>
                    </div>
                    <div className="lcd-display px-1.5 py-0">
                      <span className="font-label text-[10px] font-bold">{c.analysis.bpm?.toFixed(1) ?? '—'}</span>
                    </div>
                    <KeyBadge camelot={c.analysis.camelot} tint={c.harmonic ? 'lavender' : 'peach'} />
                    <EnergyMeter energy={c.analysis.energy} />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Window>
  );
}

function MachineParams() {
  const { analysisStatus, autodj, autodjSnap, ensureAutoDJ } = useAppStore();
  const [bars, setBars] = useState(16);
  const [energy, setEnergy] = useState<EnergyDirection>(0);
  const [error, setError] = useState<string | null>(null);

  const analyzedCount = Object.values(analysisStatus).filter((s) => s === 'done').length;
  const running = autodjSnap !== null && autodjSnap.state !== 'idle';

  async function start() {
    setError(null);
    try {
      const dj = await ensureAutoDJ();
      dj.transitionBars = bars;
      dj.energyDirection = energy;
      await dj.start();
    } catch (e) {
      setError(String(e).toUpperCase().slice(0, 70));
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

  const ENERGY: { label: string; value: EnergyDirection }[] = [
    { label: 'RISE', value: 1 },
    { label: 'HOLD', value: 0 },
    { label: 'COOL', value: -1 },
  ];

  return (
    <Window title="MACHINE_PARAMS.EXE" variant="secondary" icon="tune" statusLeft={running ? 'engine_running' : 'engine_ready'}>
      <div className="flex flex-col gap-4 p-3">
        {!running ? (
          <button
            className="cursor-pointer border-0 bg-magenta py-2 font-headline text-[11px] font-bold tracking-wider text-white italic retro-bevel-out hover:brightness-110 disabled:opacity-40"
            onClick={() => void start()}
            disabled={analyzedCount < 2}
            data-testid="sunset-autodj-start"
          >
            ▶ START AUTO-MIX
          </button>
        ) : (
          <button
            className="cursor-pointer border-0 bg-cream py-2 font-label text-[10px] font-bold tracking-widest text-onyx uppercase retro-bevel-out hover:bg-blush"
            onClick={() => autodj?.stop()}
            data-testid="sunset-autodj-stop"
          >
            ■ STOP
          </button>
        )}
        {analyzedCount < 2 && !running && (
          <span className="font-label text-[9px] tracking-widest uppercase opacity-40">NEEDS 2+ ANALYZED TRACKS</span>
        )}
        {error && (
          <div className="lcd-display px-2 py-1">
            <span className="font-label text-[10px] uppercase">{error}</span>
          </div>
        )}
        <div>
          <span className="mb-1.5 block font-label text-[10px] tracking-widest uppercase opacity-50">Energy Direction</span>
          <div className="grid grid-cols-3 gap-1">
            {ENERGY.map((e) => (
              <button
                key={e.label}
                onClick={() => applySettings(bars, e.value)}
                className={`cursor-pointer border-0 py-2 font-label text-[10px] font-bold ${
                  energy === e.value ? 'bg-peach text-onyx retro-bevel-in' : 'bg-cream text-onyx/60 retro-bevel-out hover:bg-blush'
                }`}
                data-testid={`sunset-energy-${e.label.toLowerCase()}`}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1.5 block font-label text-[10px] tracking-widest uppercase opacity-50">Blend Max</span>
          <div className="grid grid-cols-3 gap-1">
            {([8, 16, 32] as const).map((b) => (
              <button
                key={b}
                onClick={() => applySettings(b, energy)}
                className={`cursor-pointer border-0 py-2 font-label text-[10px] font-bold ${
                  bars === b ? 'bg-peach text-onyx retro-bevel-in' : 'bg-cream text-onyx/60 retro-bevel-out hover:bg-blush'
                }`}
                data-testid={`sunset-blend-${b}`}
              >
                {b}
              </button>
            ))}
          </div>
          <span className="mt-1 block text-center font-label text-[9px] tracking-widest uppercase opacity-40">
            BARS · SHAKY GRIDS BLEND SHORTER
          </span>
        </div>
        <div className="lcd-display p-2">
          <span className="block font-label text-[10px] leading-relaxed tracking-tighter uppercase">
            {running
              ? `SELECTOR: ${autodjSnap.candidates.length} CANDIDATES RANKED / BEATMATCH GATE 0.30`
              : `${analyzedCount} TRACKS ANALYZED / AWAITING START`}
          </span>
        </div>
      </div>
    </Window>
  );
}

function HistoryWindow() {
  const { history, loadHistory, toggleStar, setNote } = useAppStore();
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <Window title="HISTORY.EXE" variant="inactive" icon="history" docked statusLeft={`${history.length} TRANSITIONS LOGGED`}>
      <div className="flex max-h-72 flex-col overflow-y-auto bg-white/30 p-1 retro-bevel-in">
        {history.length === 0 && (
          <span className="px-2 py-1.5 font-label text-[10px] tracking-widest uppercase opacity-40">NO MIXES RECORDED YET</span>
        )}
        {history.slice(0, 30).map((h, i) => (
          <HistoryRow key={h.id} entry={h} odd={i % 2 === 1} onStar={toggleStar} onNote={setNote} />
        ))}
      </div>
    </Window>
  );
}

function HistoryRow({ entry, odd, onStar, onNote }: {
  entry: PlayHistoryEntry;
  odd: boolean;
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
    <div className={`px-2 py-1.5 ${odd ? 'bg-cream/30' : 'bg-cream/60'}`} data-testid="sunset-history-row">
      <div className="flex items-center gap-2">
        <span className="font-label text-[9px] opacity-40">{timeOf(entry.at)}</span>
        <span className="min-w-0 flex-1 truncate font-label text-[10px] font-bold" title={`${entry.from.title} → ${entry.to.title}`}>
          {entry.from.title} <span className="opacity-40">→</span> {entry.to.title}
        </span>
        <button
          className="cursor-pointer border-0 bg-transparent p-0 font-label text-[10px] opacity-50 hover:opacity-100"
          onClick={() => {
            setDraft(entry.note);
            setEditing(true);
          }}
          title="Add note"
        >
          ✎
        </button>
        <button
          className={`cursor-pointer border-0 bg-transparent p-0 text-[12px] leading-none ${entry.starred ? 'text-amber' : 'text-onyx/30 hover:text-onyx/60'}`}
          onClick={() => entry.id !== undefined && onStar(entry.id)}
          title={entry.starred ? 'Unstar' : 'Star this mix'}
          data-testid="sunset-history-star"
        >
          {entry.starred ? '★' : '☆'}
        </button>
      </div>
      <div className="flex items-center gap-2 font-label text-[9px] uppercase opacity-60">
        <span>
          {formatCamelot(entry.from.camelot) || '?'}→{formatCamelot(entry.to.camelot) || '?'}
        </span>
        <span className={entry.fallback ? '' : 'text-magenta'}>{blendLabel(entry)}</span>
        <span className="bg-onyx/10 px-1">{entry.source}</span>
      </div>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={saveNote}
          onKeyDown={(e) => e.key === 'Enter' && saveNote()}
          placeholder="WHAT MADE IT LAND?"
          className="lcd-display mt-1 w-full px-1 py-0.5 font-label text-[10px]"
          data-testid="sunset-history-note-input"
        />
      ) : (
        entry.note && <p className="m-0 font-label text-[9px] italic opacity-60">{entry.note}</p>
      )}
    </div>
  );
}

/** Stereo VU for the playing deck: AnalyserNode pair tapped off the deck's
    gain from the UI side (post-fader, so blends visibly hand level over).
    Taps are created once per deck and NEVER disconnected (engine rule:
    analysers have no downstream and disconnecting kills audio). */
const vuTaps = new WeakMap<Deck, { l: AnalyserNode; r: AnalyserNode }>();

function tapDeck(deck: Deck): { l: AnalyserNode; r: AnalyserNode } {
  let tap = vuTaps.get(deck);
  if (!tap) {
    const ctx = deck.gain.context;
    const split = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
    const l = new AnalyserNode(ctx, { fftSize: 1024 });
    const r = new AnalyserNode(ctx, { fftSize: 1024 });
    deck.gain.connect(split);
    split.connect(l, 0);
    split.connect(r, 1);
    tap = { l, r };
    vuTaps.set(deck, tap);
  }
  return tap;
}

const VU_SEGS = 16;
const VU_FLOOR_DB = -42;

function VuMeter({ deck }: { deck: Deck | null }) {
  const [levels, setLevels] = useState<[number, number]>([0, 0]);

  useEffect(() => {
    if (!deck) return;
    const { l, r } = tapDeck(deck);
    const buf = new Float32Array(l.fftSize);
    const toLevel = (a: AnalyserNode) => {
      a.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const db = 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-8);
      return Math.max(0, Math.min(1, 1 - db / VU_FLOOR_DB));
    };
    const id = setInterval(() => {
      const nl = toLevel(l);
      const nr = toLevel(r);
      // fast attack, slow release — classic meter ballistics
      setLevels((prev) => [
        nl > prev[0] ? nl : prev[0] * 0.7 + nl * 0.3,
        nr > prev[1] ? nr : prev[1] * 0.7 + nr * 0.3,
      ]);
    }, 80);
    return () => clearInterval(id);
  }, [deck]);

  return (
    <div className="hidden h-8 w-40 flex-col justify-center gap-0.5 bg-onyx px-1.5 retro-bevel-in sm:flex" data-testid="sunset-vu">
      {levels.map((lvl, ch) => (
        <div key={ch} className="flex items-center gap-1">
          <span className="w-2 font-label text-[8px] text-cream/60">{ch === 0 ? 'L' : 'R'}</span>
          <div className="flex flex-1 gap-px">
            {Array.from({ length: VU_SEGS }, (_, i) => {
              const on = lvl * VU_SEGS > i;
              const cls = !on ? 'bg-white/10' : i >= VU_SEGS - 2 ? 'bg-amber' : i >= VU_SEGS - 7 ? 'bg-magenta' : 'bg-peach';
              return <span key={i} className={`h-2 flex-1 ${cls}`}></span>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function reasoningFor(current: TrackAnalysis | null, next: TrackAnalysis | null): string {
  if (!current || !next) return 'RANKING CANDIDATES…';
  const parts: string[] = [];
  if (current.camelot && next.camelot) {
    const sameNum = current.camelot.num === next.camelot.num;
    parts.push(sameNum && current.camelot.letter === next.camelot.letter ? 'KEY MATCH' : 'HARMONIC');
  }
  const dE = next.energy - current.energy;
  parts.push(`ENERGY ${Math.abs(dE) < 0.05 ? 'HOLD' : dE > 0 ? 'UP' : 'DOWN'}`);
  if (current.bpm && next.bpm) parts.push(`BPM ${current.bpm.toFixed(0)} -> ${next.bpm.toFixed(0)}`);
  if (next.gridConfidence < 0.3) parts.push('CROSSFADE (LOW GRID)');
  return parts.join(' / ');
}

function blendLabel(entry: PlayHistoryEntry): string {
  if (entry.fallback) return `XFADE ${entry.durationSec.toFixed(0)}S`;
  const bpm = entry.from.bpm;
  if (!bpm) return `${entry.durationSec.toFixed(0)}S`;
  return `${Math.round(entry.durationSec / (4 * (60 / bpm)))} BARS`;
}

function timeOf(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
