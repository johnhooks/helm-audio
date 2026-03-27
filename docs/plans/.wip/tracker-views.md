# Tracker views and visual behavior

How each view converts tracker state into draw commands, and what changes visually in response to user actions and playback.

The layout conventions follow the M8 tracker: every page is a character grid of labeled values in two columns, the cursor highlights one value at a time, arrow keys navigate between fields, typing edits values. The right column carries mixer/send parameters. A consistent header row shows the page title, instrument number, and transport state. Navigation between pages uses modifier + direction keys.

## Core principle: views are pure functions of state

The view reads the current state and produces draw commands. When state changes, the view produces different commands. The renderer executes them. The structural visual change is instantaneous.

Color-based animations (cursor pulse, active track glow, waveform color breathing) are layered on top of this — see `tracker-animations.md`.

## Grid dimensions

40 columns × 25 rows. This matches the M8's character grid (40 columns at 8px cell width = 320px native). Every page uses the same grid. No page uses more space than this.

## Common elements

### Transport status (top-right, every page)

The M8 shows `T+128` in the top-right corner of every page — the current tempo offset. We show the full transport state:

```
Col 30-39, Row 0:
                          T+120
```

This is always visible regardless of which page is active.

### Track activity indicators (right column, every page)

The M8 shows 8 track activity dashes on the right edge of every page. When a track has an active voice, the dash becomes a bar. We do the same for our tracks:

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

Dashes are dim. Active voices light up in accent color. This gives you peripheral awareness of which tracks are sounding from any page.

### Page indicator (bottom-right, every page)

The M8 shows a small letter grid indicating available pages and the current page (highlighted). We do the same:

```
Col 37-39, Row 23-24:
                          P
                          SCPIT
                          V
```

Where S = Song, C = Chain, P = Phrase (pattern), I = Instrument (patch), T = Table. The current page letter is highlighted. Navigation: Shift+Left/Right moves between pages.

## Pages

### Phrase view (pattern editor) — main view

The primary view. Follows the M8 phrase layout: row numbers on the left, note/velocity/instrument/effect columns per track, scrollable.

```
PHRASE 00                         T+120
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
09|--- -- -- --- --- ---          SCPIT
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

**Scrolling:** The grid is a window. `top_display_row` advances when the cursor or playback position moves past the visible edge. Optional cursor centering.

**Status bar (bottom row):** Current channel, row, octave, edit mode.

### Instrument view (patch editor)

Edits the selected patch's FM parameters. Follows the M8 instrument editor layout exactly: two-column label/value grid, instrument type and name at top, mixer sends on the right.

```
INST. 00                          T+120
TYPE   FMSYNTH       LOAD SAVE   1 ---
NAME   kick                       2 ---
                                  3 ---
CARRIER      MODULATOR            4 ---
 RATIO 1.00   RATIO 2.00         5 ---
 DETUN 0.00   DETUN 0.00         6 ---
 LEVEL 1.00   LEVEL 0.80         7 ---
 FDBK  0.00   FDBK  0.00         8 ---
 ATK   0.01   ATK   0.01
 DEC   0.15   DEC   0.10
 SUS   0.00   SUS   0.40
 REL   0.10   REL   0.30

INDEX  3.00         AMP   00     P
FILTER OFF          LIM   CLIP   SCPIT
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
- Rows 4-12: Synthesis parameters, left column. For our 2-op FM voice: carrier params on the left, modulator params in the middle.
- Rows 14-21: Voice-level parameters (index, filter, amplitude envelope) on the left. Mixer parameters (AMP, LIM, DRY, sends) on the right.

**Cursor behavior:**
- Up/Down: move between parameter rows
- Left/Right: move between left and right columns, or between carrier/modulator
- Edit+Up/Down: increment/decrement value by large steps
- Edit+Left/Right: increment/decrement value by small steps

