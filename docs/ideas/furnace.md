# Furnace Tracker

[GitHub](https://github.com/tildearrow/furnace) | [Website](https://tildearrow.org/furnace/) | License: GPL v2+ | Language: C++ + Dear ImGui

## What it is

A modern multi-chip chiptune tracker supporting 50+ sound chips. Most relevant to us: it handles Yamaha FM chips (OPM, OPN, OPLL, OPZ, OPL series) in a tracker context. It's the closest existing reference for "FM synthesis in a tracker UI."

## Architecture

Large C++ codebase organized around:

- `src/engine/`: the audio engine, chip emulation, playback
- `src/gui/`: Dear ImGui-based UI with modular windows
- `src/gui/doAction.cpp`: central action dispatch (GUI_ACTION_xxx enum)
- `src/gui/editing.cpp`: pattern editing logic
- `src/gui/cursor.cpp`: cursor movement
- `src/gui/settings.cpp`: keybinding configuration
- `src/gui/commandPalette.cpp`: command palette (searchable action list)

The action system is notable: `doAction(int what)` is a giant switch over ~250 cases across 2000+ lines. There are roughly 270 `GUI_ACTION_` constants defined. Every keyboard shortcut maps to an action. Actions are configurable, and each can have multiple key bindings stored as bitmask-encoded key combos.

## FM instrument model

This is where Furnace shines for our purposes. FM instruments are defined per-chip:

### Operator parameters (OPN/OPM/OPZ style)

Each FM instrument has 2-4 operators (depends on chip) with:
- **AR** (Attack Rate), **DR** (Decay Rate), **D2R** (Decay 2 Rate, called "Sustain Rate" in some trackers), **RR** (Release Rate)
- **SL** (Sustain Level), **TL** (Total Level)
- **MUL** (Frequency Multiplier), **DT** (Detune), **DT2** (Detune 2, OPM/OPZ-specific)
- **RS** (Rate Scaling), **AM** (Amplitude Modulation enable)
- **SSG-EG** (SSG Envelope Generator mode, OPN-specific)
- **KVS** (Key Velocity Sensitivity)
- OPL-specific: **KSL** (Key Scale Level), **VIB**, **WS** (Waveform Select), **KSR**, **SUS**

Furnace uses the Yamaha convention (D2R) rather than the tracker convention (SR). The operator struct has an `enable` flag per operator, and the `ops` field on the instrument controls how many operators are active (not all FM instruments are 4-op).

### Algorithm + Feedback

The FM algorithm (operator routing) is selected from the chip's algorithm set. OPN has 8 algorithms, OPM has 8, OPL has 2 (for 2-op) or 4 (for 4-op). Each algorithm defines which operators modulate which.

### The FM editor UI

Furnace displays FM params in a grid:

```
OP1    OP2    OP3    OP4
AR  31  AR  31  AR  31  AR  31
DR  00  DR  00  DR  00  DR  00
SR  00  SR  00  SR  00  SR  00
RR  07  RR  07  RR  07  RR  07
SL  00  SL  00  SL  00  SL  00
TL  00  TL  32  TL  00  TL  00
MUL 01  MUL 02  MUL 01  MUL 04
DT  00  DT  00  DT  00  DT  00
```

Operators are displayed side-by-side (like the M8's FM Synth view and our instrument view). The algorithm is shown as a visual routing diagram.

## The macro system

Furnace's most powerful feature for FM. Per-instrument macros automate any parameter over time:

- **Volume macro**: controls TL over the note's lifetime
- **Arpeggio macro**: pitch sequences (chords, arpeggios, bass patterns)
- **Duty/Noise macro**: for square wave chips
- **Wave macro**: wavetable selection over time
- **FM operator macros**: per-operator AR, DR, SR, RR, SL, TL, MUL, DT automation
- **Algorithm macro**: change the FM algorithm over time
- **Feedback macro**: change feedback over time

Each macro has: up to 256 values, a length, loop point, release point, delay (ticks before starting), and speed (can run at sub-tick rates). Macros are far more extensive than described above. There are **20 parameters per operator** that can be automated, plus global macros for pitch, panning (L+R), phase reset, and LFO sensitivity (FMS/AMS).

This is essentially what modulation envelopes do in our architecture (LFOs routed to parameters), but Furnace's approach is more flexible. Any parameter can have an arbitrary automation shape of up to 256 steps, not just periodic waveforms. The speed/delay controls allow macros to run faster or slower than the main tick rate.

## Effect commands

Furnace has chip-specific effects alongside standard tracker effects:

### Standard (all chips)
- 0xy: Arpeggio
- 1xx/2xx: Pitch slide
- 3xx: Portamento
- 4xy: Vibrato
- 08xx: Set panning
- ECxx: Note cut
- EDxx: Note delay

### FM-specific (varies per chip; these are OPM examples)
- 11xx: Set feedback
- 12xx-15xx: Set operator 1-4 TL (total level)
- 16xy: Set multiplier (operator x, value y)
- 17xx: Set LFO speed
- 18xx: Set LFO waveform
- 19xx: Set attack rate (all operators)
- 1Axx-1Dxx: Set attack rate per operator
- 50xy-5Fxx: Set operator params (AM, SL, RR, DT, RS, DT2, DR, D2R)
- 60xy: Operator mask
- 61xx: Set algorithm

**Important**: FM effects are **chip-specific**, not universal. Different Yamaha chips (OPM, OPN, OPL, OPZ) have different effect layouts and different available parameters. The 10xx-1Fxx range is not a clean "operator params" block. It is a mix of chip-level and operator-level functions that vary by chip family. Many operator params are actually in the 50xx-5Fxx range.

The FM effects let you change operator parameters on individual steps, which maps to our "parameter locks" concept. The difference is that Furnace uses effect commands in the FX column, while Elektron boxes use dedicated param lock columns.

## Multi-chip support

A Furnace song can use multiple chips simultaneously. Each chip provides a set of channels. The pattern editor shows all channels from all chips in a single scrollable grid. Channel types are color-coded (FM channels, PSG channels, sample channels).

This is relevant if we ever want helm-audio to support multiple synthesis types beyond FM. The architecture of "one pattern grid, multiple engine types" is proven.

## Keyboard shortcuts

Furnace uses configurable keybindings with sensible defaults:

- Standard tracker note entry (two-row piano keyboard)
- Spacebar: toggle edit mode
- Enter: play/stop toggle (NOT "play from cursor"; Shift+Enter is play from cursor)
- F5: play from beginning (only F5 is bound by default; F6/F7/F8 are unbound, unlike IT/Schism)
- Ctrl+Z/Y: undo/redo
- Ctrl+C/V/X: copy/paste/cut (modern conventions, not Alt+C/P like IT)
- Ctrl+Enter: step one row (useful for debugging)
- Command palette (Ctrl+P): multi-mode fuzzy search supporting actions, recent files, instruments, samples, instrument change, and add chip

Furnace breaks from the IT/Schism F5-F8 transport convention. Enter as play/stop toggle is its primary transport control.

## Inspiration for helm-audio

- **The FM operator grid layout** validates our instrument view approach. Operators are shown side by side with per-operator params.
- **The macro system** is more powerful than our LFO-based modulation. We could consider per-instrument parameter automation curves (not just periodic LFOs)
- **FM-specific effect commands** are chip-specific (often split between 1x and 5x ranges, depending on target chip) and show how to expose FM params in the FX column
- **The algorithm visualization**: drawing the operator routing as a diagram, not just a number
- **Configurable keybindings**: Furnace lets users rebind everything. Our action system is the foundation for this
- **Command palette**: a modern UX pattern that makes a complex app discoverable. Worth adding once we have enough actions
- **Per-instrument macros** vs **per-step effect commands**: two approaches to parameter animation. Macros are more ergonomic for repeating patterns, and effects are more precise for one-off changes. We could support both.
- **FM preview system**: Furnace has `fmPreview.cpp` that uses actual chip emulation cores (Nuked OPN2, OPM, OPL3) to preview instruments in real-time. For our WASM voice worklets, we could preview patches by sending a test note directly to the voice
- **Macro speed/delay**: macros can run faster or slower than the tick rate and have a configurable start delay. This is more expressive than just "runs at tick rate"
- **Multi-bind keybindings**: each action can have multiple key combinations, not just one. Worth supporting from the start
