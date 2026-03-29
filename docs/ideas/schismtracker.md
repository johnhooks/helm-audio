# SchismTracker (Impulse Tracker clone)

[GitHub](https://github.com/schismtracker/schismtracker) | [Wiki](https://github.com/schismtracker/schismtracker/wiki) | License: GPL v2 | Language: C + SDL

## What it is

A cross-platform reimplementation of Impulse Tracker (1995-1998, Jeffrey Lim). IT was the most advanced DOS tracker, and SchismTracker preserves its interface and behavior with pixel-perfect accuracy. It's the definitive reference for the IT editing model.

## Architecture

The codebase is organized around "pages." Each screen is a separate module:

- `page_patedit.c`: pattern editor (the main editing view)
- `page_instruments.c`: instrument list
- `page_samples.c`: sample list
- `page_orderpan.c`: order list and channel panning
- `page_info.c`: song variables and play info
- `page_message.c`: message editor
- `keyboard.c`: all key-to-action translation
- `player/`: the IT format replayer

The `keyboard.c` file is the single point of key translation. It converts SDL scancodes to notes, hex digits, and effect characters. Every page then handles events through its own key handler.

## The editing model

### Edit mask

IT's most distinctive editing feature. A bitmask controls which fields are *carried along* when you enter a note. Press comma to toggle the current field in/out of the mask. The note field is always written (immutable), so you cannot toggle it. Instrument, volume, and effect can each be toggled: when masked in, they carry their previous values with the note; when masked out, they are left untouched.

This is subtly different from "preventing entry." The cursor position still determines where you're editing. The mask determines what "comes with" a note when you type one. It is about workflow efficiency. You can enter a stream of notes and have them all inherit the same instrument/volume without retyping it, or toggle instrument off so notes reuse whatever instrument was already there.

### Skip value

Alt+0 through Alt+9 sets how many rows the cursor advances after entering data. Alt+9 maps to 16 (not 9). Alt+0 does not mean "don't move." It changes the cursor to advance **horizontally** to the next channel instead of down, wrapping to the next row at the last channel. This is a unique navigation mode that enables rapid multichannel entry.

For arrow key navigation (not data entry), skip_value=0 means move by 1 row.

### Field layout per channel

Each channel shows: `Note Instrument Volume Effect+Param`

```
C-5 01 v64 J37
```

The volume column accepts both volume values (v00-v64) and volume-column effects (Ax, Bx, Cx, etc. for slides and vibrato). This dual-purpose column is an IT innovation.

### Navigation

- Arrow keys move by skip value (not by 1)
- Ctrl+Home/End moves by 1 row (the opposite of what you'd expect)
- Tab/Shift+Tab jumps between channels (to the note column)
- Home cycles: start of column → start of line → start of pattern
- PgUp/PgDn moves by highlight major (usually 16 or 4 rows)

### Block operations

Alt+B/E marks block start/end. Alt+L marks whole column or whole pattern (cycles). Shift+arrows for quick marking. Alt+C/P/Z for copy/paste/cut. Alt+Q/A for semitone transposition (Shift for octave). These are classic IT-style tracker block operations.

## What makes IT/Schism unique

### New Note Actions (NNA)

When a new note triggers on a channel that's already playing, IT does not just cut the old note. NNA controls what happens: cut, continue, note-off, or fade. This enables polyphonic-like behavior from a single channel, where old notes can ring out while new ones start.

The S73-S76 effects control NNA per-step, and instruments have a default NNA setting.

### Instrument envelopes

IT has volume, panning, and pitch envelopes per instrument, each with loop points, sustain points, and up to 25 nodes. Envelopes can be toggled on/off per-step with S77-S7C effects. The pitch envelope can act as a filter envelope when the instrument has resonant filters enabled.

### Resonant filters

Each instrument can have a resonant low-pass filter with cutoff and resonance. The filter state is per-channel, not global. The Zxx effect (MIDI macro) controls the filter cutoff in real-time.

### Effect system

35 effects (A-Z plus special characters), many with sub-commands. The S effect alone has 16 sub-effects (S0x through SFx). Effects are entered as a letter + two hex digits.

## Inspiration for helm-audio

- The **edit mask** concept maps directly to our `EditMask` in TrackerState. We already have this model. Note that the note field is immutable in the mask.
- The **skip value** (Alt+0-9) is more flexible than a fixed step size. The horizontal-advance mode (skip=0) is clever for multichannel work.
- **NNA + Past Note Actions + Duplicate Check**: three layers of voice management. NNA controls what happens to the old note, PNA controls already-backgrounded notes, DCT/DCA catches specific duplicates. Directly relevant to our voice worklet lifecycle.
- The **volume column** dual-purpose design (volume value OR volume effect) is space-efficient
- The **page-based navigation** (F2=pattern, F3=samples, F4=instruments) is the IT convention, not universal. FT2 uses Ctrl+letter instead. We should pick our own mapping.
- The **helptext files** are a great documentation pattern. They use one file per page with inline key references.

## Sources

- [SchismTracker — GitHub](https://github.com/schismtracker/schismtracker)
- Local source reference: `/home/hooks/Projects/schismtracker/`