**Value display:** Parameters show their current value right-justified after the label. The selected value is highlighted in bright text. Labels are dim text. Values change color when they differ from defaults (M8 convention — helps spot what's been tweaked).

**LOAD/SAVE:** Cursor can move to these — activating them loads/saves preset patches. Future feature.

### Mixer view (effect buses)

Shows the 4 effect buses and the global mix. Follows the M8 mixer layout: one section per bus with type and parameters, plus global controls.

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
                                  SCPIT
BUS 3  CHORUS                     V
 RATE   0.80
 DEPTH  0.50
 FDBK   0.20
 DELAY  0.50
```

**Layout convention:**
- Each bus gets a header row (`BUS N  TYPE`) followed by its parameters
- Empty buses show `BUS N  (empty)` — cursor on it to add an effect
- Parameters are label + value, same as the instrument editor
- The bus type is selectable — cursor on the type field, Edit+Up/Down cycles through Delay/Reverb/Overdrive/Chorus

**Cursor behavior:** Same as instrument editor — Up/Down between rows, Edit+direction to change values.

### Table view (modulation/automation)

Per-instrument modulation tables. The M8 table view is a step sequencer for parameter automation — each row can set a target parameter and value. For us, this maps to LFO configuration and possibly future macro/envelope editing.

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
                                  SCPIT
                                  V
```

**Layout convention:**
- One section per LFO, same label/value format
- DEST is a dropdown-style selector — Edit+direction cycles through available parameter targets (FilterFreq, Index, Pitch, Send0-3)
- WAVE cycles through waveform types (Sin, Tri, Saw, Sqr)

This is simpler than the M8's full table view (which has per-step commands). Our LFOs are configured per-patch, not per-step, so the table view is more of a modulation routing page.

### Song view

Arrangement of patterns. The M8 song view shows a grid of chain references per track. For us, it's simpler — a list of pattern indices in playback order.

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
 10  --                           SCPIT
 11  --                           V
 12  --
 13  --
 14  --
 15  --
```

**Layout:** Simple two-column list — song row number, pattern index. `--` means end of song. Cursor moves vertically, Edit+direction changes the pattern index at each row.

This is a future feature — for now, the tracker works with a single pattern.

## State → draw commands (general pattern)

Every page follows the same rendering logic:

```ts
function drawPage(display: DisplayList, state: TrackerState, now: number) {
    // 1. Common elements (every page)
    drawTransport(display, state);
    drawTrackActivity(display, state);
    drawPageIndicator(display, state);

    // 2. Page-specific content
    switch (state.currentPage) {
        case Page.Phrase:
            drawPhraseView(display, state, now);
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
2. For each row, draws labels in dim text and values in bright text
3. Highlights the cursor position with accent foreground + tinted background rect
4. Passes `now` to animation functions for cursor pulse, active voice glow, etc.

## Cursor model (M8 convention)

The cursor is always on exactly one editable value. It's represented as:

```ts
interface Cursor {
    row: number;    // which parameter row (or pattern step)
    col: number;    // which column (left/right, or track index)
}
```

On the phrase view, `col` is the track and `row` is the step. The sub-field within a step (note, velocity, instrument, effect) is a third dimension — the cursor is on a specific field within the cell.

On label/value pages (instrument, mixer, table), `col` distinguishes left column from right column (or carrier from modulator on the instrument page), and `row` is the parameter index.

Navigation:
- **Direction keys**: Move cursor between fields
- **Edit + Up/Down**: Increment/decrement value by large steps
- **Edit + Left/Right**: Increment/decrement value by small steps
- **Shift + Left/Right**: Navigate between pages

This matches the M8 exactly. One modifier for editing, one for page navigation. Direction keys are always navigation within the current page.

## Visual feedback summary

| Event | Visual change | What changes in draw commands |
|-------|--------------|-------------------------------|
| Cursor moves | One value loses highlight, another gains it | 2 cells change fg color |
| Value edited | Value text changes | A few characters change |
| Page switch | Entire screen content changes | Full redraw with new page content |
| Playback advances | One row loses playback bg, next row gains it | ~1 row of cells change bg |
| Pattern scrolls | Grid content shifts | All visible cells redraw |
| Voice becomes active | Track activity dash lights up | 1 character changes color |
| Play/stop | Transport text changes | A few characters |

## Dirty tracking

The `requestAnimationFrame` callback checks a dirty flag and an animation timer. State mutations set dirty. Animations extend the animation timer. The frame loop only draws when something needs to change:

```ts
function frame(now: number) {
    requestAnimationFrame(frame);

    // Advance playback, check animation timers, etc.
    // Each of these sets dirty = true if something changed

    if (!dirty && !animating) return;
    dirty = false;

    display.clear();
    drawPage(display, state, now);
    renderer.draw(display);
}
```

During playback, dirty is set every step (~125ms at 120 BPM). During editing, dirty is set on keystrokes. With animations, the frame loop runs at 60fps for the animation duration. When truly idle, no frames are drawn.
