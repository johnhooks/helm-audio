# Tracker view: WebGL renderer

The tracker UI is a monospaced text grid. Every screen — the pattern editor, the patch editor, the effect bus config, the transport — is the same primitive: characters at grid positions with colors, and rectangles behind them for highlights. This is the M8's insight: you don't need widgets, you need a text terminal with color.

The renderer draws this grid using WebGL2. The approach is inspired by m8c's rendering architecture (bitmap font atlas, pixel-perfect scaling via offscreen framebuffer, double-buffered textures) and M8WebDisplay's WebGL renderer (instanced draws, shader-based text rendering). No DOM elements in the grid. No Canvas 2D. Just triangles, textures, and typed arrays.

## Why WebGL

Canvas 2D can draw monospaced text. It works — BassoonTracker proves it. But it redraws every character every frame with individual `fillText` calls, it can't do post-processing, and it doesn't batch. WebGL gives us:

- **One draw call for the entire screen of text.** Instanced rendering: one quad per character, all submitted in a single `drawArraysInstanced` call. The GPU does the work.
- **Post-processing.** Render to an offscreen framebuffer at native resolution, then blit to the screen with a shader that adds scanlines, subtle phosphor glow, or CRT curvature. The text grid looks like it's running on hardware, not in a browser tab.
- **Per-character color with zero overhead.** Each character instance carries its own RGB. No state changes between characters.
- **Waveform rendering in a shader.** Pipe AnalyserNode frequency/time data to a texture, render the oscilloscope in a fragment shader. Runs at 60fps with no JS-side drawing code.
- **Pixel-perfect integer scaling.** Render at a fixed native resolution (e.g. 640×400), scale to the window with nearest-neighbor filtering. Characters stay crisp at any window size. m8c does this exact two-pass approach with SDL textures — it translates directly to WebGL framebuffers.

## Architecture

### Display list model

The renderer doesn't know about patterns, tracks, or cursors. It consumes a flat list of draw commands:

```ts
interface DrawRect {
    x: number;      // grid column
    y: number;      // grid row
    w: number;      // width in cells
    h: number;      // height in cells
    r: number;      // 0-255
    g: number;
    b: number;
}

interface DrawChar {
    char: number;   // character code (ASCII or font atlas index)
    x: number;      // grid column
    y: number;      // grid row
    r: number;      // foreground color
    g: number;
    b: number;
}
```

This is the same command format the M8 uses over its serial protocol (`0xfe` = rect, `0xff` = char). The tracker state layer produces these commands. The renderer executes them. The two never know about each other.

A frame looks like:

1. Tracker state builds draw commands (background rects for row highlights, cursor, selection → character commands for all visible text)
2. Commands are written into typed arrays (Float32Array or Uint8Array, one entry per instance)
3. WebGL uploads the arrays to instance buffers and draws

### Three render passes

**Pass 1 — Rectangles** (offscreen framebuffer, native resolution)

Background fills: row highlights (major beat, minor beat, current row, playback row, selection). Each rect is an instanced quad with position, size, and color. One draw call.

**Pass 2 — Characters** (same offscreen framebuffer)

All visible text. Each character is an instanced quad that samples from the bitmap font atlas. Per-instance data: grid position, character index, foreground RGB. One draw call. Alpha blending on so characters composite over the background rects.

**Pass 3 — Blit + post-processing** (screen framebuffer)

A single fullscreen quad that reads the offscreen texture and writes to the screen. The fragment shader applies:

- **Integer scaling** with nearest-neighbor filtering (crisp pixels)
- **Scanlines** (optional) — darken every other line slightly, like a CRT
- **Bloom/glow** (optional) — soft glow around bright characters, especially the cursor and playback row
- **Background color** — the space outside the integer-scaled grid

The post-processing is the difference between "web app" and "instrument." Without it, the grid looks like a spreadsheet. With it, it looks like it's running on dedicated hardware.

### Optional: waveform pass

Between pass 2 and pass 3, render a waveform strip at the top of the offscreen framebuffer. The AnalyserNode provides time-domain or frequency data as a Uint8Array. Upload it to a 1D texture (or a uniform array), draw a strip of quads, and the fragment shader visualizes the waveform. This runs entirely on the GPU — no JS-side path drawing.

## Font atlas

