---
version: alpha
name: AutoMix Sunset Desktop
description: Y2K desktop UI - Poolsuite cream window chrome housing Webamp player anatomy on a warm dithered blush wall, System 7 pinstripe title bars, Mac-flat readouts, in the AutoMix sunset palette.

colors:
  cream: "#F4EFE3"
  blush: "#F3C9C5"
  peach: "#E8B4A8"
  primary: "#C2418A"
  on-primary: "#FFFFFF"
  lavender: "#B89FD8"
  amber: "#F0A500"
  paper: "#FBF8EE"
  onyx: "#1C1C1E"
  bevel-light: "#FFFFFF"
  bevel-shadow: "#848484"

typography:
  headline-md:
    fontFamily: Syne
    fontSize: 20px
    fontWeight: "800"
    lineHeight: 24px
    letterSpacing: -0.02em
  body-sm:
    fontFamily: Work Sans
    fontSize: 13px
    fontWeight: "400"
    lineHeight: 18px
  label-xs:
    fontFamily: Space Mono
    fontSize: 11px
    fontWeight: "700"
    lineHeight: 14px
    letterSpacing: 0.15em
  lcd-md:
    fontFamily: Space Mono
    fontSize: 16px
    fontWeight: "700"
    lineHeight: 18px

rounded:
  sm: 2px
  DEFAULT: 2px
  md: 4px
  pill: 12px

spacing:
  unit: 4px
  window-padding: 16px
  chrome-inset: 4px
  rack-width: 400px

components:
  window:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.onyx}"
    typography: "{typography.label-xs}"
    rounded: "{rounded.md}"
    padding: "{spacing.chrome-inset}"
  deck:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.onyx}"
    typography: "{typography.headline-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.window-padding}"
  wave-strip:
    backgroundColor: "{colors.onyx}"
    textColor: "{colors.peach}"
    rounded: "{rounded.sm}"
    height: 48px
  blend-timeline:
    backgroundColor: "{colors.onyx}"
    textColor: "{colors.lavender}"
    typography: "{typography.label-xs}"
    rounded: "{rounded.sm}"
    height: 32px
  track-row:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.onyx}"
    typography: "{typography.label-xs}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
  key-badge:
    backgroundColor: "{colors.lavender}"
    textColor: "{colors.onyx}"
    typography: "{typography.label-xs}"
    rounded: "{rounded.sm}"
    height: 18px
  button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-xs}"
    rounded: "{rounded.sm}"
    padding: 8px 16px
    height: 32px
  lcd-readout:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.onyx}"
    typography: "{typography.lcd-md}"
    rounded: "{rounded.sm}"
    padding: 4px 12px
---

# AutoMix - Sunset Desktop (v2)

## Overview

