# AutoMix

Browser auto-DJ. Two UIs share one engine. Keep them separate.

- **Sunset player** at `src/sunset/` + `sunset.html`: the product UI. `npm run dev`, open `/sunset.html`. It imports `src/lib` and `src/state` read-only.
- **Debug / lab UI** at `src/` + `index.html`: extra controls for proving audio behavior. Same server, open `/`.
- **Broadcast bot** at `bot/` (own `package.json`, Node only): localhost WebSocket from `src/lib/engine/broadcast.ts`. `npm run bot` needs `bot/.env`; `npm run bot:dry` does not. Never import `bot/` from `src/`.
- The bot accepts only the player's own addresses (`PLAYER_ORIGINS` in `bot/src/index.ts`). They must match the fixed ports in `vite.config.ts`: 5173 for `npm run dev`, 4173 for `npm run preview`. Change both together.
- The bot checks every text message in `parseMessage` (`bot/src/index.ts`). A new message type needs a case there and a test in `bot/test/messages.test.ts`.

## Engine-first

1. Audio logic lives in `src/lib`. Both UIs import it. Do not fork engine code into `src/sunset/`.
2. Prove new behavior in the debug UI first (`src/components/`, utilitarian controls).
3. Skin it in Sunset only after it works.

Do not restyle the debug UI from `design/DESIGN.md`. Sunset is where the identity lives.

## Checks

Run these from the repository root before saying a change is done. CI (`.github/workflows/ci.yml`) runs the same commands on every push to `main`, on every pull request and once a week.

```sh
npm ci --ignore-scripts
npm --prefix bot ci --ignore-scripts
npm run build                          # type-check and production build of the app
npx tsc --noEmit -p bot/tsconfig.json  # type-check the bot and its tests
npm test                               # bot tests: dry-run bot on a spare port, no Discord
npm audit --omit=dev --audit-level=high
npm --prefix bot audit --omit=dev --audit-level=high
bash .github/tripwire.sh main          # use your change's base commit in place of main
```

`npm test` needs the bot's packages (`npm --prefix bot ci` or `npm run bot:install`) and the same Node version as the bot itself (see `bot/README.md`), because Node runs the TypeScript test files directly. CI uses Node 24.

Manual checks, not automated yet:

- `window.__automixSelfTest()` in the debug UI (and Sunset, same helper) analyzes a synthetic 124 BPM / A minor loop. Expect BPM ≈ 123.93 and Camelot 8A.
- After `npm run bot:install`, `npm run bot:dry` should listen on `ws://127.0.0.1:8765` without a Discord token. Set `WS_PORT` to try another port (the player itself always connects to 8765). Root `npm install` does not install bot packages.
- Missing File System Access API must tell the user to use Chrome.

## Working rules

1. A bug fix ships with a committed test that fails on the old code and passes on the new. A one-off check in a temporary folder does not count. Bot tests live in `bot/test/` and use Node's built-in test runner, with no extra packages.
2. Run every check above before saying done, and quote the output.
3. Do not silence a check to get green: no lint or type-check suppression comments, no skipped tests. The tripwire fails the build unless the line says `tripwire-allow` with a reason.
4. Stop any server you started (`npm run dev`, `npm run preview`, the bot). Leave no stray files (caches, scratch folders, databases, `dist/`) in the repository folder.
5. For non-trivial changes, the maintainer has a different agent write an independent scenario test before accepting the change. Contributors do not need to arrange this.
6. Do not commit `bot/.env`. Do not use real Discord credentials in tests; the tests run the bot with `--dry-run`.
