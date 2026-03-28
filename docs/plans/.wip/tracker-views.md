# Tracker views and visual behavior

How each view converts tracker state into draw commands, and what changes visually in response to user actions and playback.

## Interaction principles (from M8)

These patterns are learned from the M8 manual and apply across every view. They define how the tracker feels, not just how it looks.

### One interaction model everywhere

Direction keys move the cursor. Edit+Direction changes values. Shift+Direction changes pages. This is the entire interaction vocabulary. You learn it once on the pattern page, and it works identically on the instrument page, the mixer page, the table page, and the song page. No page has special navigation rules.

### Edit is a modifier, not a mode

Hold Edit (Alt on keyboard) and press a direction to change a value. You're not in "edit mode" vs "navigate mode" — you're always navigating. Edit temporarily makes the direction keys affect the value under the cursor instead of the cursor position. Release Edit and you're back to navigating. This is more fluid than a toggle.

On the pattern page, note entry is the exception — typing a note key (Z, X, C, etc.) enters data directly. But value fields (velocity, patch index, FX columns) still use Edit+Direction for adjustment or hex digit entry for direct input.

### Empty cells have a default

Press Edit on an empty cell (`--`) and it inserts the last edited or deleted value. You never type a full value from scratch. This makes live entry fast — set one step, then stamp it across other steps with single presses.

### Play works from any view

You don't navigate back to the song view to start playback. Play starts from wherever you are. This means you can edit an instrument, hit Play to hear it, keep editing. The transport is global, not tied to a page.

### Hex everywhere

Values are hex (00-FF). Two digits, consistent width, fits in tight columns. Velocity, patch index, FX parameters — all hex. This matches the M8 and classic tracker conventions. Hex help text at the bottom of the screen shows the decimal equivalent when editing.

### Values change color when non-default

On instrument/mixer/table pages, a parameter that differs from its default value is drawn in a brighter or different color than one at default. This lets you scan a page and immediately see what's been tweaked. Dim = default, bright = changed.

### Context-sensitive shortcuts compound

Modifier combinations create a rich shortcut space from few keys. On a keyboard:
- **Direction**: move cursor
- **Shift+Direction**: change page
- **Alt+Direction**: edit value (large/small step depending on Up-Down vs Left-Right)
- **Alt+Shift**: additional actions (clone, deep copy, etc.)
- **Ctrl+Z/C/V/X**: undo, copy, paste, cut (standard desktop conventions)

### The minimap is always visible

Bottom-right corner shows your position in the view hierarchy. You always know where you are. No hunting through menus.

## Grid dimensions

40 columns × 25 rows. This matches the M8's character grid (40 columns at 8px cell width = 320px native). Every page uses the same grid. No page uses more space than this.

## Common elements

Every page shares these elements in the same positions. They never move.

### Transport status (top-right, every page)

```
Col 30-39, Row 0:
                          T+120
```

Always visible. Shows tempo. During playback, the tempo value pulses or shows a play indicator.

### Track activity indicators (right column, every page)

```
Col 37-39, Rows 2-9:
                          1 ---
                          2 ---
                          3 ---
                          4 ---
                          5 ---
                          6 ---
                          7 ---
                          8 ---
```

Dashes are dim. Active voices light up in accent color. Gives peripheral awareness of which tracks are sounding from any page. Same as M8's track note monitor.

### Page indicator (bottom-right, every page)

```
Col 37-39, Row 23-24:
                          P
                          SPIMT
                          V
```

S = Song, P = Pattern, I = Instrument, M = Mixer, T = Table. Current page letter is highlighted. Navigation: Shift+Left/Right moves between pages.

## Pages

### Pattern editor — main view

The primary view. Row numbers on the left, note/velocity/instrument/effect columns per track, scrollable. Unlike the M8 (which shows one track at a time), we show multiple tracks side by side for a more traditional tracker feel.

```
PATTERN 00                         T+120
 Track 0  Track 1  Track 2       1 ---
                                  2 ---
00|C-2 7F 00 --- --- ---          3 ---
01|--- -- -- --- --- ---          4 ---
02|--- -- -- --- --- ---          5 ---
03|--- -- -- --- --- ---          6 ---
04|C-2 64 00 --- --- ---          7 ---
05|--- -- -- --- --- ---          8 ---
06|--- -- -- G-1 60 01
07|--- -- -- --- --- ---
08|C-2 7F 00 --- --- ---          P
09|--- -- -- --- --- ---          SPIMT
10|--- -- -- E-1 60 01            V
11|--- -- -- --- --- ---
12|C-2 64 00 --- --- ---
13|--- -- -- --- --- ---
14|--- -- -- --- --- ---
15|--- -- -- --- --- ---

Ch 0  Row 00  Oct 4  EDIT
```

