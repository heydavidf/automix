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

You run AutoMix on your own computer. It is not a public website.

You need [Node.js](https://nodejs.org/) (20 or newer; 25 is what this was tested with), npm, Git, and **Chrome** on a desktop.

```sh
git clone https://github.com/heydavidf/automix.git
cd automix
npm install
npm run dev
```

Vite prints a **Local** address in the terminal: `http://localhost:5173/`. Use that address in Chrome. The port is fixed. If another program is already using port 5173, `npm run dev` stops with "Port 5173 is already in use". Close the other program (often another `npm run dev`) and run it again.

- Main player: add `sunset.html` to it. It opens on Mix.
- Lab / extra controls: the same address with nothing extra.

Then:

1. Click **LIBRARY**, then **Choose folder**, and pick a local music folder (MP3, FLAC, WAV, or M4A). Analysis fills in BPM, key, and energy (cached in IndexedDB, so each file is only analyzed once).
2. When at least two tracks are analyzed, go back to Mix and press **Start Auto-Mix**. Blend length and energy direction are in Mix / machine-params.
3. The lab UI has **Choose folder** on its first screen, plus extra tools (beatmatch lab, jam synth, broadcast panel).

Chrome is required because AutoMix uses the File System Access API to read a folder you choose. Other browsers show an explicit message and stop.

For an agent-assisted setup:

> Inspect this repository and its setup instructions. Explain its requirements and proposed local changes, help me configure my own private inputs, then run the documented example. Keep credentials out of chat and committed files.

## How it works

1. You grant Chrome read access to a music folder.
2. AutoMix reads tags, then analyzes each track in a worker (BPM, beat grid, musical key, energy).
3. Auto-DJ picks a harmonically compatible next track, time-stretches to match tempo, and crossfades on a phrase boundary. Weak beat grids fall back to a plain 12-second crossfade.
4. Play history (including optional stars and notes) stays in IndexedDB in that browser.

No music files are uploaded. Optional Discord broadcast is a **local** bot on this computer only (debug UI **Go live**, not the Sunset player). The bot accepts only pages from the player's own addresses (`localhost` or `127.0.0.1` on ports 5173 and 4173); other websites open in your browser are refused. See [bot/README.md](bot/README.md). That path is coded but has not been verified with a real Discord bot token.

Possible costs: none for local playback. Discord is free for a small bot. Google Fonts load for the Sunset UI when you are online.

## Two UIs, one engine

| Path on the printed Local address | What it is |
| --- | --- |
| `sunset.html` | Skinned player (Mix + Library). This is the product UI. |
| *(nothing extra)* | Debug / lab UI with extra tools: beatmatch lab, jam synth, broadcast panel. |

Audio logic lives in `src/lib`. Do not copy engine code into `src/sunset/`. Visual identity notes are in [design/DESIGN.md](design/DESIGN.md). The shipped Mix layout is Mix + Library, not the older Tidy Rack mock.

```sh
npm run build         # typecheck + production build
npm run preview       # serve the production build at http://localhost:4173/ (fixed port)
npm run bot:install   # once; the bot has its own packages
npm run bot:dry       # local broadcast bot without Discord (needs bot:install)
npm test              # automated bot tests, no Discord (needs bot:install and the bot's Node version)
```

Root `npm install` does not install the bot. `npm run bot:dry` or `npm run bot` without `bot:install` fails looking for `ws`. See [bot/README.md](bot/README.md).

`npm run preview` uses a different address from `npm run dev`, and Chrome keeps the library separately for each address, so the preview starts with an empty library.

Contributing (people and coding agents): [AGENTS.md](AGENTS.md) lists the project map and every check, and [CONTRIBUTING.md](CONTRIBUTING.md) explains pull requests. Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## Compatibility and limitations

- **Tested here:** install and production build on macOS arm64, Node 25.6.0, npm 11.8.0. Debug UI self-test in Chrome. Bot dry-run (no Discord) and the automated bot tests (`npm test`).
- **Checked automatically:** CI (`.github/workflows/ci.yml`) runs the build, type-checks, bot tests and dependency audits on Ubuntu with Node 24 for every push to `main`, every pull request and once a week.
- **Not tested in this package:** live Discord, Safari/Firefox, Windows/Linux, long real-music listening sessions, Mixxx key/BPM agreement.
- Beat/key analysis uses [essentia.js](https://github.com/MTG/essentia.js) (AGPL-3.0). Time-stretch uses [signalsmith-stretch](https://github.com/Signalsmith-Audio/signalsmith-stretch) (MIT).
- Downbeat placement on real music is the main open quality risk. Synthetic loops cannot prove it.
- `web-audio-beat-detector` is listed in `package.json` but is not imported by the app.
- Sunset UI loads fonts from Google Fonts. The debug UI does not.
- The optional Discord bot uses `discord.js` 14.27.0, updated on 2026-10-19 to pick up an `undici` security fix. Live Discord has not been re-tested since.

## Update, remove, and get help

Update by pulling a newer version and running `npm install` again. IndexedDB data (`automix`) and any `bot/.env` you created stay on your machine; they are not in git.

To remove the app, delete the clone. That does not delete Chrome's IndexedDB for the origin you used, or a Discord bot you created in the developer portal.

This is a personal project. Use [GitHub issues](https://github.com/heydavidf/automix/issues) for ordinary bugs. Do not paste bot tokens, `.env` files, or other secrets into issues. For a suspected security problem, use GitHub's private vulnerability reporting on this repository, as described in [SECURITY.md](SECURITY.md).

Copyright (C) 2026 David Finnegan. Licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
