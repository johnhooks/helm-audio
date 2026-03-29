# FastTracker 2 Clone

[GitHub](https://github.com/8bitbubsy/ft2-clone) | [Downloads](https://16-bits.org/ft2.php) | License: BSD 3-Clause | Language: C + SDL2

## What it is

A highly accurate clone of FastTracker 2 (1994, Triton/Starbreeze). FT2 was the dominant tracker on PC in the 90s and defined the XM format. The clone is by 8bitbubsy, partly based on original FT2 source code (with permission). The replayer is a direct port from the original Pascal/ASM.

## Architecture

Clean C with SDL2. Key source files:

- `ft2_keyboard.c`: scancode-to-note translation, modifier handling
- `ft2_pattern_ed.c`: pattern editor logic (cursor, editing, navigation)
- `ft2_pattern_draw.c`: pattern rendering
- `ft2_edit.c`: note entry, step editing
- `ft2_inst_ed.c`: instrument editor (envelopes, sample mapping)
- `ft2_sample_ed.c`: sample editor with waveform display
- `ft2_replayer.c`: the XM playback engine (direct port from original)

The keyboard handler uses a lookup table (`scancodeKey2Note[52]`) mapping USB scancodes to note values 1-29 (two octaves). Notes are offset by `editor.curOctave * 12`. Capslock or backslash = note off.

## The editing model

### Cursor-centric

Unlike IT's edit mask, FT2 has a strict cursor position. The cursor is on exactly one sub-field: note, instrument digit 1, instrument digit 2, volume digit 1, volume digit 2, effect letter, effect param digit 1, effect param digit 2. What you type depends entirely on which sub-field the cursor is on.

### Field layout per channel

```
Note  Inst  Vol  Eff  Param
C-5   01    40   0    37
```

The volume column is a dedicated column (not part of the effect system). Values 10-50 set volume directly (0-64). Values 60+ encode volume-column effects (slide up/down, vibrato, panning, portamento); 00-0F is empty.

### Navigation

FT2 navigation differs significantly from IT:
- Arrow keys always move by 1 row (no skip-value navigation)
- Tab/Shift+Tab moves between channels
- F1-F7 select absolute octave in ft2-clone defaults. This is fundamentally different from IT's numpad *// relative controls.
- Home/End jump to top/bottom of pattern (no modifier needed)
- PgUp/PgDn moves by 16 rows (hardcoded, not configurable)
- Backtick (grave) cycles the edit step value 0-16
- CapsLock or backslash inserts a note-off

### Pattern length

FT2 patterns can be 1-256 rows (IT only supports up to 200). Each pattern can have a different length.

## What makes FT2 unique

### Multi-sample instruments

An FT2 instrument is a container with:
- Up to 16 samples
- A per-note sample mapping (`note2SampleLUT[96]`): each of 96 notes independently maps to one of the 16 samples. This is a per-note lookup table, not a range-based split.
- Volume and panning envelopes (breakpoint, up to 12 points each)
- Auto-vibrato (type, sweep, depth, rate). This is a separate modulation feature, not an envelope.
- Fadeout value (controls how quickly volume decays after note-off)

The per-note mapping lets you build multi-sampled instruments where every note can independently point to a different sample.

### The volume column

FT2 pioneered a dedicated volume column per channel. It's encoded as a single byte with ranges determining the function:

| Range | Meaning |
|-------|---------|
| 00-0F | empty |
| 10-50 | Set volume (0-64) |
| 60-6F | Volume slide down |
| 70-7F | Volume slide up |
| 80-8F | Fine volume down |
| 90-9F | Fine volume up |
| A0-AF | Set vibrato speed |
| B0-BF | Vibrato depth |
| C0-CF | Set panning |
| D0-DF | Panning slide left |
| E0-EF | Panning slide right |
| F0-FF | Portamento to note |

This is brilliant because volume changes are extremely common. In PT, if you want a volume slide while also doing portamento, you cannot do both because there is only one effect column. FT2's volume column means you always have volume/panning control available without sacrificing the main effect column.

### Visual design

FT2 has a distinctive GUI with graphical buttons, scope displays, and a different aesthetic than the text-mode IT. The pattern view uses colored columns and has real-time scopes per channel. The instrument editor has graphical envelope drawing.

### The "nibbles" mini-game

FT2 includes a Snake clone as an easter egg (`ft2_nibbles.c`). A reminder that trackers were made by the demoscene for the demoscene.

### Breakpoint envelopes

FT2 instruments have volume and panning breakpoint envelopes with up to 12 (tick, value) points connected by linear segments. Each envelope has a sustain point (holds while note is held), loop start/end (for repeating sections), and an enable flag. Envelopes advance per tick, giving them a characteristic stepped quality.

This was revolutionary. ProTracker had no envelopes at all, so you had to manually code volume slides with effects. FT2's envelopes let you build self-contained sounds that evolve over time.

### Linear frequency table

FT2 introduced the linear frequency table alongside the Amiga period system. In linear mode, each semitone is a fixed frequency ratio, making pitch slides sound consistent across the entire range. ProTracker's period system made certain pitch operations non-uniform. Our FM engine already uses linear frequency, so this is not a concern, but the history is still useful context.

## Inspiration for helm-audio

- **Multi-sample instruments** parallel our FM patches. A patch could have different operator configurations for different note ranges.
- **The volume column** is worth considering. It provides lightweight per-step control that does not consume the FX column.
- **Graphical envelopes**: FT2's visual envelope editor is the gold standard for tracker envelope editing. Our instrument view could draw envelope shapes
- **Per-channel scopes**: FT2 shows real-time waveform per channel. We have the track activity indicators; per-track waveforms would be the next step
- **The "add" value** (cursor advance after note entry) is simpler than IT's skip value but still essential
- **The cursor-on-sub-field model** is more straightforward than IT's edit mask for beginners

## Sources

- [ft2-clone — GitHub](https://github.com/8bitbubsy/ft2-clone)
- [ft2-clone project page](https://16-bits.org/ft2.php)