**Per-step columns** (M8 convention):
- Note: 3 chars (`C-4`, `F#2`, `---`)
- Velocity: 2 hex chars (`7F`, `--`)
- Instrument/patch: 2 hex chars (`00`, `--`)
- Effect columns: 3 chars each (`ARP`, `---`) — future, maps to our param locks

**Row backgrounds:**
- Major beat (every 4th): slightly brighter background
- Playback row: tinted accent background
- Cursor row: tinted cursor background
- Selection: tinted selection background

**Cursor behavior:**
- Direction: move between steps (Up/Down) and fields within a step (Left/Right)
- Tab: jump to next track (or Option+Left/Right following M8)
- Edit+Up/Down on note column: transpose by octave
- Edit+Left/Right on note column: transpose by semitone
- Edit+Direction on value columns: increment/decrement
- On an empty cell, Edit inserts the last edited value

**Scrolling:** The grid is a window. `top_display_row` advances when the cursor or playback position moves past the visible edge. Optional cursor centering.

**Status bar (bottom row):** Current channel, row, octave, edit mode.

### Instrument view (patch editor)

Follows the M8 instrument editor layout: consistent header, type-specific parameters on the left, mixer sends on the right in fixed positions. The mixer column (AMP, LIM, DRY, sends) is always in the same place regardless of instrument type.

```
INST. 00                          T+120
TYPE   FMSYNTH       LOAD SAVE   1 ---
NAME   kick                       2 ---
TRANSP ON   TBL  TIC 03          3 ---
                                  4 ---
CARRIER      MODULATOR            5 ---
 RATIO 1.00   RATIO 2.00         6 ---
 DETUN 0.00   DETUN 0.00         7 ---
 LEVEL 1.00   LEVEL 0.80         8 ---
 FDBK  0.00   FDBK  0.00
 ATK   0.01   ATK   0.01
 DEC   0.15   DEC   0.10
 SUS   0.00   SUS   0.40
 REL   0.10   REL   0.30

INDEX  3.00         AMP   00     P
FILTER OFF          LIM   CLIP   SPIMT
CUTOFF FF           DRY   C0     V
RES    00           S0    00
ATK    0.001        S1    00
DEC    0.150        S2    00
SUS    0.000        S3    00
REL    0.100
```

**Layout convention (from M8):**
- Row 0: `INST. XX` — instrument number
- Row 1: `TYPE FMSYNTH` + `LOAD SAVE` actions
- Row 2: `NAME` — editable name field
- Row 3: `TRANSP` + table/tic settings (M8 convention, controls per-step behavior)
- Rows 5-13: Synthesis parameters. Carrier left, modulator right. Side by side like the M8's 4 operators but with 2.
- Rows 15-22: Voice-level parameters (index, filter, amplitude envelope) on the left. Mixer parameters (AMP, LIM, DRY, sends) on the right — always in the same position.

**Cursor behavior (M8 convention):**
- Up/Down: move between parameter rows
- Left/Right: move between left and right columns, or between carrier/modulator
- Edit+Up/Down: increment/decrement value by large steps
- Edit+Left/Right: increment/decrement value by small steps
- Edit+Option: reset to default value

**Value display:** Values that differ from defaults are drawn brighter. Default values are dim. You can scan the page and immediately see what's been customized.

**Operator copy/paste (from M8):** When the cursor is in an operator region, Shift+Option copies the operator parameters, Shift+Edit pastes. This lets you quickly duplicate operator settings between carrier and modulator.

### Mixer view (effect buses)

Same interaction model. Label/value pairs, cursor navigates, Edit+Direction changes values.

```
MIXER                             T+120
                                  1 ---
BUS 0  DELAY                      2 ---
 TIME   0.30                      3 ---
 FDBK   0.40                      4 ---
 MIX    0.50                      5 ---
                                  6 ---
BUS 1  REVERB                     7 ---
 FDBK   0.85                      8 ---
 LPFREQ 10000

BUS 2  OVERDRIVE
 DRIVE  0.50                      P
                                  SPIMT
BUS 3  CHORUS                     V
 RATE   0.80
 DEPTH  0.50
 FDBK   0.20
 DELAY  0.50
```

**Layout convention:**
- Each bus gets a header row (`BUS N  TYPE`) followed by its parameters
- Empty buses show `BUS N  (empty)` — Edit on it to add an effect
- The bus type is selectable — Edit+Up/Down cycles through Delay/Reverb/Overdrive/Chorus
- Parameters use the same label/value format as everywhere else

### Table view (modulation/automation)

Per-instrument modulation tables. Maps to our LFO configuration.