A bitmap font texture containing all characters in a grid. Same approach as m8c's `font1.h` — a single image where each character occupies a fixed cell.

```
Character cell:  8×12 pixels (adjustable)
Atlas layout:    16 columns × 6 rows = 96 characters (printable ASCII)
Atlas size:      128×72 pixels
Texture format:  R8 (single channel, alpha mask)
```

The text fragment shader does:

```glsl
// Per-instance: character index, grid position, color
// Uniform: font atlas texture, cell size, grid origin

vec2 charPos = vec2(charIndex % 16, charIndex / 16) * cellSize;
vec2 uv = charPos + fragCoordInCell;
float alpha = texelFetch(fontAtlas, ivec2(uv), 0).r;
fragColor = vec4(color, alpha);
```

The font texture is loaded from a PNG at startup. It can be generated from any monospace TTF using an offline tool, or hand-drawn as pixel art for a specific aesthetic. m8c ships bitmap fonts as embedded BMP data — we'd do the same but as a PNG served by Vite.

### Font choice

The M8 uses two custom bitmap fonts (Stealth57 and Stealth89). Schismtracker uses an 8×8 IT-style font. The font defines the visual character of the tracker more than any other single choice.

Options:
- **Pixel art font** — hand-drawn, specific aesthetic. The M8 and classic tracker look.
- **Rendered from TTF** — take a monospace font (JetBrains Mono, Iosevka, Berkeley Mono), render it to a bitmap atlas at the target cell size. Clean, modern, readable.
- **Multiple fonts** — a small font for the dense pattern grid, a larger font for headers and the patch editor. m8c and M8WebDisplay both support two font sizes.

Start with a rendered TTF atlas. Switch to pixel art later if the aesthetic calls for it.

## Grid layout

The display is a fixed-resolution framebuffer divided into a character grid. The resolution and grid size determine how much content is visible.

```
Native resolution:  960×600 pixels
Character cell:     8×12 pixels
Grid size:          120 columns × 50 rows
```

At this size, a 16-track pattern with 32 visible rows fits comfortably:

```
Rows 0-1:     Title / transport (BPM, play/stop, pattern number, octave)
Row 2:        Separator
Rows 3-4:     Track headers (track number, patch name)
Rows 5-36:    Pattern grid (32 visible rows)
Row 37:       Separator
Rows 38-39:   Edit status (cursor position, edit mask, current patch)
Rows 40-49:   Patch editor / waveform / context panel
```

Each track column in the pattern grid:

```
Columns per track (compact):  10 chars
  NNN VV PPP LL
  │   │  │   └─ param lock (abbreviated, 2 chars)
  │   │  └───── patch index (hex, 3 chars with 'V' prefix)
  │   └──────── velocity (hex, 2 chars)
  └──────────── note (3 chars: note + octave, e.g. C-4, F#2)

Columns per track (wide):  16+ chars
  Full param lock display, multiple lock columns
```

