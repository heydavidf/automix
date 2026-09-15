import type { Engine } from './engine';

// Streams the master bus to the local broadcast bot (bot/) as WebM/Opus over a
// localhost WebSocket, and can independently record the bus to a .webm file.
//
// Session rule (load-bearing): a WebM stream's header exists only in a fresh
// MediaRecorder's first chunk, so every bot `ready` (which carries a new
// session id) starts a NEW recorder and the old one is stopped the moment the
// socket drops. Never reuse a recorder across sessions.

const WS_URL = 'ws://127.0.0.1:8765';
const MIME = 'audio/webm;codecs=opus';
const TIMESLICE_MS = 250; // chunk cadence; contributes ~250-500ms of stream latency
const MAX_BUFFERED_BYTES = 5 * 1024 * 1024; // bot hung: force a fresh session, never skip chunks
const BACKOFF_MS = [1000, 2000, 5000];

export type BroadcastPhase =
  | 'idle'
  | 'connecting'
  | 'waiting-bot'
  | 'live'
  | 'reconnecting'
  | 'error';

export interface BroadcastSnapshot {
  phase: BroadcastPhase;
  listeners: number;
  inChannel: boolean;
  dryRun: boolean;
  /** Bot-side check that the current session began with a WebM header (null until known). */
  headerValid: boolean | null;
  error: string | null;
  recording: boolean;
  bytesSent: number;
}

export interface NowPlayingInfo {
  fileKey: string;
  title: string;
  artist: string;
  bpm: number;
  camelot: string;
}

export class BroadcastController {
  /** Post-master tap level, for meters/tests. Reads the bus even when the monitor leg is muted. */
  readonly analyser: AnalyserNode;

  private readonly msDest: MediaStreamAudioDestinationNode;
  private snap: BroadcastSnapshot = {
    phase: 'idle',
    listeners: 0,
    inChannel: false,
    dryRun: false,
    headerValid: null,
    error: null,
    recording: false,
    bytesSent: 0,
  };
  private ws: WebSocket | null = null;
  private recorder: MediaRecorder | null = null;
  private session = 0;
  private userWanted = false;
  private attempts = 0;
  private reconnectTimer: number | null = null;
  private lastNowPlaying: NowPlayingInfo | null = null;
  private sentFileKey: string | null = null;
  private fileRecorder: MediaRecorder | null = null;
  private fileChunks: Blob[] = [];

  constructor(
    engine: Engine,
    private readonly onUpdate: (snap: BroadcastSnapshot) => void,
  ) {
    // Broadcast tap: master -> broadcastGain -> stream destination (+ analyser).
    // Additive and permanent - disconnecting a source node kills audio (engine rule).
    const ctx = engine.ctx;
    const broadcastGain = new GainNode(ctx, { gain: 1 });
    engine.master.connect(broadcastGain);
    this.msDest = ctx.createMediaStreamDestination();
    broadcastGain.connect(this.msDest);
    this.analyser = new AnalyserNode(ctx, { fftSize: 1024 });
    broadcastGain.connect(this.analyser);
  }

  get snapshot(): BroadcastSnapshot {
    return this.snap;
  }

  start() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported(MIME)) {
      this.emit({ phase: 'error', error: `MediaRecorder ${MIME} not supported in this browser` });
      return;
    }
    this.userWanted = true;
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Retry after a bot-side error without rebuilding the socket.
      this.ws.send(JSON.stringify({ type: 'start' }));
      this.emit({ phase: 'waiting-bot', error: null });
      return;
    }
    this.connect();
  }

  stop() {
    this.userWanted = false;
    this.clearReconnect();
    this.stopRecorder();
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'stop' }));
    this.ws?.close();
    this.ws = null;
    this.emit({ phase: 'idle', error: null, listeners: 0, inChannel: false });
  }

  /** Deduped by fileKey; re-sent automatically at the start of each new session. */
  setNowPlaying(np: NowPlayingInfo) {
    if (np.fileKey === this.lastNowPlaying?.fileKey) return;
    this.lastNowPlaying = np;
    this.sendNowPlaying();
  }

  // ---- record-to-file (independent of the WS/bot) ----

  startRecording() {
    if (this.fileRecorder) return;
    this.fileChunks = [];
    this.fileRecorder = new MediaRecorder(this.msDest.stream, { mimeType: MIME });
    this.fileRecorder.ondataavailable = (ev) => {
      if (ev.data.size) this.fileChunks.push(ev.data);
    };
    this.fileRecorder.start(1000);
    this.emit({ recording: true });
  }

  stopRecording() {
    const rec = this.fileRecorder;
    if (!rec) return;
    this.fileRecorder = null;
    rec.onstop = () => {
      const blob = new Blob(this.fileChunks, { type: 'audio/webm' });
      this.fileChunks = [];
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `automix-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    };
    rec.stop();
    this.emit({ recording: false });
  }

  // ---- internals ----

  private emit(patch: Partial<BroadcastSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.onUpdate(this.snap);
  }

  private connect() {
    this.clearReconnect();
    this.emit({ phase: this.attempts === 0 ? 'connecting' : 'reconnecting', error: null });
    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'start' }));
      this.emit({ phase: 'waiting-bot' });
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === 'ready') this.onReady();
      else if (msg.type === 'status') {
        this.emit({
          listeners: Number(msg.listeners ?? 0),
          inChannel: Boolean(msg.inChannel),
          dryRun: Boolean(msg.dryRun),
          headerValid: this.snap.phase === 'live' && this.snap.bytesSent > 0 ? Boolean(msg.headerValid) : null,
        });
      } else if (msg.type === 'error') {
        this.emit({ phase: 'error', error: String(msg.message ?? 'bot error') });
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return; // superseded socket
      this.ws = null;
      this.stopRecorder(); // headerless continuation is useless: kill the session immediately
      if (!this.userWanted) return;
      this.emit({ phase: 'reconnecting' });
      const wait = BACKOFF_MS[Math.min(this.attempts, BACKOFF_MS.length - 1)];
      this.attempts += 1;
      this.reconnectTimer = window.setTimeout(() => this.connect(), wait);
    };
    ws.onerror = () => {
      // onclose follows and handles the retry
    };
  }

  private onReady() {
    this.attempts = 0;
    this.session += 1;
    const mySession = this.session;
    this.stopRecorder();

    const rec = new MediaRecorder(this.msDest.stream, { mimeType: MIME });
    this.recorder = rec;
    rec.ondataavailable = (ev) => {
      // A stopped recorder can fire once more - gate on the session still being current.
      if (mySession !== this.session || this.recorder !== rec) return;
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN || !ev.data.size) return;
      if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
        ws.close(); // bot is stuck; reconnect will mint a fresh session
        return;
      }
      ws.send(ev.data);
      this.emit({ bytesSent: this.snap.bytesSent + ev.data.size });
    };
    rec.start(TIMESLICE_MS);

    this.sentFileKey = null; // fresh bot session: re-announce the current track
    this.emit({ phase: 'live', error: null });
    this.sendNowPlaying();
  }

  private sendNowPlaying() {
    const np = this.lastNowPlaying;
    if (!np || np.fileKey === this.sentFileKey) return;
    if (this.ws?.readyState !== WebSocket.OPEN || this.snap.phase !== 'live') return;
    this.ws.send(JSON.stringify({ type: 'nowplaying', ...np }));
    this.sentFileKey = np.fileKey;
  }

  private stopRecorder() {
    const rec = this.recorder;
    this.recorder = null;
    if (rec && rec.state !== 'inactive') rec.stop();
  }

  private clearReconnect() {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
