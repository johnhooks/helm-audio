# Tracker keybindings research

What's standard, what's expected, and what varies across trackers. There are two major lineages, IT/Schism and FT2, and they differ more than most people expect. This doc tries to be honest about what is truly universal vs what is lineage-specific.

## Truly universal (every tracker does this)

### Note entry — the two-row piano

The single most standardized convention in tracker music. Every tracker since Soundtracker (1987) uses the same layout:

```
Lower octave (current octave):
 S D   G H J          ← black keys
Z X C V B N M         ← white keys
C D E F G A B

Upper octave (current octave + 1):
 2 3   5 6 7   9 0    ← black keys
Q W E R T Y U I O P   ← white keys
C D E F G A B C D E
```

Two rows of the QWERTY keyboard map to two octaves of a chromatic scale. The bottom row (ZXCVBNM) is the lower octave, the top row (QWERTYUIOP) is the upper octave. Sharps/flats on the in-between keys.

This mapping uses **scancodes** (physical key position), not characters. It works regardless of keyboard layout (QWERTY, AZERTY, etc.). Both SchismTracker and ft2-clone confirm this. The mapping is based on `SDL_Scancode`, not `SDL_Keycode`.

The current octave shifts the entire mapping up or down.

### Cursor advance / step size

After entering a note, the cursor advances down by N rows. Every tracker has this. The name and binding varies:
- **"Skip value"** in IT/Schism: Alt+0 through Alt+9 (Alt+9 = 16, not 9)
- **"Add"** / **"Edit step"** in FT2: backtick cycles 0-16
- **"Step"** in M8

### Hex digit entry

On value fields (instrument, volume, effect params), 0-9 and A-F enter hex digits. This is universal. The cursor advances through sub-fields automatically.

### Tab/Shift+Tab for channel navigation

Moves to the next/previous channel's note column. Universal across IT, FT2, and ProTracker.

### PgUp/PgDn for page scrolling

Moves the cursor by a chunk of rows. IT/Schism uses the "row highlight major" value (configurable, often 16). FT2 hardcodes 16 rows. The concept is universal; the amount varies.

## Lineage-specific (IT/Schism vs FT2 differ significantly)

### Special note keys

| Action | IT/Schism | FT2 | ProTracker |
|--------|-----------|-----|------------|
| Clear field | `.` (period) | Delete | Delete |
| Note cut | `1` (produces `^^^`) | ECx effect only | ECx effect only |
| Note off | `` ` `` (backtick) | CapsLock | - |
| Note fade | Shift+`` ` `` | - | - |

These are NOT universal. The doc previously claimed period/1/backtick were standard, but they are IT/Schism conventions. FT2 uses completely different keys.

### Transport

| Action | IT/Schism | FT2 | Furnace |
|--------|-----------|-----|---------|
| Play song | F5 | Right Ctrl | F5 |
| Play pattern | F6 | Right Alt | - (unbound) |
| Play from cursor | F7 | - | Shift+Enter |
| Stop | F8 | Space (if playing) | Enter (toggle) |
| Play/stop toggle | - | - | Enter |

**F5-F8 is NOT universal.** It's an IT/Schism convention. FT2 uses Right Ctrl/Alt/Shift for transport (F1-F8 are octave selectors). Furnace primarily uses Enter as a play/stop toggle with only F5 bound by default.

### Page/view switching

| Action | IT/Schism | FT2 |
|--------|-----------|-----|
| Pattern editor | F2 | Ctrl+E |
| Sample list | F3 | Ctrl+S |
| Instrument list | F4 | Ctrl+I |
| Disk operations | F9 | Ctrl+D |

**F2-F4 is IT/Schism only.** FT2 uses Ctrl+letter because F-keys are heavily used for octave and editor operations instead of page switching. This is a fundamental design split.

### Octave change

- IT/Schism: numpad `*` (up) and `/` (down), or Alt+Home/End
- FT2: F1-F7 set **absolute** octave selection (in ft2-clone defaults), while F8 is used for transpose/editor operations. The core idea is still absolute octave keys, not relative up/down.
- ProTracker: F1-F2 for lower/upper octave selection (only 3 octaves)

### Pattern navigation

| Action | IT/Schism | FT2 | ProTracker |
|--------|-----------|-----|------------|
| Move 1 row | Ctrl+Home/End | Arrow Up/Down | Arrow Up/Down |
| Move by skip | Arrow Up/Down | (no skip nav) | (no skip nav) |
| Move by page | PgUp/PgDn | PgUp/PgDn (16 rows) | - |
| To top of pattern | Ctrl+PgUp | Home | - |
| To bottom | Ctrl+PgDn | End | - |

IT's decision to make arrows move by skip value (not 1) is unusual. FT2's arrows-move-by-1 is more intuitive.

### Record/edit mode

- IT/Schism: No explicit record mode. Notes are always entered if you're on the pattern page and type a note key. There's no "edit mode toggle."
- FT2: Spacebar toggles edit mode. When off, note keys play live but don't write to the pattern. Space also stops playback if playing.
- Furnace: Spacebar toggles edit mode (same as FT2).
- ProTracker (pt2-clone defaults): Space toggles Stop/Edit mode; Right Alt plays song.

