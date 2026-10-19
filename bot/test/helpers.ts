// Test helpers: run the real bot in --dry-run mode on a spare port and talk to
// it the way the browser does. No Discord token, nothing beyond 127.0.0.1.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { connect as tcpConnect, createServer, type AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { WebSocket, type RawData } from 'ws';

const BOT_ENTRY = fileURLToPath(new URL('../src/index.ts', import.meta.url));

/** The address the player has under `npm run dev`. */
export const PLAYER_ORIGIN = 'http://localhost:5173';

export interface RunningBot {
  port: number;
  /** Everything the bot has printed so far (stdout and stderr). */
  output(): string;
  /** True while the bot process is still running. */
  alive(): boolean;
  stop(): Promise<void>;
}

/** Ask the OS for a free port, then release it for the bot to use. */
async function sparePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  server.close();
  await once(server, 'close');
  return port;
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = tcpConnect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

/** Start `bot/src/index.ts --dry-run` with WS_PORT set to a spare port. */
export async function startBot(): Promise<RunningBot> {
  const port = await sparePort();
  // Never hand Discord settings to the test bot, even though --dry-run ignores them.
  const env: NodeJS.ProcessEnv = { ...process.env, WS_PORT: String(port) };
  for (const key of ['BOT_TOKEN', 'GUILD_ID', 'VOICE_CHANNEL_ID']) delete env[key];
  const proc = spawn(process.execPath, [BOT_ENTRY, '--dry-run'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let text = '';
  proc.stdout.on('data', (chunk) => (text += chunk));
  proc.stderr.on('data', (chunk) => (text += chunk));
  const running = () => proc.exitCode === null && proc.signalCode === null;
  // Never leave a bot running if the test process ends early.
  const kill = () => proc.kill();
  process.once('exit', kill);

  const bot: RunningBot = {
    port,
    output: () => text,
    alive: running,
    async stop() {
      process.off('exit', kill);
      if (!running()) return;
      const exited = once(proc, 'exit');
      proc.kill();
      await exited;
    },
  };

  const deadline = Date.now() + 10_000;
  while (!(await portOpen(port))) {
    if (!running() || Date.now() > deadline) {
      await bot.stop();
      throw new Error(`bot did not start listening on port ${port}:\n${text}`);
    }
    await delay(50);
  }
  return bot;
}

export type Attempt =
  | { result: 'open'; ws: WebSocket }
  | { result: 'refused'; status: number | null; reason: string };

/** Open a WebSocket to the bot the way a browser page at `origin` would. */
export function tryConnect(port: number, origin?: string): Promise<Attempt> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, origin === undefined ? {} : { origin });
    const timer = setTimeout(() => {
      ws.terminate();
      resolve({ result: 'refused', status: null, reason: 'timed out' });
    }, 3_000);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve({ result: 'open', ws });
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      const status = /Unexpected server response: (\d+)/.exec(err.message);
      resolve({ result: 'refused', status: status ? Number(status[1]) : null, reason: err.message });
    });
  });
}

export async function close(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.CLOSED) return;
  const closed = once(ws, 'close');
  ws.close();
  await closed;
}

/** Resolve with the next JSON text message of the given type from the bot. */
export function nextMessage(ws: WebSocket, type: string, timeoutMs = 3_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    if (ws.readyState !== WebSocket.OPEN) {
      reject(new Error(`connection already closed before a "${type}" message`));
      return;
    }
    const onMessage = (data: RawData, isBinary: boolean) => {
      if (isBinary) return;
      const msg: unknown = JSON.parse(data.toString());
      if (typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === type) {
        cleanup();
        resolve(msg as Record<string, unknown>);
      }
    };
    const onClose = () => {
      cleanup();
      reject(new Error(`connection closed while waiting for a "${type}" message`));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`no "${type}" message within ${timeoutMs} ms`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('close', onClose);
    };
    ws.on('message', onMessage);
    ws.on('close', onClose);
  });
}

/** Wait until `check(output)` is true for the bot's printed output. */
export async function waitForOutput(bot: RunningBot, check: (output: string) => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check(bot.output())) {
    if (Date.now() > deadline) throw new Error(`expected log line not printed. Bot output:\n${bot.output()}`);
    await delay(20);
  }
}

export function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}