At 10 chars per track + 1 separator + 4 chars for row numbers:
- 120 columns fits ~11 tracks visible at once
- Horizontal scroll for more tracks (same as Schismtracker's channel scroll)

## Color

A 16-color palette, reminiscent of the M8's aesthetic but adapted for a dark background tracker. Each color has a specific semantic role:

```
 0  Background         #0a0a0a   (near-black)
 1  Background alt     #111111   (slightly lighter, minor beat rows)
 2  Background accent  #1a1a1a   (major beat rows)
 3  Cursor row         #1a2a1a   (dark green tint)
 4  Selection          #1a1a2a   (dark blue tint)
 5  Playback row       #2a1a1a   (dark red tint)

 6  Text dim           #555555   (empty cells: ---, separators)
 7  Text normal        #888888   (row numbers, headers)
 8  Text bright        #cccccc   (note names, values)
 9  Text highlight     #ffffff   (cursor cell, active values)

10  Note color         #66ccaa   (note names when present)
11  Velocity color     #cc8866   (velocity values)
12  Patch color        #8888cc   (patch index)
13  Lock color         #cccc66   (param lock values)
14  Accent             #cc6666   (warnings, errors)
15  Playback accent    #66cc66   (playing row indicator)
```

Colors are passed per-character as RGB, not as palette indices. But the tracker state layer uses the palette to assign colors — the renderer just sees RGB values. The palette can be swapped without changing the renderer.

## Input handling

Keyboard input is handled in JS (`document.addEventListener('keydown', ...)`). The tracker state layer maps key events to state mutations. The renderer is not involved in input.

The key mapping follows FT2/Renoise conventions:

```
Navigation:
  Arrow keys       Move cursor (row, column, sub-field)
  Tab / Shift+Tab  Next / previous track
  Page Up/Down     Jump 16 rows
  Home / End       First / last row

Note entry (FT2 chromatic layout):
  Z S X D C V G B H N J M  = C C# D D# E F F# G G# A A# B
  Q 2 W 3 E R 5 T 6 Y 7 U  = C C# D D# E F F# G G# A A# B (octave up)
  +/-  Octave up/down

Editing:
  0-9 A-F    Hex digit entry (velocity, patch index, param values)
  Delete     Clear cell
  Insert     Insert empty row, push down
  Backspace  Clear and pull up

Transport:
  Space      Play / stop
  ~          Play from cursor (future)

Masks:
  Comma      Toggle edit mask (note / velocity / patch / lock)
```

The key handler is a single function that switches on the current page and cursor column. No event delegation, no framework. Same structure as m8c's `input_handle_key` and Schismtracker's `pattern_editor_handle_key`.

## Typed array layout

The instance data for characters is a flat typed array, updated each frame. Each character instance is 8 bytes (packed):

```
Byte 0:    character code (u8)
Byte 1:    grid column (u8)
Byte 2:    grid row (u8)
Byte 3:    (padding)
Bytes 4-5: color (RGB565 packed into u16, or use 3 bytes for full RGB)
```

Or for simplicity and alignment, use floats (20 bytes per instance):

```
Float 0:  x (grid column)
Float 1:  y (grid row)
Float 2:  char index
Float 3:  r (0.0-1.0)
Float 4:  g (0.0-1.0)
```

With ~2000 visible characters (50 rows × 40 visible columns), that's 40KB per frame in the float layout. Uploading this via `bufferSubData` every frame is trivial for WebGL.

Rectangles use a similar layout (x, y, w, h, r, g, b) at ~28 bytes per rect. With ~50 rects per frame (row highlights, cursor, selection), that's 1.4KB.

## Lifecycle

```
1. Initialize WebGL context, compile shaders, create framebuffer
2. Load font atlas texture from PNG
3. Create instance buffers (characters, rects) with max capacity
4. On each frame:
   a. Tracker state produces draw commands → write to typed arrays
   b. Upload typed arrays to GPU (bufferSubData)
   c. Bind offscreen framebuffer
   d. Clear
   e. Draw rects (instanced)
   f. Draw characters (instanced)
   g. Draw waveform (optional)
   h. Bind screen framebuffer
   i. Draw fullscreen quad with post-processing shader
   j. Present
5. On resize: recreate offscreen framebuffer, recalculate scaling
```

Dirty tracking: only re-upload instance data if the tracker state changed since the last frame. During playback, the playback row advances every step (~125ms at 120 BPM), so the display updates ~8 times per second. During editing, it updates on every keystroke. Either way, the GPU cost is negligible — the bottleneck is never rendering.

## File structure

```
packages/local/src/
  renderer/
    renderer.ts          — WebGL2 setup, framebuffer management, render loop
    shaders/
      rect.vert          — rect vertex shader (instanced quads)
      rect.frag          — rect fragment shader (solid color)
      text.vert          — text vertex shader (instanced quads, font UV lookup)
      text.frag          — text fragment shader (font atlas sampling, per-instance color)
      blit.vert          — fullscreen quad vertex shader
      blit.frag          — post-processing (scaling, scanlines, bloom)
      wave.vert          — waveform vertex shader
      wave.frag          — waveform fragment shader
    font.ts              — font atlas loading, character metrics
    palette.ts           — color palette definition
    display-list.ts      — DrawRect / DrawChar types, typed array packing
  state/
    tracker-state.ts     — pattern, patches, cursor, selection, transport
    draw.ts              — converts TrackerState → display list commands
    keyboard.ts          — key event → state mutation
  main.ts                — entry point, glue
```

The renderer knows nothing about trackers. It draws characters and rectangles. The state layer knows nothing about WebGL. It produces draw commands. `draw.ts` is the bridge — it reads `TrackerState` and writes `DrawRect[]` and `DrawChar[]` arrays that the renderer consumes.
