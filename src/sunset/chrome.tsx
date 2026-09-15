import { useEffect, useState, type ReactNode } from 'react';
import { useAppStore } from '../state/store';
import { formatCamelot } from '../lib/analysis/camelot';
import type { CamelotKey } from '../lib/analysis/types';

export const APP_VERSION = 'V0.5';

/* Sunset Desktop chrome, ported from design/prototype/src/components/Chrome.tsx.
   Nav is a tiny hash router (no dependency): #/ mix, #/library. */

export type Screen = 'mix' | 'library';

export function useHashScreen(): Screen {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  if (hash.startsWith('#/library')) return 'library';
  return 'mix';
}

const HREFS: Record<Screen, string> = { mix: '#/', library: '#/library' };

export function Lcd({ label, value, live = false, className = '' }: { label?: string; value: string; live?: boolean; className?: string }) {
  return (
    <div className={`lcd-display flex items-center gap-2 px-2 py-0.5 font-label text-[11px] font-bold text-onyx ${className}`}>
      {label && <span className="uppercase opacity-50">{label}</span>}
      <span className={live ? 'lcd-live' : ''}>{value}</span>
    </div>
  );
}

export function KeyBadge({ camelot, tint }: { camelot: CamelotKey | null; tint: 'peach' | 'magenta' | 'lavender' }) {
  const cls = tint === 'magenta' ? 'bg-magenta text-white' : tint === 'lavender' ? 'bg-lavender text-onyx' : 'bg-peach text-onyx';
  return <span className={`${cls} inline-block px-1.5 py-0.5 font-label text-[10px] font-bold`}>{formatCamelot(camelot) || '—'}</span>;
}

export function EnergyMeter({ energy }: { energy: number }) {
  const level = Math.round(Math.min(1, Math.max(0, energy)) * 5);
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={`inline-block h-2.5 w-1 ${i < level ? 'bg-magenta' : 'bg-onyx/10'}`}></span>
      ))}
    </span>
  );
}

export function TitleBarButtons() {
  return (
    <div className="flex gap-1">
      <span className="flex h-4 w-4 items-center justify-center bg-cream text-[11px] leading-none text-onyx retro-bevel-out">-</span>
      <span className="flex h-4 w-4 items-center justify-center bg-cream text-[11px] leading-none text-onyx retro-bevel-out">x</span>
    </div>
  );
}

export function Window({
  title,
  variant = 'active',
  icon,
  statusLeft,
  statusRight,
  children,
  className = '',
  docked = false,
}: {
  title: string;
  variant?: 'active' | 'secondary' | 'inactive';
  icon?: string;
  statusLeft?: string;
  statusRight?: ReactNode;
  children: ReactNode;
  className?: string;
  docked?: boolean;
}) {
  return (
    <div className={`window-chrome ${docked ? 'border-t-0' : ''} ${className}`}>
      <div className="title-bar mb-1 flex items-center justify-between px-2 py-1" data-variant={variant}>
        <span className="title-text flex items-center gap-1 font-label text-[11px] tracking-wider uppercase">
          {icon && <span className="material-symbols-outlined text-[11px]">{icon}</span>}
          {title}
        </span>
        <TitleBarButtons />
      </div>
      {children}
      {(statusLeft || statusRight) && (
        <div className="mt-1 flex items-center justify-between gap-2 border-t border-bevel-shadow bg-cream p-1">
          <span className="font-label text-[10px] tracking-tighter uppercase opacity-70">{statusLeft}</span>
          {statusRight}
        </div>
      )}
    </div>
  );
}

/** Live master readouts: the active (or only) deck's effective BPM + key. */
function useMasterReadout(): { bpm: string; camelot: string } {
  const [out, setOut] = useState({ bpm: '—', camelot: '—' });
  useEffect(() => {
    const id = setInterval(() => {
      const { engine, analyses, autodjSnap } = useAppStore.getState();
      if (!engine) return;
      const activeId = autodjSnap?.activeDeck ?? (engine.deckB.isPlaying && !engine.deckA.isPlaying ? 'B' : 'A');
      const deck = engine.deck(activeId);
      const a = deck.loaded ? analyses[deck.loaded.fileKey] : null;
      if (!a?.bpm) {
        setOut({ bpm: '—', camelot: '—' });
        return;
      }
      const rate = deck.timeline.rateAt((deck.stretch.context as AudioContext).currentTime) || 1;
      setOut({ bpm: (a.bpm * rate).toFixed(1), camelot: formatCamelot(a.camelot) || '—' });
    }, 250);
    return () => clearInterval(id);
  }, []);
  return out;
}

