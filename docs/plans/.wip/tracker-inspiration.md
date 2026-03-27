# Tracker inspiration

Research into existing trackers — what they do well, what's relevant for our web-based FM tracker UI.

## Web-based trackers

### BassoonTracker

https://github.com/steffest/BassoonTracker — [live demo](https://www.stef.be/bassoontracker/)

Full Amiga ProTracker clone running in the browser. Plain JS, Canvas rendering, Web Audio. Sample-based (MOD/XM), not FM. The closest existing proof that a tracker grid rendered on Canvas works well in the browser, including on mobile.

What's relevant:
- Canvas rendering approach for the pattern grid — monospace text drawn at fixed cell positions, responsive scaling
- Keyboard handling for note entry and navigation
- Web Audio integration pattern (high-level approach that keeps audio stable even when UI slows down)
- Module format loading from The Mod Archive API

### Efflux Tracker

https://github.com/igorski/efflux-tracker — [live app](https://www.igorski.nl/apps/efflux)

Browser-based tracker in Vue + TypeScript. The closest architectural analog to what we're building — it drives oscillator-based synthesis, not samples. Uses Web Audio OscillatorNodes and PeriodicWave.

What's relevant:
- Dual interface: tracker grid for sequencing, piano roll/loop view for intuitive editing
- Per-channel effects routing through a modular signal path
- MIDI controller support
- Local and cloud project storage
- Shows that a synthesis-driven (not sample-based) tracker works in the browser

Our engine approach is different (WASM C++ vs JS oscillators), but the UI concepts carry over.

### Sonant Live

https://sonantlive.bitsnbites.eu/

Minimalist online tracker. Tiny codebase. Uses Canvas and typed arrays.

What's relevant:
- Demonstrates how little UI surface a tracker actually needs to be functional
- Good reference for what the absolute MVP looks like

## FM-specific trackers (native)

### Furnace Tracker

https://github.com/tildearrow/furnace

Open source (GPL), C++ with Dear ImGui. Multi-system chiptune tracker supporting YM2612 (Genesis), YM2151, OPL, OPN, OPM, OPZ, and dozens of other FM and non-FM chips. This is the single most relevant native reference for our project.

What's relevant:
- **FM instrument editor** — visual algorithm diagrams showing operator routing, per-operator controls for ratio, level, feedback, envelope. Adapts to the chip type being used.
- **Per-operator macro tabs** — automate individual FM parameters over time (equivalent to our LFO routing, but more general)
- **Per-channel oscilloscope views** — real-time visualization of each track's output
- **Pattern view** as the central workspace, with the most flexible layout of any tracker (floating windows, fully rearrangeable)
- **Macro/envelope editors** for every parameter — visual curves that show how a parameter changes over a note's lifetime

The FM patch editor is the gold standard. When we build our patch sidebar, Furnace's instrument editor is the primary reference for how to present 2-op FM parameters visually.

### DefleMask

https://www.deflemask.com/

Closed source, free. Multi-platform chiptune tracker focused on FM chips — Genesis (YM2612), Master System, Game Boy, NES. Clean, straightforward UI.

