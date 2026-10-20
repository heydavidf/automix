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

// Web pages allowed to connect: the AutoMix player under `npm run dev` (port
// 5173) and `npm run preview` (port 4173). Both ports are fixed in
// vite.config.ts; keep the two lists in sync. Binding to 127.0.0.1 keeps other
// computers out, but any website open in the browser can still reach this
// port. Browsers send the page's real Origin with every WebSocket handshake
// and a page cannot change it, so this check keeps other websites out. It does
// not stop other programs already running on this computer.
const PLAYER_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);

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

// ---- WebSocket server (localhost only, AutoMix player pages only) ----

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

type ClientMessage = { type: 'start' } | { type: 'stop' } | { type: 'nowplaying'; np: NowPlaying };

/** Short, quoted form of an untrusted value for the log. */
function quote(value: unknown): string {
  return (JSON.stringify(value) ?? String(value)).slice(0, 80);
}

// Turns one text frame from the browser into a message the bot understands,
// or returns the reason it was rejected. Never throws: bad JSON, null, arrays,
// unknown types and wrong field types are all just rejected.
function parseMessage(raw: string): ClientMessage | string {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return 'not JSON';
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return 'not a JSON object';
  const msg = data as Record<string, unknown>;
  switch (msg.type) {
    case 'start':
      return { type: 'start' };
    case 'stop':
      return { type: 'stop' };
    case 'nowplaying': {
      const { fileKey, title, artist, bpm, camelot } = msg;
      if (
        typeof fileKey !== 'string' ||
        typeof title !== 'string' ||
        typeof artist !== 'string' ||
        typeof camelot !== 'string'
      ) {
        return 'nowplaying needs text fileKey, title, artist and camelot';
      }
      // JSON turns NaN into null; treat that like the player's own "unknown" (0).
      if (bpm !== null && typeof bpm !== 'number') return 'nowplaying bpm must be a number';
      return { type: 'nowplaying', np: { fileKey, title, artist, bpm: bpm ?? 0, camelot } };
    }
    default:
      return `unknown type ${quote(msg.type)}`;
  }
}

async function handleText(raw: string) {
  const msg = parseMessage(raw);
  if (typeof msg === 'string') return log(`rejected message from browser: ${msg}`);
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
      sink.setNowPlaying(msg.np);
      break;
    case 'stop':
      if (sessionLive) {
        sessionLive = false;
        sink.clientGone(true);
      }
      pushStatus();
      break;
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

const wss = new WebSocketServer({
  host: '127.0.0.1',
  port: WS_PORT,
  // Runs before 'connection', so a refused page never replaces the player.
  verifyClient: ({ origin }: { origin?: string }) => {
    if (origin && PLAYER_ORIGINS.has(origin)) return true;
    log(`refused connection from ${origin ? quote(origin) : 'a page with no Origin header'} (not the AutoMix player)`);
    return false;
  },
});

wss.on('connection', (ws) => {
  log('browser connected');
  // One browser at a time; the newest connection wins.
  if (client) client.close();
  client = ws;
  sessionLive = false;

  ws.on('message', (data, isBinary) => {
    if (isBinary) handleBinary(data);
    else handleText(data.toString()).catch((err) => log('error handling message:', err));
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
