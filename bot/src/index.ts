// AutoMix broadcast bot. Receives WebM/Opus audio from the browser over a
// localhost WebSocket and plays it into a Discord voice channel.
//
// Modes:
//   node --env-file-if-exists=.env src/index.ts          live (needs bot/.env)
//   node src/index.ts --dry-run                          no Discord, validates the stream
//
// Runs directly on Node >= 23 type-stripping: erasable TS syntax only.
import { WebSocketServer, WebSocket, type RawData } from 'ws';

const DRY_RUN = process.argv.includes('--dry-run');
const DEBUG = process.argv.includes('--debug');
const WS_PORT = Number(process.env.WS_PORT ?? 8765);

// First bytes of every WebM stream (EBML magic). A session whose first chunk
// doesn't start with this can never demux - it means a MediaRecorder was
// reused across sessions on the browser side.
const EBML_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

export interface NowPlaying {
  fileKey: string;
  title: string;
  artist: string;
  bpm: number;
  camelot: string;
}

/** What index.ts needs from an audio destination (Discord or dry-run). */
export interface Sink {
  /** Make the sink ready to accept audio (live: join the voice channel). */
  start(): Promise<void>;
  /** A fresh stream begins: expect a new WebM header next. */
  startSession(session: number): void;
  write(chunk: Buffer): void;
  /** Browser stopped (explicit) or its socket died (implicit). */
  clientGone(explicit: boolean): void;
  setNowPlaying(np: NowPlaying): void;
  status(): { inChannel: boolean; listeners: number };
  onStatusChange(cb: () => void): void;
}

const log = (...args: unknown[]) =>
  console.log(new Date().toISOString().slice(11, 19), ...args);

function makeDrySink(): Sink {
  return {
    async start() {},
    startSession(session) {
      log(`dry-run: session ${session} started`);
    },
    write() {},
    clientGone(explicit) {
      log(`dry-run: client gone (${explicit ? 'stop' : 'socket closed'})`);
    },
    setNowPlaying(np) {
      log(`dry-run: nowplaying "${np.title} - ${np.artist}" ${np.bpm} BPM ${np.camelot}`);
    },
    status: () => ({ inChannel: false, listeners: 0 }),
    onStatusChange() {},
  };
}

let sink: Sink;
if (DRY_RUN) {
  sink = makeDrySink();
} else {
  const missing = ['BOT_TOKEN', 'GUILD_ID', 'VOICE_CHANNEL_ID'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(
      `Missing env: ${missing.join(', ')}.\n` +
        'Copy bot/.env.example to bot/.env and fill it in (portal walkthrough in bot/README.md),\n' +
        'or run with --dry-run to test without Discord.',
    );
    process.exit(1);
  }
  const { createDiscordSink } = await import('./discord.ts');
  sink = await createDiscordSink({
    token: process.env.BOT_TOKEN as string,
    guildId: process.env.GUILD_ID as string,
    channelId: process.env.VOICE_CHANNEL_ID as string,
    debug: DEBUG,
    log,
  });
}

// ---- WebSocket server (localhost only - no auth on this socket) ----

let client: WebSocket | null = null;
let session = 0;
let sessionLive = false;
let sessionBytes = 0;
let headerValid = false;

function send(obj: Record<string, unknown>) {
  if (client?.readyState === WebSocket.OPEN) client.send(JSON.stringify(obj));
}

function pushStatus() {
  send({ type: 'status', ...sink.status(), bytes: sessionBytes, headerValid, dryRun: DRY_RUN });
}

sink.onStatusChange(pushStatus);
setInterval(pushStatus, 5_000).unref();

async function handleText(raw: string) {
  let msg: { type?: string } & Record<string, unknown>;
  try {
    msg = JSON.parse(raw);
  } catch {
    return log('ignoring non-JSON text frame');
  }
  switch (msg.type) {
    case 'start': {
      try {
        await sink.start();
      } catch (err) {
        log('sink start failed:', err);
        send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        return;
      }
      session += 1;
      sessionBytes = 0;
      headerValid = false;
      sessionLive = true;
      sink.startSession(session);
      send({ type: 'ready', session });
      pushStatus();
      break;
    }
    case 'nowplaying':
      sink.setNowPlaying(msg as unknown as NowPlaying);
      break;
    case 'stop':
      if (sessionLive) {
        sessionLive = false;
        sink.clientGone(true);
      }
      pushStatus();
      break;
    default:
      log('unknown message type:', msg.type);
  }
}

function handleBinary(data: RawData) {
  if (!sessionLive) return; // late chunk from a recorder that was just stopped
  const chunk = Buffer.isBuffer(data)
    ? data
    : Array.isArray(data)
      ? Buffer.concat(data)
      : Buffer.from(data);
  if (sessionBytes === 0) {
    headerValid = chunk.subarray(0, 4).equals(EBML_MAGIC);
    if (!headerValid) log('WARNING: session did not start with an EBML header - stream will not demux');
    pushStatus();
  }
  sessionBytes += chunk.length;
  sink.write(chunk);
}

const wss = new WebSocketServer({ host: '127.0.0.1', port: WS_PORT });

wss.on('connection', (ws) => {
  log('browser connected');
  // One browser at a time; the newest connection wins.
  if (client) client.close();
  client = ws;
  sessionLive = false;

  ws.on('message', (data, isBinary) => {
    if (isBinary) handleBinary(data);
    else void handleText(data.toString());
  });
  ws.on('close', () => {
    if (client !== ws) return;
    client = null;
    log('browser disconnected');
    if (sessionLive) {
      sessionLive = false;
      sink.clientGone(false);
    }
  });
  ws.on('error', (err) => log('ws error:', err.message));
  pushStatus();
});

log(`AutoMix bot listening on ws://127.0.0.1:${WS_PORT}${DRY_RUN ? ' (dry-run)' : ''}`);
