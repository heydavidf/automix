import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../state/store';
import { camelotToScale, formatCamelot, type ScaleSpec } from '../lib/analysis/camelot';
import { JamSynth, DEFAULT_SYNTH_PARAMS, degreeToMidi, midiToName, type SynthParams, type Waveform } from '../lib/engine/synth';
import { DrumKit, DRUM_NAMES, DRUM_LABEL, type DrumName } from '../lib/engine/drums';

declare global {
  interface Window {
    __automixSynth?: JamSynth;
    __automixDrums?: DrumKit;
  }
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const WAVEFORMS: Waveform[] = ['sine', 'triangle', 'sawtooth', 'square'];
// drums on the QWERTY row (number row is taken by the in-key notes)
const DRUM_KEYS: Record<string, DrumName> = { q: 'kick', w: 'snare', e: 'hat', r: 'openhat', t: 'clap', y: 'tom' };
const DRUM_KEY_OF: Record<DrumName, string> = { kick: 'Q', snare: 'W', hat: 'E', openhat: 'R', clap: 'T', tom: 'Y' };
const A_MINOR = { num: 8, letter: 'A' as const };

interface LiveKey {
  spec: ScaleSpec;
  label: string;
  detected: boolean;
}

/** Read the currently-playing track's key fresh from the store (auto-DJ's
    active deck, else the single playing deck), falling back to A minor. */
function readLiveKey(): LiveKey {
  const { engine, analyses, autodjSnap } = useAppStore.getState();
  let camelot = null as { num: number; letter: 'A' | 'B' } | null;
  let keyName: string | null = null;
  let src = '';
  if (autodjSnap && autodjSnap.state !== 'idle' && autodjSnap.currentKey) {
    const a = analyses[autodjSnap.currentKey];
    if (a?.camelot) {
      camelot = a.camelot;
      keyName = a.keyName;
      src = `Deck ${autodjSnap.activeDeck}`;
    }
  } else if (engine) {
    const playing = engine.decks.filter((d) => d.isPlaying && d.loaded);
    if (playing[0]?.loaded) {
      const a = analyses[playing[0].loaded.fileKey];
      if (a?.camelot) {
        camelot = a.camelot;
        keyName = a.keyName;
        src = 'playing deck';
      }
    }
  }
  if (camelot) {
    return {
      spec: camelotToScale(camelot),
      label: `${keyName ?? formatCamelot(camelot)} · ${formatCamelot(camelot)} · ${src}`,
      detected: true,
    };
  }
  return { spec: camelotToScale(A_MINOR), label: 'A minor (default — nothing playing)', detected: false };
}

/** Playable Web Audio synth whose scale auto-locks to the playing track's key.
    Number row 1-0 = the keyboard. Built in the debug UI (engine-first); a
    Sunset-skinned version with rotary knobs comes later. */
export function SynthLab() {
  const { engine, ensureEngine } = useAppStore();
  const [params, setParams] = useState<SynthParams>({ ...DEFAULT_SYNTH_PARAMS });
  const [octave, setOctave] = useState(4);
  const [armed, setArmed] = useState(false);
  const [live, setLive] = useState<LiveKey>(() => ({ spec: camelotToScale(A_MINOR), label: 'A minor (default)', detected: false }));
  const [heldKeys, setHeldKeys] = useState<Set<string>>(new Set());
  const [drumLevel, setDrumLevel] = useState(0.85);
  const [drumFlash, setDrumFlash] = useState<DrumName | null>(null);

  const synthRef = useRef<JamSynth | null>(null);
  const drumsRef = useRef<DrumKit | null>(null);
  const armedRef = useRef(false);
  const octaveRef = useRef(octave);
  const heldMidi = useRef(new Map<string, number>());
  octaveRef.current = octave;

  const hitDrum = useCallback((name: DrumName) => {
    drumsRef.current?.trigger(name);
    setDrumFlash(name);
    setTimeout(() => setDrumFlash((f) => (f === name ? null : f)), 110);
  }, []);

  // keep synth params mirrored
  useEffect(() => {
    synthRef.current?.setParams(params);
  }, [params]);

  // poll the live key for the readout + pad labels
  useEffect(() => {
    const id = setInterval(() => setLive(readLiveKey()), 300);
    return () => clearInterval(id);
  }, []);

  async function powerOn() {
    const eng = await ensureEngine();
    if (!synthRef.current) {
      synthRef.current = new JamSynth(eng.ctx, eng.master);
      synthRef.current.setParams(params);
      window.__automixSynth = synthRef.current;
    }
    if (!drumsRef.current) {
      drumsRef.current = new DrumKit(eng.ctx, eng.master);
      drumsRef.current.setLevel(drumLevel);
      window.__automixDrums = drumsRef.current;
    }
    armedRef.current = true;
    setArmed(true);
  }

  function powerOff() {
    armedRef.current = false;
    synthRef.current?.allOff();
    heldMidi.current.clear();
    setHeldKeys(new Set());
    setArmed(false);
  }

  function triggerDegree(degree: number): number | null {
    const synth = synthRef.current;
    if (!synth) return null;
    const midi = degreeToMidi(readLiveKey().spec, degree, octaveRef.current);
    synth.noteOn(midi);
    return midi;
  }

  // number-row keyboard (active only while armed); coexists with App.tsx's
  // arrow-key scrub (different keys) and ignores typing in form fields
  useEffect(() => {
    if (!armed) return;
    const onDown = (e: KeyboardEvent) => {
      if (!armedRef.current) return;
      const t = e.target as HTMLElement | null;
      if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
      const drum = DRUM_KEYS[e.key.toLowerCase()];
      if (drum) {
        e.preventDefault();
        if (!e.repeat) hitDrum(drum);
        return;
      }
      const degree = DIGITS.indexOf(e.key);
      if (degree < 0) return;
      e.preventDefault();
      if (e.repeat || heldMidi.current.has(e.key)) return;
      const midi = triggerDegree(degree);
      if (midi !== null) {
        heldMidi.current.set(e.key, midi);
        setHeldKeys(new Set(heldMidi.current.keys()));
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const midi = heldMidi.current.get(e.key);
      if (midi === undefined) return;
      synthRef.current?.noteOff(midi);
      heldMidi.current.delete(e.key);
      setHeldKeys(new Set(heldMidi.current.keys()));
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [armed, hitDrum]);

  useEffect(() => {
    drumsRef.current?.setLevel(drumLevel);
  }, [drumLevel]);

  function update(p: Partial<SynthParams>) {
    setParams((prev) => ({ ...prev, ...p }));
  }

  // pad pointer play (mouse), keyed by digit so it shares the held set
  function padDown(digit: string, degree: number) {
    if (!armed || heldMidi.current.has(digit)) return;
    const midi = triggerDegree(degree);
    if (midi !== null) {
      heldMidi.current.set(digit, midi);
      setHeldKeys(new Set(heldMidi.current.keys()));
    }
  }
  function padUp(digit: string) {
    const midi = heldMidi.current.get(digit);
    if (midi === undefined) return;
    synthRef.current?.noteOff(midi);
    heldMidi.current.delete(digit);
    setHeldKeys(new Set(heldMidi.current.keys()));
  }

  return (
    <div className="panel flex flex-col gap-3" data-testid="synth">
      <div className="flex items-center gap-2">
        <h2 className="mr-auto text-sm font-bold tracking-wide text-zinc-400 uppercase">Jam synth</h2>
        <span className="font-mono text-xs text-zinc-400" data-testid="synth-key">
          {live.detected ? '🔊 ' : '○ '}
          {live.label}
        </span>
        {!armed ? (
          <button className="btn" onClick={() => void powerOn()} data-testid="synth-power">
            Enable (1-0)
          </button>
        ) : (
          <button className="btn-ghost" onClick={powerOff} data-testid="synth-off">
            Disable
          </button>
        )}
      </div>

      {!live.detected && (
        <p className="text-xs text-zinc-600">No track playing — keys default to A minor. Start the auto-mix or play a deck to lock the synth to the live key.</p>
      )}

      {/* pads: number row 1-0 → scale degrees of the live key */}
      <div className="grid grid-cols-10 gap-1">
        {DIGITS.map((digit, degree) => {
          const midi = degreeToMidi(live.spec, degree, octave);
          const active = heldKeys.has(digit);
          const isRoot = degree % live.spec.intervals.length === 0;
          return (
            <button
              key={digit}
              onPointerDown={() => padDown(digit, degree)}
              onPointerUp={() => padUp(digit)}
              onPointerLeave={() => padUp(digit)}
              disabled={!armed}
              data-testid={`synth-pad-${digit}`}
              className={`flex flex-col items-center gap-0.5 rounded border py-2 font-mono text-xs ${
                active
                  ? 'border-blue-400 bg-blue-600 text-white'
                  : isRoot
                    ? 'border-zinc-600 bg-zinc-800 text-zinc-200'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-400'
              } ${armed ? 'cursor-pointer hover:border-zinc-500' : 'opacity-50'}`}
            >
              <span className="text-zinc-500">{digit}</span>
              <span className="font-semibold">{midiToName(midi)}</span>
            </button>
          );
        })}
      </div>

      {/* drums: synthesized one-shots on the QWERTY row */}
      <div className="flex items-center gap-2">
        <div className="grid flex-1 grid-cols-6 gap-1">
          {DRUM_NAMES.map((name) => {
            const flash = drumFlash === name;
            return (
              <button
                key={name}
                onPointerDown={() => armed && hitDrum(name)}
                disabled={!armed}
                data-testid={`synth-drum-${name}`}
                className={`flex flex-col items-center gap-0.5 rounded border py-2 font-mono text-xs ${
                  flash ? 'border-amber-400 bg-amber-500 text-zinc-900' : 'border-zinc-700 bg-zinc-900 text-zinc-300'
                } ${armed ? 'cursor-pointer hover:border-zinc-500' : 'opacity-50'}`}
              >
                <span className="text-zinc-500">{DRUM_KEY_OF[name]}</span>
                <span className="font-semibold">{DRUM_LABEL[name]}</span>
              </button>
            );
          })}
        </div>
        <label className="flex w-24 flex-col gap-0.5 text-xs text-zinc-400">
          <span className="flex justify-between font-mono">
            <span>Drums</span>
            <span className="text-zinc-500">{Math.round(drumLevel * 100)}%</span>
          </span>
          <input type="range" min={0} max={1} step={0.01} value={drumLevel} onChange={(e) => setDrumLevel(Number(e.target.value))} className="accent-amber-500" />
        </label>
      </div>

      {/* octave + waveform */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 text-xs text-zinc-400">
          <span>Octave</span>
          <button className="btn-ghost px-2 py-0.5" onClick={() => setOctave((o) => Math.max(2, o - 1))}>−</button>
          <span className="w-5 text-center font-mono text-zinc-200" data-testid="synth-octave">{octave}</span>
          <button className="btn-ghost px-2 py-0.5" onClick={() => setOctave((o) => Math.min(6, o + 1))}>+</button>
        </div>
        <div className="flex items-center gap-1">
          {WAVEFORMS.map((w) => (
            <button
              key={w}
              onClick={() => update({ waveform: w })}
              className={`rounded border px-2 py-0.5 font-mono text-xs ${
                params.waveform === w ? 'border-blue-400 bg-blue-600 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'
              }`}
              data-testid={`synth-wave-${w}`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* filter + envelope + level */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        <LogSlider label="Cutoff" min={80} max={12000} unit="Hz" value={params.cutoff} onChange={(v) => update({ cutoff: v })} />
        <Slider label="Resonance" min={0.5} max={20} step={0.1} value={params.resonance} onChange={(v) => update({ resonance: v })} />
        <Slider label="Level" min={0} max={1} step={0.01} value={params.level} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update({ level: v })} />
        <div />
        <Slider label="Attack" min={0} max={1} step={0.005} value={params.attack} fmt={(v) => `${(v * 1000).toFixed(0)}ms`} onChange={(v) => update({ attack: v })} />
        <Slider label="Decay" min={0} max={1} step={0.005} value={params.decay} fmt={(v) => `${(v * 1000).toFixed(0)}ms`} onChange={(v) => update({ decay: v })} />
        <Slider label="Sustain" min={0} max={1} step={0.01} value={params.sustain} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update({ sustain: v })} />
        <Slider label="Release" min={0} max={2} step={0.01} value={params.release} fmt={(v) => `${(v * 1000).toFixed(0)}ms`} onChange={(v) => update({ release: v })} />
      </div>

      <p className="text-xs text-zinc-600">
        <span className="font-mono text-zinc-400">1–0</span> play in-key notes; <span className="font-mono text-zinc-400">Q W E R T Y</span> play drums (or click the pads). The scale locks to the playing track's key, so every note fits. {engine ? '' : 'Click Enable to start audio.'}
      </p>
    </div>
  );
}

function Slider({ label, min, max, step, value, onChange, fmt }: {
  label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-xs text-zinc-400">
      <span className="flex justify-between font-mono">
        <span>{label}</span>
        <span className="text-zinc-500">{fmt ? fmt(value) : value.toFixed(1)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-blue-600" />
    </label>
  );
}

/** Slider with an exponential (log) value mapping — natural for filter cutoff. */
function LogSlider({ label, min, max, unit, value, onChange }: {
  label: string; min: number; max: number; unit: string; value: number; onChange: (v: number) => void;
}) {
  const t = Math.log(value / min) / Math.log(max / min);
  return (
    <label className="flex flex-col gap-0.5 text-xs text-zinc-400">
      <span className="flex justify-between font-mono">
        <span>{label}</span>
        <span className="text-zinc-500">{Math.round(value)} {unit}</span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={t}
        onChange={(e) => onChange(min * Math.pow(max / min, Number(e.target.value)))}
        className="accent-blue-600"
      />
    </label>
  );
}
