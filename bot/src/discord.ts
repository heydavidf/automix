// Discord end of the broadcast: voice connection, per-session audio resource,
// presence updates, listener counting.
//
// The audio arrives as WebM/Opus chunks; @discordjs/voice's prism demuxer
// unpacks the Opus packets, so there is no decode/encode here. Do NOT enable
// inlineVolume on the resource - it silently forces a transcode path that
// needs an opus library we deliberately don't install.
import { Client, Events, GatewayIntentBits, ActivityType } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  generateDependencyReport,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  type VoiceConnection,
} from '@discordjs/voice';
import { PassThrough } from 'node:stream';
import type { NowPlaying, Sink } from './index.ts';

const GRACE_MS = 60_000; // stay in the channel this long after the browser drops
const PRESENCE_MIN_INTERVAL_MS = 15_000; // gateway presence updates are rate-limited

export interface DiscordSinkOptions {
  token: string;
  guildId: string;
  channelId: string;
  debug: boolean;
  log: (...args: unknown[]) => void;
}

export async function createDiscordSink(opts: DiscordSinkOptions): Promise<Sink> {
  const { token, guildId, channelId, debug, log } = opts;
  if (debug) console.log(generateDependencyReport());

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });
  const ready = new Promise<void>((resolve) => client.once(Events.ClientReady, () => resolve()));
  await client.login(token);
  await ready;
  log(`logged in as ${client.user?.tag}`);

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play },
  });
  player.on('error', (err) => log('player error:', err.message));

  let connection: VoiceConnection | null = null;
  let currentStream: PassThrough | null = null;
  let graceTimer: NodeJS.Timeout | null = null;
  let statusChanged: () => void = () => {};

  // Presence, clamped to >= 15s between setActivity calls.
  let lastPresenceAt = 0;
  let pendingPresence: string | null = null;
  let presenceTimer: NodeJS.Timeout | null = null;
  function applyPresence(text: string | null) {
    lastPresenceAt = Date.now();
    if (text === null) client.user?.setPresence({ activities: [] });
    else client.user?.setActivity(text, { type: ActivityType.Listening });
  }
  function setPresence(text: string | null) {
    pendingPresence = text;
    if (presenceTimer) return; // an update is already queued; it will pick up the latest
    const wait = lastPresenceAt + PRESENCE_MIN_INTERVAL_MS - Date.now();
    if (wait <= 0) {
      applyPresence(pendingPresence);
      pendingPresence = null;
    } else {
      presenceTimer = setTimeout(() => {
        presenceTimer = null;
        applyPresence(pendingPresence);
        pendingPresence = null;
      }, wait);
      presenceTimer.unref();
    }
  }

  function countListeners(): number {
    const ch = client.channels.cache.get(channelId);
    if (!ch || !ch.isVoiceBased()) return 0;
    return ch.members.filter((m) => !m.user.bot).size;
  }

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (oldState.channelId === channelId || newState.channelId === channelId) statusChanged();
  });

  function inChannel(): boolean {
    return connection?.state.status === VoiceConnectionStatus.Ready;
  }

  function leave() {
    connection?.destroy();
    connection = null;
    setPresence(null);
    statusChanged();
  }

  return {
    async start() {
      if (graceTimer) {
        clearTimeout(graceTimer);
        graceTimer = null;
      }
      if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) return;

      const guild = await client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(channelId);
      if (!channel?.isVoiceBased()) {
        throw new Error('VOICE_CHANNEL_ID does not point at a voice channel in that server');
      }
      const conn = joinVoiceChannel({
        guildId,
        channelId,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
      });
      connection = conn;
      conn.on(VoiceConnectionStatus.Disconnected, async () => {
        // Kicked/moved vs transient network blip: give it 5s to resignal, else tear down.
        try {
          await Promise.race([
            entersState(conn, VoiceConnectionStatus.Signalling, 5_000),
            entersState(conn, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch {
          if (connection === conn) {
            log('voice connection lost');
            leave();
          }
        }
      });
      conn.on('error', (err) => log('voice error:', err.message));
      try {
        await entersState(conn, VoiceConnectionStatus.Ready, 15_000);
      } catch (err) {
        leave();
        throw new Error('could not join the voice channel within 15s (check permissions/IDs)');
      }
      conn.subscribe(player);
      log('joined voice channel');
      statusChanged();
    },

    startSession(session) {
      // One PassThrough + one audio resource per session: the WebM header only
      // exists at the start of a fresh recorder stream (never reuse/replay).
      currentStream?.end();
      currentStream = new PassThrough({ highWaterMark: 1 << 22 });
      const resource = createAudioResource(currentStream, { inputType: StreamType.WebmOpus });
      player.play(resource);
      log(`session ${session}: playing`);
    },

    write(chunk) {
      currentStream?.write(chunk);
    },

    clientGone(explicit) {
      currentStream?.end();
      currentStream = null;
      player.stop();
      log(`browser gone (${explicit ? 'stop' : 'socket closed'}); leaving in ${GRACE_MS / 1000}s unless it returns`);
      if (graceTimer) clearTimeout(graceTimer);
      graceTimer = setTimeout(() => {
        graceTimer = null;
        log('grace period over, leaving voice channel');
        leave();
      }, GRACE_MS);
      graceTimer.unref();
    },

    setNowPlaying(np: NowPlaying) {
      setPresence(`${np.title} - ${np.artist}`);
    },

    status: () => ({ inChannel: inChannel(), listeners: countListeners() }),

    onStatusChange(cb) {
      statusChanged = cb;
    },
  };
}