```
TABLE 00                          T+120
                                  1 ---
LFO 0                             2 ---
 RATE   4.00                      3 ---
 WAVE   TRI                       4 ---
 DEST   FILTERFREQ                5 ---
 DEPTH  2000                      6 ---
                                  7 ---
LFO 1                             8 ---
 RATE   0.00
 WAVE   SIN
 DEST   ---
 DEPTH  0                         P
                                  SPIMT
                                  V
```

**Layout convention:**
- One section per LFO, same label/value format
- DEST is a selector — Edit+Direction cycles through parameter targets (FilterFreq, Index, Pitch, Send0-3)
- WAVE cycles through waveform types (Sin, Tri, Saw, Sqr)
- Empty (unrouted) LFOs show `---` for DEST

### Song view

Arrangement of patterns. A list of pattern indices in playback order.

```
SONG                              T+120
                                  1 ---
ROW PAT                           2 ---
 00  00                           3 ---
 01  01                           4 ---
 02  00                           5 ---
 03  02                           6 ---
 04  --                           7 ---
 05  --                           8 ---
 06  --
 07  --
 08  --
 09  --                           P
 10  --                           SPIMT
 11  --                           V
 12  --
 13  --
 14  --
 15  --
```

**Layout:** Two-column list — song row number, pattern index. `--` means end of song. Edit+Direction changes the pattern index. Edit on an empty row inserts the last used pattern (M8 default insertion convention).

**Live queueing:** During playback, moving the cursor to a row and pressing a queue key cues that pattern for the next boundary. The transport shows the queued pattern.

## State → draw commands (general pattern)

Every page follows the same rendering logic:

```ts
function drawPage(display: DisplayList, state: TrackerState, now: number) {
    // 1. Common elements (every page, same positions)
    drawTransport(display, state);
    drawTrackActivity(display, state);
    drawPageIndicator(display, state);

    // 2. Page-specific content
    switch (state.currentPage) {
        case Page.Pattern:
            drawPatternView(display, state, now);
            break;
        case Page.Instrument:
            drawInstrumentView(display, state, now);
            break;
        case Page.Mixer:
            drawMixerView(display, state, now);
            break;
        case Page.Table:
            drawTableView(display, state, now);
            break;
        case Page.Song:
            drawSongView(display, state, now);
            break;
    }
}
```

Each `drawXxxView` function:
1. Iterates over the visible content (rows of parameters, pattern steps, etc.)
2. For each row, draws labels in dim text and values in bright text (or brighter if non-default)
3. Highlights the cursor position with accent foreground + tinted background rect
4. Passes `now` to animation functions for cursor pulse, active voice glow, etc.

## Cursor model (M8 convention)

The cursor is always on exactly one editable value. It's represented as:

```ts
interface Cursor {
    row: number;    // which parameter row (or pattern step)
    col: number;    // which column (left/right, or track index)
    field: number;  // sub-field within a cell (pattern: note=0, vel=1, patch=2, fx=3)
}
```

On the pattern view, `col` is the track and `row` is the step. `field` is which part of the step the cursor is on.

On label/value pages (instrument, mixer, table), `col` distinguishes left column from right column (or carrier from modulator), and `row` is the parameter index. `field` is unused.

Navigation (consistent across all pages):
- **Direction keys**: Move cursor between fields
- **Edit + Up/Down**: Increment/decrement value by large steps
- **Edit + Left/Right**: Increment/decrement value by small steps
- **Edit on empty cell**: Insert last edited/deleted value
- **Edit + Option**: Delete/reset to default
- **Shift + Left/Right**: Navigate between pages
- **Shift + Option**: Enter selection mode
- **Option**: In selection mode, copy and exit. Otherwise context-dependent.

## Visual feedback summary

| Event | Visual change | What changes in draw commands |
|-------|--------------|-------------------------------|
| Cursor moves | One value loses highlight, another gains it | 2 cells change fg color |
| Value edited | Value text changes, color brightens if non-default | A few characters change |
| Page switch | Entire screen content changes | Full redraw with new page content |
| Playback advances | One row loses playback bg, next row gains it | ~1 row of cells change bg |
| Pattern scrolls | Grid content shifts | All visible cells redraw |
| Voice becomes active | Track activity dash lights up | 1 character changes color |
| Play/stop | Transport text changes | A few characters |
| Edit on empty cell | `--` becomes a value | Characters + fg color change |

## Dirty tracking

The `requestAnimationFrame` callback checks a dirty flag and an animation timer. State mutations set dirty. Animations extend the animation timer. The frame loop only draws when something needs to change:

```ts
function frame(now: number) {
    requestAnimationFrame(frame);

    if (!dirty && !animating) return;
    dirty = false;

    display.clear();
    drawPage(display, state, now);
    renderer.draw(display);
}
```

During playback, dirty is set every step (~125ms at 120 BPM). During editing, dirty is set on keystrokes. With animations, the frame loop runs at 60fps for the animation duration. When truly idle, no frames are drawn.
