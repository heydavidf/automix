# AutoMix broadcast bot

A local Node process that sits in a Discord voice channel and plays the live automix.
The browser (debug UI → Broadcast panel) streams the master bus to it as WebM/Opus over
`ws://127.0.0.1:8765`; the bot passes the Opus packets straight through to Discord —
no ffmpeg, no re-encode. Now-playing shows as the bot's presence ("Listening to Title - Artist").

## One-time setup (Discord developer portal)

1. https://discord.com/developers/applications → **New Application** → name it (e.g. "AutoMix Radio").
2. Sidebar **Bot** → **Reset Token** → copy immediately (it is shown once) = `BOT_TOKEN`.
3. Same page: leave all three **Privileged Gateway Intents** toggles OFF (this bot only needs
   Guilds + GuildVoiceStates, both unprivileged and requested in code).
4. **OAuth2 → URL Generator**: tick scope **bot**; in the permissions grid tick
   **View Channel**, **Connect**, **Speak**. Copy the generated URL.
   (If the app shows an "Installation" page instead, set Install Link → Custom URL with that
   same URL, or just paste the URL straight into a browser.)
5. Open the URL, pick your server, **Authorize**. The bot appears offline in the member
   list until `npm run bot` is running — that's normal.
6. In the Discord app: **User Settings → Advanced → Developer Mode ON**. Then
   right-click the server name → **Copy Server ID** = `GUILD_ID`, and
   right-click the target voice channel → **Copy Channel ID** = `VOICE_CHANNEL_ID`.
7. From the repo root:
   ```
   cp bot/.env.example bot/.env   # fill in the three values
   npm run bot:install
   ```

## Daily flow

```
npm run dev    # the player (Chrome)
npm run bot    # this bot (separate terminal)
```
Then click **Go live** in the debug UI's Broadcast panel and join the voice channel to listen
(expect the stream ~1-2 s behind the room). The bot stays in the channel for 60 s after the
browser drops, so a page refresh doesn't bounce it.

## Testing without Discord

`npm run bot:dry` runs the same WebSocket server with no token/Discord at all: it validates
that each session starts with a WebM (EBML) header, counts bytes, and logs now-playing frames.
The Broadcast panel shows "(dry-run bot)" when connected to it.

## Notes

- Needs Node ≥ 23 (runs TypeScript directly via type-stripping; erasable syntax only).
- Audio path is WebmOpus passthrough. Never enable `inlineVolume` on the audio resource —
  it silently forces a decode/re-encode path that needs an opus library we don't install.
- One MediaRecorder per bot session (the `ready {session}` message): a WebM stream's header
  exists only in a fresh recorder's first chunk. The browser side handles this; if you ever
  see "stream header invalid" in the panel, that rule got broken.
- The WS server binds to 127.0.0.1 only. `--debug` prints @discordjs/voice's dependency report.
