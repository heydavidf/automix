// Regression test: one malformed text message (for example `null`) used to
// crash the bot. Malformed, non-object and unknown messages must be rejected
// and logged while the bot keeps running and keeps serving the player.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { WebSocket } from 'ws';
import { close, count, nextMessage, PLAYER_ORIGIN, startBot, tryConnect, waitForOutput, type RunningBot } from './helpers.ts';

const REJECTED = 'rejected message from browser';

const BAD_FRAMES: Array<[label: string, frame: string]> = [
  ['null', 'null'],
  ['a number', '42'],
  ['true', 'true'],
  ['a bare string', '"start"'],
  ['an array', '[{"type":"start"}]'],
  ['broken JSON', '{"type":'],
  ['an object with no type', '{}'],
  ['a type that is not text', '{"type":5}'],
  ['an unknown type', '{"type":"shutdown"}'],
  ['nowplaying with no fields', '{"type":"nowplaying"}'],
  [
    'nowplaying with wrong field types',
    '{"type":"nowplaying","fileKey":1,"title":null,"artist":["x"],"bpm":"fast","camelot":8}',
  ],
];

describe('the bot survives malformed messages', () => {
  let bot: RunningBot;
  let player: WebSocket;
  before(async () => {
    bot = await startBot();
    const attempt = await tryConnect(bot.port, PLAYER_ORIGIN);
    assert.equal(attempt.result, 'open');
    if (attempt.result === 'open') player = attempt.ws;
  });
  after(async () => {
    if (player) await close(player);
    await bot?.stop();
  });

  for (const [label, frame] of BAD_FRAMES) {
    it(`rejects ${label} and keeps working`, async () => {
      const rejectedBefore = count(bot.output(), REJECTED);
      const logBefore = bot.output().length;
      player.send(frame);
      // The bot handles messages in order, so a reply to the next valid
      // message proves it survived the bad one.
      const ready = nextMessage(player, 'ready');
      player.send(JSON.stringify({ type: 'start' }));
      await ready.catch((err: Error) => {
        throw new Error(`${err.message}. Bot output:\n${bot.output()}`);
      });
      assert.ok(bot.alive(), 'bot process exited');
      await waitForOutput(bot, (out) => count(out, REJECTED) > rejectedBefore);
      // Nothing from the bad frame reached the sink (Discord in live mode).
      assert.doesNotMatch(bot.output().slice(logBefore), /dry-run: nowplaying/);
    });
  }

  it('still accepts the messages the player really sends', async () => {
    player.send(
      JSON.stringify({ type: 'nowplaying', fileKey: 'k1', title: 'Test Loop', artist: 'Fixture', bpm: 124, camelot: '8A' }),
    );
    await waitForOutput(bot, (out) => out.includes('dry-run: nowplaying "Test Loop - Fixture" 124 BPM 8A'));
    // An unanalysed track: the player sends bpm 0 and camelot "?".
    player.send(
      JSON.stringify({ type: 'nowplaying', fileKey: 'k2', title: 'Unknown title', artist: 'Unknown artist', bpm: 0, camelot: '?' }),
    );
    await waitForOutput(bot, (out) => out.includes('dry-run: nowplaying "Unknown title - Unknown artist" 0 BPM ?'));
    player.send(JSON.stringify({ type: 'stop' }));
    await waitForOutput(bot, (out) => out.includes('dry-run: client gone (stop)'));
    assert.ok(bot.alive());
  });
});