function useClock(): string {
  const [now, setNow] = useState('');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const h = d.getHours() % 12 || 12;
      const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
      setNow(`${h}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`);
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function MenuBar({ screen }: { screen: Screen }) {
  const master = useMasterReadout();
  const clock = useClock();
  const items: { label: string; to: Screen | null }[] = [
    { label: 'Mix', to: 'mix' },
    { label: 'Library', to: 'library' },
    { label: 'Effects', to: null },
    { label: 'Devices', to: null },
  ];
  return (
    <header className="fixed top-0 z-[100] flex h-8 w-full items-center justify-between border-b-2 border-white border-b-bevel-shadow bg-cream px-2 shadow-sm">
      <div className="flex items-center gap-6">
        <a href="#/" className="font-headline text-xl font-black tracking-tighter text-onyx italic no-underline">
          AutoMix
        </a>
        <nav className="hidden gap-4 md:flex">
          {items.map((it) =>
            it.to ? (
              <a
                key={it.label}
                href={HREFS[it.to]}
                className={`px-2 py-0.5 font-label text-[11px] tracking-widest uppercase no-underline transition-colors ${
                  screen === it.to ? 'lcd-display font-bold text-magenta' : 'text-onyx hover:bg-peach hover:text-white'
                }`}
              >
                {it.label}
              </a>
            ) : (
              <span key={it.label} className="cursor-default px-2 py-0.5 font-label text-[11px] tracking-widest uppercase text-onyx opacity-40">
                {it.label}
              </span>
            ),
          )}
        </nav>
      </div>
      <div className="flex h-full items-center gap-4">
        <Lcd label="BPM" value={master.bpm} live className="h-6" />
        <Lcd label="KEY" value={master.camelot} className="h-6" />
        <div className="ml-2 flex items-center gap-1 border-l-2 border-bevel-shadow pl-4 font-label text-[11px] font-bold text-onyx">
          <span className="material-symbols-outlined text-[14px]">schedule</span>
          <span>{clock}</span>
        </div>
      </div>
    </header>
  );
}

export function SideRail({ screen }: { screen: Screen }) {
  const items: { label: string; icon: string; to: Screen | null }[] = [
    { label: 'Mix', icon: 'queue_music', to: 'mix' },
    { label: 'Library', icon: 'library_music', to: 'library' },
    { label: 'EQ', icon: 'equalizer', to: null },
  ];
  return (
    <aside className="fixed top-8 bottom-0 left-0 z-50 flex w-16 flex-col items-center border-r-2 border-white border-r-bevel-shadow bg-cream py-4">
      <div className="mt-10 mb-8 origin-center -rotate-90 transform whitespace-nowrap">
        <span className="font-headline text-xs font-bold tracking-tighter text-onyx">AUTOMIX {APP_VERSION}</span>
      </div>
      <div className="flex w-full flex-col gap-4 px-2">
        {items.map((it) => {
          const active = it.to === screen;
          const inner = (
            <>
              <span className="material-symbols-outlined" style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}>
                {it.icon}
              </span>
              <span className="font-label text-[10px] tracking-widest uppercase">{it.label}</span>
            </>
          );
          return it.to ? (
            <a
              key={it.label}
              href={HREFS[it.to]}
              className={`flex w-full flex-col items-center gap-1 py-2 text-onyx no-underline ${
                active ? 'lcd-display' : 'opacity-80 transition-all hover:bg-peach'
              }`}
            >
              {inner}
            </a>
          ) : (
            <span key={it.label} className="flex w-full cursor-default flex-col items-center gap-1 py-2 text-onyx opacity-30">
              {inner}
            </span>
          );
        })}
      </div>
    </aside>
  );
}

export function Desktop({ screen, children }: { screen: Screen; children: ReactNode }) {
  return (
    <div className="min-h-screen font-body text-onyx">
      <MenuBar screen={screen} />
      <SideRail screen={screen} />
      <main className="ml-16 min-h-screen pt-8">{children}</main>
      <div className="crt-overlay"></div>
    </div>
  );
}

