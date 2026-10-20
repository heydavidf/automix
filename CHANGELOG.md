# Changelog

Notable changes to AutoMix. Version numbers follow [Semantic Versioning](https://semver.org/). While the version starts with 0, a minor version can change behavior.

## 0.2.0 (2026-10-20)

### Security

- The broadcast bot now accepts connections only from the AutoMix player itself: `http://localhost:5173` or `http://127.0.0.1:5173` (`npm run dev`), and the same addresses on port 4173 (`npm run preview`). Before, any website open in the browser while the bot ran could connect to it and control it: push the player off, make the bot join the Discord voice channel and play the website's own audio there, change the bot's "Listening to" status, or crash it. Refused pages are logged.
- The bot now checks every message from the browser. Malformed messages (broken JSON, `null`, anything that is not an object, unknown types, wrong field types) are rejected and logged. Before, a single `null` message crashed the bot.

### Changed

- `npm run dev` always uses port 5173 and `npm run preview` always uses port 4173. If the port is busy they stop with an error instead of moving to another port. Moving would have broken the bot connection and made your library look empty, because Chrome keeps the library separately for each address.

### Added

- Automated tests for the bot (`npm test`, Node's built-in test runner, dry-run only).
- CI on every push to `main`, every pull request and weekly: build, type-checks, tests, dependency audit, tripwire and secret scan.
- Dependabot updates for the GitHub Actions used by CI.
- `SECURITY.md`, `CONTRIBUTING.md` and this changelog. `AGENTS.md` now lists every check and the working rules for contributors and coding agents.

### Dependencies

- `discord.js` 14.27.0 (with `undici` 6.28.1) in `bot/`, and `music-metadata` 11.16.0, from Dependabot security updates merged on 2026-10-19.

## 0.1.0 (2026-09-15)

First public version.
