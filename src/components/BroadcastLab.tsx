import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../state/store';
import type { BroadcastPhase } from '../lib/engine/broadcast';

const PHASE_LABEL: Record<BroadcastPhase, string> = {
  idle: 'idle',
  connecting: 'connecting to bot…',
  'waiting-bot': 'waiting for bot / voice channel…',
  live: 'LIVE',
  reconnecting: 'reconnecting…',
  error: 'error',
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** RMS meter on the broadcast bus - shows what listeners get, independent of
    the local monitor volume. */
function BusMeter() {
  const broadcast = useAppStore((s) => s.broadcast);
  const [db, setDb] = useState(-Infinity);
  const buf = useRef<Float32Array | null>(null);

  useEffect(() => {
    if (!broadcast) return;
    const analyser = broadcast.analyser;
    buf.current ??= new Float32Array(analyser.fftSize);
    const id = setInterval(() => {
      const data = buf.current as Float32Array<ArrayBuffer>;
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      setDb(rms > 0 ? 20 * Math.log10(rms) : -Infinity);
    }, 100);
    return () => clearInterval(id);
  }, [broadcast]);

  const pct = db === -Infinity ? 0 : Math.max(0, Math.min(100, ((db + 48) / 48) * 100));
  return (
    <div className="flex items-center gap-2" title="broadcast bus level (post-master)">
      <div className="h-2 w-28 overflow-hidden rounded bg-zinc-800">
        <div
          className={`h-full ${pct > 92 ? 'bg-red-500' : 'bg-emerald-500'}`}
          style={{ width: `${pct}%` }}
          data-testid="broadcast-meter"
        />
      </div>
      <span className="w-14 font-mono text-[10px] text-zinc-500" data-testid="broadcast-db">
        {db === -Infinity ? '-inf dB' : `${db.toFixed(0)} dB`}
      </span>
    </div>
  );
}

/** Streams the mix to the local Discord bot (bot/, `npm run bot`) and records
    the master bus to a .webm file. Debug-UI prototype; Sunset skin later. */
export function BroadcastLab() {
  const { broadcast, broadcastSnap, ensureBroadcast } = useAppStore();
  const snap = broadcastSnap;
  const live = snap?.phase === 'live';

  async function goLive() {
    (await ensureBroadcast()).start();
  }
  function stop() {
    broadcast?.stop();
  }
  async function toggleRecord() {
    const b = await ensureBroadcast();
    if (b.snapshot.recording) b.stopRecording();
    else b.startRecording();
  }

  return (
    <div className="panel flex flex-col gap-3" data-testid="broadcast">
      <div className="flex items-center gap-2">
        <h2 className="mr-auto text-sm font-bold tracking-wide text-zinc-400 uppercase">Broadcast</h2>
        {broadcast && <BusMeter />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!live && snap?.phase !== 'connecting' && snap?.phase !== 'waiting-bot' && snap?.phase !== 'reconnecting' ? (
          <button className="btn" onClick={() => void goLive()} data-testid="broadcast-golive">
            Go live
          </button>
        ) : (
          <button className="btn-ghost" onClick={stop} data-testid="broadcast-stop">
            Stop
          </button>
        )}
        <button className="btn-ghost" onClick={() => void toggleRecord()} data-testid="broadcast-rec">
          {snap?.recording ? 'Save recording' : 'Rec'}
        </button>
        <span
          className={`font-mono text-xs ${live ? 'text-emerald-400' : snap?.phase === 'error' ? 'text-red-400' : 'text-zinc-400'}`}
          data-testid="broadcast-phase"
        >
          {PHASE_LABEL[snap?.phase ?? 'idle']}
          {snap?.dryRun ? ' (dry-run bot)' : ''}
        </span>
        {snap?.recording && (
          <span className="font-mono text-xs text-red-400" data-testid="broadcast-recording">
            ● REC
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-4 font-mono text-xs text-zinc-500" data-testid="broadcast-status">
        <span>bot: {snap?.inChannel ? 'in channel' : 'not in channel'}</span>
        <span data-testid="broadcast-listeners">listeners: {snap?.listeners ?? 0}</span>
        <span data-testid="broadcast-bytes">sent: {fmtBytes(snap?.bytesSent ?? 0)}</span>
        {snap?.headerValid === false && (
          <span className="text-red-400" data-testid="broadcast-headerwarn">
            stream header invalid
          </span>
        )}
      </div>
      {snap?.error && (
        <div className="font-mono text-xs text-red-400" data-testid="broadcast-error">
          {snap.error}
        </div>
      )}
      <p className="text-[11px] text-zinc-600">
        Needs `npm run bot` (or bot:dry) running. Keep this tab in the foreground while live - background
        tabs get throttled. Local volume is independent: muting the monitor doesn't touch the stream.
      </p>
    </div>
  );
}
