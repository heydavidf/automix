# AutoMix

AutoMix is a browser music player that DJs your own files. It picks the next track by key, beat-matches without changing pitch, and blends on phrase boundaries. Everything runs on your computer. There is no cloud library and no account.

It is built for Chrome on a desktop. Point it at a folder of MP3, FLAC, WAV, or M4A files.

## Example

After the app is running, open either UI and run the built-in self-test in the Chrome console. It analyzes a synthetic 124 BPM loop, so you do not need a music folder:

```js
await window.__automixSelfTest()
```

A passing result looks like:

- `type`: `result`
- `bpm` near `123.93`
- `keyName`: `A minor`
- Camelot key `8A`

That check proves analysis is working. It does not prove mix quality on real music.

## Start here

Tested on macOS with Node 25, npm 11, and Chrome. Setup is about one `npm install` and a dev server.

```sh
npm install
npm run dev
```

Then in Chrome:

1. Open http://localhost:5173/sunset.html for the Sunset player (the main UI). It opens on Mix.
2. Click **LIBRARY** (or open http://localhost:5173/sunset.html#/library), then **Choose folder**, and pick a local music folder. Analysis fills in BPM, key, and energy (cached in IndexedDB, so each file is only analyzed once).
3. Open http://localhost:5173/ for the debug / lab UI if you want extra controls. **Choose folder** is on that first screen.
4. When at least two tracks are analyzed, start Auto-mix. Blend length and energy direction are in Mix / machine-params (Sunset) or the Auto-mix panel (debug).

Chrome is required because AutoMix uses the File System Access API to read a folder you choose. Other browsers show an explicit message and stop.

For an agent-assisted setup:

> Inspect this repository and its setup instructions. Explain its requirements and proposed local changes, help me configure my own private inputs, then run the documented example. Keep credentials out of chat and committed files.

## How it works

1. You grant Chrome read access to a music folder.
2. AutoMix reads tags, then analyzes each track in a worker (BPM, beat grid, musical key, energy).
3. Auto-DJ picks a harmonically compatible next track, time-stretches to match tempo, and crossfades on a phrase boundary. Weak beat grids fall back to a plain 12-second crossfade.
4. Play history (including optional stars and notes) stays in IndexedDB in that browser.

No music files are uploaded. Optional Discord broadcast is a **local** Node process: the browser sends the mix to `127.0.0.1` over WebSocket, and the bot plays it in a voice channel you configure. See [bot/README.md](bot/README.md). Live Discord needs a bot token you create; that path has not been verified in this public package.

Possible costs: none for local playback. Discord is free for a small bot. Google Fonts load for the Sunset UI when you are online.

## Two UIs, one engine

| URL | What it is |
| --- | --- |
| `/sunset.html` | Skinned player (Mix + Library). This is the product UI. |
| `/` | Debug / lab UI with extra tools: beatmatch lab, jam synth, broadcast panel. |

Audio logic lives in `src/lib`. Do not copy engine code into `src/sunset/`. Visual identity notes are in [design/DESIGN.md](design/DESIGN.md). The shipped Mix layout is Mix + Library, not the older Tidy Rack mock.

```sh
npm run build         # typecheck + production build
npm run preview       # serve the production build
npm run bot:install   # once; the bot has its own packages
npm run bot:dry       # local broadcast bot without Discord (needs bot:install)
```

Root `npm install` does not install the bot. `npm run bot:dry` or `npm run bot` without `bot:install` fails looking for `ws`. See [bot/README.md](bot/README.md).

## Compatibility and limitations

- **Tested here:** install and production build on macOS arm64, Node 25.6.0, npm 11.8.0. Debug UI self-test in Chrome. Bot dry-run (no Discord).
- **Not tested in this package:** live Discord, Safari/Firefox, Windows/Linux, long real-music listening sessions, Mixxx key/BPM agreement.
- Beat/key analysis uses [essentia.js](https://github.com/MTG/essentia.js) (AGPL-3.0). Time-stretch uses [signalsmith-stretch](https://github.com/Signalsmith-Audio/signalsmith-stretch) (MIT).
- Downbeat placement on real music is the main open quality risk. Synthetic loops cannot prove it.
- `web-audio-beat-detector` is listed in `package.json` but is not imported by the app.
- Sunset UI loads fonts from Google Fonts. The debug UI does not.
- The optional Discord bot's lockfile still reports `undici` issues via `discord.js`. Live Discord is not part of the verified path. Do not run `npm audit fix` in `bot/` without re-testing.

## Update, remove, and get help

Update by pulling a newer version and running `npm install` again. IndexedDB data (`automix`) and any `bot/.env` you created stay on your machine; they are not in git.

To remove the app, delete the clone. That does not delete Chrome's IndexedDB for the origin you used, or a Discord bot you created in the developer portal.

This is a personal project. After the repository is public, use GitHub issues for ordinary bugs. Do not paste bot tokens, `.env` files, or other secrets into issues. For a suspected security problem, use GitHub's private vulnerability reporting once it is enabled on the remote (it is not enabled yet because nothing has been published).

Copyright (C) 2026 David Finnegan. Licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
