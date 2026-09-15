# AutoMix

Browser auto-DJ. Two UIs share one engine. Keep them separate.

- **Sunset player** at `src/sunset/` + `sunset.html`: the product UI. `npm run dev`, open `/sunset.html`. It imports `src/lib` and `src/state` read-only.
- **Debug / lab UI** at `src/` + `index.html`: extra controls for proving audio behavior. Same server, open `/`.
- **Broadcast bot** at `bot/` (own `package.json`, Node only): localhost WebSocket from `src/lib/engine/broadcast.ts`. `npm run bot` needs `bot/.env`; `npm run bot:dry` does not. Never import `bot/` from `src/`.

## Engine-first

1. Audio logic lives in `src/lib`. Both UIs import it. Do not fork engine code into `src/sunset/`.
2. Prove new behavior in the debug UI first (`src/components/`, utilitarian controls).
3. Skin it in Sunset only after it works.

Do not restyle the debug UI from `design/DESIGN.md`. Sunset is where the identity lives.

## Checks

- `npm run build` must pass.
- `window.__automixSelfTest()` in the debug UI (and Sunset, same helper) analyzes a synthetic 124 BPM / A minor loop. Expect BPM ≈ 123.93 and Camelot 8A.
- After `npm run bot:install`, `npm run bot:dry` should listen on `ws://127.0.0.1:8765` without a Discord token. Root `npm install` does not install bot packages.
- Missing File System Access API must tell the user to use Chrome.
- Do not commit `bot/.env`. Do not use real Discord credentials in tests.