What's relevant:
- FM algorithm visualization in the instrument editor — shows how operators connect
- Operator editing with sliders and knobs (radial vs vertical interaction modes)
- The [manual PDF](https://www.deflemask.com/manual.pdf) documents the instrument editor UI patterns well
- Simpler than Furnace, which makes it a better reference for a first-pass FM editor

## Modern / minimal trackers

### Dirtywave M8

https://dirtywave.com/

Hardware tracker running on a Teensy with a tiny display. Not open source, but hugely influential for interaction design. Has a **4-op FM synth engine** with 12 algorithms, wavetable, virtual analog, and sample playback.

What's relevant:
- **Hierarchical page navigation** — Song → Chain → Phrase → Instrument → Table. Going right zooms into more detail, going left zooms out. Elegant information architecture for a complex system.
- **Extreme UI constraint** — proves a tracker can be fully functional with 8 buttons and a small screen. Every interaction is considered.
- **FM engine design** — per-operator feedback, waveform selection, frequency ratios. Very similar to our voice model. 4-op with 12 algorithms, which is where we'd go if we expand beyond 2-op.
- **"Headless" mode** — the engine runs over USB, any device can be the display. Interesting model for decoupled engine/UI, which is essentially what we have (WASM engine in AudioWorklet, UI on main thread).

### WaveTracker

https://github.com/squiggythings/WaveTracker — [site](https://wavetracker.org/)

Open source (C#/Monogame), wavetable synthesis. Based on Famitracker's UI patterns combined with pxTone Collage's audio approach.

What's relevant:
- **Wave drawing editor** — draw 8-bit waveforms visually, up to 100 per song. Interesting interaction model for sound design.
- **Instrument macro system** — up to 100 macros automating any parameter. Visual envelope/curve editors for each macro. This is a good reference for how we might visualize LFO routing and parameter lock automation.
- **Built-in oscilloscope and piano roll visualizer** alongside the tracker grid

### Schismtracker

https://github.com/schismorg/schismtracker — cloned locally at `../schismtracker`

Open source Impulse Tracker clone. C, SDL. The codebase is a deep reference for how a traditional tracker handles every UI detail.

What's relevant:
- **Character-grid rendering** — 80×50 cell grid, everything drawn as 8×8 bitmap font characters. Maps directly to our Canvas approach with monospace text at fixed cell positions.
- **Page-based architecture** — distinct pages for pattern editor, sample list, instrument editor, order list. Each page has its own draw function, key handler, and widget set.
- **Pattern editor cursor model** — position within a cell (note, instrument, volume, effect columns) tracked as a sub-field index. Arrow keys move between sub-fields, tab jumps to next track.
- **Edit masks** — selective copy/paste of only certain fields (notes, instruments, volumes, effects). Toggled with comma key, shown at bottom of screen.
- **Multiple zoom levels** — track display width adapts from 13 columns (5 channels visible) down to 1 column (64 channels visible). Each zoom level has its own rendering function.
- **Selection system** — rectangular block selection (first_channel/last_channel × first_row/last_row). Copy/paste with overwrite, insert, and mix modes.
- **10-level undo** — pattern snapshots stored on each edit
- **16-color palette system** — row highlighting uses background colors to distinguish current row, playing row, major/minor beat highlights, and selection

## Patterns that keep showing up

These concepts appear across almost every tracker we studied:

**Canvas/character-grid rendering** — BassoonTracker proves it works in the browser. Schismtracker uses 80×50 characters. We'll do the same on Canvas with monospace text at fixed cell widths.

**Page-based navigation** — Every tracker separates pattern editing, instrument/patch editing, and arrangement into distinct views. M8 does it hierarchically, Schismtracker uses function keys, Furnace uses floating windows. For our MVP, function-key page switching is simplest.

**FM patch editor needs visual feedback** — Furnace and DefleMask both show operator routing visually. For our 2-op voice this is a simple carrier←modulator diagram, but it should show the signal flow. When we add more operators, algorithm diagrams become essential.

**Edit masks from day one** — Schismtracker's selective copy/paste (only notes, only velocities, only effects) is a power-user feature that's easy to build early and painful to retrofit. Our param lock system makes this natural — each field in a step is already a separate concern.

**Macro/automation visualization** — WaveTracker and Furnace both have strong per-parameter envelope editors. For us this maps to LFO routing visualization and potentially a future macro system beyond what LFOs provide.

**Keyboard-first, mouse-optional** — Every tracker is keyboard-driven. Mouse support exists but is secondary. Our keyboard mapping should follow FT2/Renoise conventions since those are what most tracker users expect.

**Dual zoom: rows and tracks** — Schismtracker's independent row scroll and channel scroll is universal. Visible area is always a window into a larger grid. Virtual scrolling is essential.