### Clearing vs deleting

A key distinction the trackers disagree on:
- IT/Schism: Period (`.`) clears the current field. Delete removes the row and shifts data up. Insert adds an empty row.
- FT2: Delete clears the current field. Shift+Insert inserts a row. Shift+Backspace deletes the previous row (Shift+Delete clears note/vol/effect on the current row).

### Block/selection operations

- IT/Schism: Alt+B/E for block begin/end, Alt+C/P/Z for copy/paste/cut, Ctrl+Backspace for undo
- FT2: Shift+arrows for selection, Alt-based operations for clipboard (not Ctrl+C/V)
- Modern (Furnace, OpenMPT): Ctrl+C/V/X/Z following OS conventions

The trend is toward standard OS keybindings (Ctrl+C/V/X/Z).

## IT/Schism-specific features

### Edit mask

Comma toggles which fields are written when entering a note. The note field is always written (immutable mask). Instrument, volume, and effect can be toggled independently. When you enter a note, the masked fields carry their values from the previous entry. This is unique to IT/Schism. Other tracker lineages do not use this exact model.

Note: the mask is really about what gets *copied along* with the note, not about preventing entry. The cursor position determines where you're editing; the mask determines what "comes with" a note when you type it.

### Skip value = 0 behavior

In IT/Schism, when skip value is 0, the cursor advances to the **next channel** instead of the next row. It moves horizontally, wrapping to the next row at the last channel. This is fundamentally different from "not moving."

### Multichannel editing (Alt+N)

Toggles channels into a mode where notes are entered across all enabled channels simultaneously.

### Past Note Actions vs NNA

IT distinguishes between NNA (what happens to the old note when a new note triggers: cut/continue/off/fade) and Past Note Actions (what to retroactively do with notes that have already been backgrounded: cut/off/fade). This is controlled via S70-S76 effects.

### Duplicate Check (DCT/DCA)

Per-instrument setting that checks if a duplicate note/instrument/sample is already playing on the channel and applies an action (cut/off/fade). More targeted than NNA for preventing note pileup.

## FT2-specific features

### Volume column

A dedicated per-step volume/panning column separate from the main effect column. Encoded as a single byte with ranges determining function (set volume, slide, vibrato, panning, portamento). This gives you two simultaneous effects per step.

### Absolute octave selection

FT2-style trackers use direct octave select keys (typically F1-F7 in ft2-clone defaults) instead of relative octave up/down.

### Note-to-sample mapping

Each instrument has a 96-entry lookup table mapping every note independently to one of 16 samples. It is not range-based. It is truly per-note.

### Copy/paste masks

`copyMask[5]` and `pasteMask[5]` control which fields (note, inst, vol, efx, param) are included in copy/paste operations.

## Modern additions

### Command palette (Furnace)

Ctrl+P opens a searchable list of all actions with fuzzy matching. Actually supports 6 modes: actions, recent files, instruments, samples, instrument change, and add chip. The VS Code pattern applied to a tracker.

### Configurable keybindings (Furnace, OpenMPT)

Every action can have multiple key bindings. Furnace stores them as bitmask-encoded key combos.

### Mouse editing (OpenMPT, Furnace)

Click to place cursor, drag to select, right-click context menus. Classic trackers were keyboard-only. Modern trackers support both.

## What this means for helm-audio

### Must have

1. Two-row piano note entry (scancode-based). This is truly non-negotiable.
2. Cursor advance after note entry with configurable step size
3. Hex digit entry on value fields
4. Tab/Shift+Tab to move between tracks
5. PgUp/PgDn for page scrolling
6. Ctrl+Z for undo
7. Delete to clear a field (FT2 convention). This is generally more intuitive for modern users.
8. Spacebar to toggle edit mode (FT2/Furnace convention)
9. Some form of play/stop control (Enter as toggle is simplest)

### Should have

1. Configurable keybindings. Our action system already enables this.
2. Block selection with Shift+Arrows
3. Ctrl+C/V/X for clipboard (standard OS convention)
4. Octave change with dedicated keys
5. Page/view switching with keyboard shortcuts (our own mapping, not necessarily F-keys)

### Could have

1. Command palette (Ctrl+P). This is modern and discoverable.
2. Edit mask (IT-style). This is powerful but niche, and our EditMask type already exists.
3. Volume column (FT2-style). This is lightweight per-step volume control.
4. Copy/paste masks for selective field copying.
5. Mouse interaction

### Should NOT do

1. IT's "arrows move by skip value". It is too confusing for defaults; arrows should move by 1.
2. Alt-based clipboard (Alt+C/P) as the only option. Always support Ctrl+C/V/X.
3. Fixed keybindings with no way to customize
4. F1-F8 for octave selection (FT2-style). This conflicts with expected F-key behavior on modern systems where F-keys have OS/browser meanings.
