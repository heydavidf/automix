// Regression test: the bot used to accept a WebSocket from any web page, so
// any website open in the browser could connect, take over the broadcast and
// push the player off. Only the AutoMix player's own addresses may connect.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { close, nextMessage, PLAYER_ORIGIN, startBot, tryConnect, waitForOutput, type RunningBot } from './helpers.ts';

// `npm run dev` (5173) and `npm run preview` (4173), both fixed in vite.config.ts.
const PLAYER_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

const OTHER_PAGES: Array<[label: string, origin: string | undefined]> = [
  ['another website', 'https://evil.example'],
  ['a look-alike address', 'http://localhost.evil.example'],
  ['another local server', 'http://localhost:3000'],
  ['the player port over https', 'https://localhost:5173'],
  ['a local file or sandboxed page', 'null'],
  ['a client that sends no Origin', undefined],
];

describe('only the AutoMix player can connect to the bot', () => {
  let bot: RunningBot;
  before(async () => {
    bot = await startBot();
  });
  after(async () => {
    await bot?.stop();
  });

  for (const origin of PLAYER_ORIGINS) {
    it(`accepts the player at ${origin}`, async () => {
      const attempt = await tryConnect(bot.port, origin);
      if (attempt.result === 'open') await close(attempt.ws);
      assert.equal(attempt.result, 'open', `player at ${origin} was refused`);
    });
  }

  for (const [label, origin] of OTHER_PAGES) {
    it(`refuses ${label} (${origin ?? 'no Origin header'})`, async () => {
      const attempt = await tryConnect(bot.port, origin);
      if (attempt.result === 'open') await close(attempt.ws);
      assert.equal(attempt.result, 'refused', `${origin ?? 'no Origin'} was allowed to connect`);
      assert.equal(attempt.status, 401);
    });
  }

  it('logs each refused page', async () => {
    await waitForOutput(bot, (out) => out.includes('refused connection from "https://evil.example"'));
    await waitForOutput(bot, (out) => out.includes('refused connection from a page with no Origin header'));
  });

  it('a refused page cannot push the player off', async () => {
    const player = await tryConnect(bot.port, PLAYER_ORIGIN);
    assert.equal(player.result, 'open');
    if (player.result !== 'open') return;
    try {
      const intruder = await tryConnect(bot.port, 'https://evil.example');
      if (intruder.result === 'open') await close(intruder.ws);
      await delay(200);
      assert.equal(player.ws.readyState, WebSocket.OPEN, 'player was disconnected by another page');
      // The player can still start a session.
      const ready = nextMessage(player.ws, 'ready');
      player.ws.send(JSON.stringify({ type: 'start' }));
      await ready;
    } finally {
      await close(player.ws);
    }
  });
});
