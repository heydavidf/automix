import { useEffect } from 'react';
import { useAppStore } from '../state/store';
import { Desktop, useHashScreen } from './chrome';
import { Mix } from './screens/Mix';
import { Library } from './screens/Library';

/* Sunset Desktop build: the working engine (src/lib + src/state, untouched)
   wearing the design/DESIGN.md identity. Runs at /sunset.html alongside the
   debug UI at /. */
export default function App() {
  const screen = useHashScreen();

  // arrow keys scrub the playing deck ±10s (ignored while typing in a field
  // or mid-blend when both decks play — scrubbing one would break the sync)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      const engine = useAppStore.getState().engine;
      if (!engine) return;
      const playing = engine.decks.filter((d) => d.isPlaying && d.loaded);
      if (playing.length !== 1) return;
      e.preventDefault();
      playing[0].scrub(e.key === 'ArrowRight' ? 10 : -10);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <Desktop screen={screen}>
      {screen === 'mix' && <Mix />}
      {screen === 'library' && <Library />}
    </Desktop>
  );
}