AutoMix mixes a local music folder like a DJ; the UI frames that machinery as Y2K-era music software you would have loved in 1999. Design brief, verbatim: "the Poolsuite aesthetic with the Webamp functionality and our palette." Everything on screen is a WINDOW: cream beveled chrome, pixel-voice title bars (DECK_A.EXE // ACTIVE), tiny minimize/close furniture, status bars with hardware microcopy. Inside the windows lives Winamp-grade player furniture: marquee track titles, segment-LCD readouts, chunky sliders, tiny transport buttons. The windows float (in the locked Tidy Rack layout, dock) on a blush-to-lavender gradient wall.

The shipped Sunset UI is Mix (`#/`) plus Library (`#/library`), not the Tidy Rack deck stack. Treat Tidy Rack below as identity grammar, not as the current screen map.

Brand personality: a beautiful machine that DJs for you, wearing period-correct software clothes. Playful and era-sincere, never cosplay-grey, never modern-minimal. This v2 replaces a rejected first identity that read as a contemporary instrument panel.

Reference precedents (locked 2026-06-12): Poolsuite FM (the look), Webamp/Winamp 2 (the anatomy), Winamp Skin Museum sunset skins, 98.css (bevel grammar only, recolored), Nightwave Plaza (windows-over-gradient structure), CARI vaporwave index (era mood).

## Colors

`{colors.cream}` is every piece of chrome: windows, menu bar, rail, buttons. The wall behind the windows stays WARM and calm: a smooth 135-degree gradient from `{colors.blush}` down through `{colors.peach}` to a dusty peach-rose (#DE9D9B). Magenta, lavender and anything cool are BANNED from the wall (the v2.0 four-color wall read too busy; a dithered/banded version was trialed and dropped as too noisy); they live purely as accents.

`{colors.primary}` (warm magenta) marks the active: pinstripe tint of the active window's title bar, MIX NOW, active nav states, and LIVE data values (the changing BPM, the bars countdown). `{colors.lavender}` tints secondary title-bar pinstripes (BLEND_CONTROL.BIN). `{colors.bevel-shadow}` grey appears ONLY as bevel edges and inactive pinstripes; it is never a surface fill (the 98.css grey #C0C0C0 is banned outright). `{colors.paper}` with `{colors.onyx}` digits forms every readout; onyx also fills the sunken waveform wells, the only dark territory. `{colors.amber}` is held in reserve for rare data highlights. Contrast intent: onyx on cream/paper is high-contrast everywhere; white-on-magenta only in large button labels.

## Typography

Syne (`{typography.headline-md}`) is the wordmark and the marquee voice: bold, tight, often italic, scrolling in LCD wells. It never drops below 14px. Work Sans (`{typography.body-sm}`) covers the little prose that exists. Space Mono does everything else: `{typography.label-xs}` is the all-caps tracked-out microcopy of title bars, menu words, column heads and status bars (DECK_A.EXE // ACTIVE, CACHE WARM), and `{typography.lcd-md}` renders LCD digits. If in doubt, set it in Space Mono small caps. READABILITY FLOOR (2026-06-12 polish): no text below 9px ever, and 9px only for tertiary scale marks; standard microcopy sits at 10-11px. Period density comes from tracking and uppercase, not from shrinking type.

## Layout

4px base unit; the chrome is tight (this is 1999 software, not an airy dashboard). A thin fixed menu bar (32px, cream, beveled bottom edge) holds the wordmark, menu words, master BPM/key LCDs and a retro clock. A narrow cream icon rail (64px) sits on the left edge with section shortcuts. The workspace is the wall.

The locked identity layout is the **Tidy Rack**: a centered 400px column where windows dock edge-to-edge like Winamp's classic deck+EQ+playlist stack: Deck A window, Blend window, Deck B window, sharing borders. Library and Queue screens follow the same discipline: one dominant .EXE window (640-900px) with companion mini-windows docked beside or floating nearby, desktop icons in the corners, generous wall visible around the work.

## Elevation & Depth

Depth is BEVEL LOGIC, borrowed from 98.css and recolored: raised chrome shows a 1px `{colors.bevel-light}` edge top/left and 1px `{colors.bevel-shadow}` bottom/right; sunken wells invert it. Every interactive element is raised at rest and visibly sinks when pressed (bevel inverts + 1px translate). Readouts are FLAT classic-Mac fields (paper fill, 1px onyx outline) - no inner shadow, no glass simulation, no glow; their life comes from the magenta live values, not surface depth. The docked rack lifts off the wall with one soft large shadow; individual docked windows do not shadow each other. A FAINT CRT overlay (1px scanlines every 3px at ~2.5% + a whisper warm vignette) sits over everything - present but never noticeable as an effect. No blur-glass, no soft modern card shadows.

## Shapes

ROUND_FOUR territory, effectively square: chrome and buttons at `{rounded.sm}`, window outer corners at `{rounded.md}`, nothing rounder except rare `{rounded.pill}` status dots. The bevels, not the radii, carry the shape language. v1's soft 8-12px plastic curves are gone.

## Components

**Window** - the core primitive: cream chrome, 2px bevel border, 4px inset, System 7 PINSTRIPE title bar (horizontal racing stripes on cream, tinted by importance: magenta = active, lavender = secondary, bevel-shadow grey = inactive/cued) with the .EXE/.BIN filename microcopy sitting as a cream chip over the stripes, tiny beveled minimize/close squares, optional cream status bar with dimmed microcopy. Don't render content outside a window; don't fill title bars solid.

**Deck** - player furniture inside a window: marquee LCD well with the Syne italic track title scrolling, BPM + Camelot LCD pair, WaveStrip, transport row (tiny beveled squares), one chunky horizontal slider with a beveled thumb. Cued deck dims to 60% with a grayscale marquee. No knob rows, no airy spacing.

**WaveStrip** - sunken onyx well with 4px columns in peach/magenta/lavender. Decorative in the mockup.

**BlendTimeline** - sunken onyx well where a peach ribbon (from left) and lavender ribbon (from right) converge; LCD countdown ("MIX IN 24 BARS") beneath; lives in the BLEND_CONTROL window with MIX NOW + SKIP.

**TrackRow** - playlist row inside a sunken well: alternating cream tints, title + artist, then Space Mono data columns (BPM LCD chip, KeyBadge, 5-segment energy meter, duration). Selected row: peach tint + magenta left edge. Analyzing row: dimmed italic + shimmer.

**KeyBadge** - square Camelot chip: magenta = current key, lavender = harmonic neighbor, peach = stretch pick.

**Button** - beveled and pressable: cream default, magenta primary with white Syne italic label, ghost = cream with label only. Pressed = sunken bevel + 1px travel. Lives inline (toolbars, status bars); never floats.

**LCDReadout** - the signature data primitive, classic-Mac flat: paper field, 1px onyx outline, bold Space Mono digits in onyx; LIVE/changing values (master BPM while mixing, the bars countdown, timers) render in magenta. No glass, no glow, no inner shadow - the period feel comes from the mono digits and the outline, not surface simulation. Master BPM/key live in the menu bar as mini readouts; marquee wells use the same field treatment.

## Do's and Don'ts

Do:
- Put everything inside window chrome with a named pinstripe title bar (DECK_A.EXE voice, title as a cream chip)
- Make every interactive element a bevel that visibly presses
- Keep data in Space Mono microcopy and flat paper readouts; reserve magenta digits for live values; keep Syne for marquees and the wordmark
- Keep the wall a smooth warm gradient (blush to dusty peach); let it breathe around the windows; cream is for chrome only
- Dock windows edge-to-edge in the Tidy Rack discipline; keep the CRT overlay faint (felt, not seen)
- Respect the 9px readability floor; microcopy lives at 10-11px

Don't:
- No modern instrument minimalism: no flat airy panels, no floating knob rows, no OP-1/Braun cleanliness (the rejected v1)
- No magenta, lavender or cool hues in the WALL; the wall is blush-to-peach only (the v2.0 four-color wall was rejected as too busy)
- No glass/glow simulation on readouts (the v2.0 greenish LCD wells were rejected as skeuomorphic)
- No Win98 grey #C0C0C0 surfaces; grey is bevel edges and inactive pinstripes only
- No Pioneer/Serato/rekordbox pastiche, no jog wheels; no Spotify layout
- No dark surfaces beyond the waveform wells
- No FABs, no glassmorphism, no 3D renders, no stock photos, no real artist or track names
- No em-dashes or en-dashes in any copy; plain hyphens

## Responsive Behavior

Desktop-first (Chrome on desktop, like the engine). Below 1024px the Tidy Rack column goes full-width minus the rail; companion windows (MACHINE_PARAMS.EXE) dock below their parent instead of beside. Below 768px the icon rail collapses into the menu bar. LCD digits never shrink below 12px; drop labels before digits.

## Iteration Guide

To add a screen: name its window (SOMETHING.EXE), give it a title bar color by importance (magenta active, lavender secondary, grey passive), put the content in sunken wells inside cream chrome, and dock companions in the rack discipline. New accents extend from the ramp endpoints; amber is the approved spare. To add a primitive: pick its 1999 analog (window, well, LCD, beveled key, slider) and inherit that bevel state language. Resist any instinct to add air, blur or roundness; the period look is tight, square and pressed.

## Known Gaps

- EQ window (Webamp's middle rack unit) designed by implication, not as its own screen
- Empty states (no folder, zero tracks), error states and the EFFECTS/DEVICES sections unexplored
- Icon system is Material Symbols in exports; swap to pixel-style or Lucide at merge time (build backlog)
- Mobile beyond the stacking rules above unexplored
- Desktop icons (Library_v2, Trash) are decorative; no drag/drop behavior designed
