# Tracker animations

How the tracker display stays alive through color and character cycling. No tweens, no transitions, no easing curves. Just `time → color` functions evaluated in the view builder every frame.

## The M8 approach

The M8's display feels alive even when you're not touching it. The cursor pulses, the waveform breathes, active tracks have presence. The M8 firmware achieves this by continuously sending draw commands to the display client with shifted colors. The display client doesn't know it's rendering an animation — it just executes `draw_character(char, x, y, r, g, b)` with whatever RGB values it receives.

We do the same thing. The renderer stays dumb — it draws characters and rectangles with the colors it's given. Animation logic lives entirely in the view builder, where `time` is an input alongside `state`. The renderer never interpolates, never stores previous colors, never decides what something should look like. It just executes commands.

## Time source

The view builder receives `performance.now()` on each frame. Animation functions take this timestamp and produce a color or character value. Common patterns:

```ts
// Slow pulse: 0.0 → 1.0 → 0.0 over a period
function pulse(time: number, periodMs: number): number {
    return (Math.sin((time / periodMs) * Math.PI * 2) + 1) * 0.5;
}

// Sawtooth: 0.0 → 1.0 repeating
function saw(time: number, periodMs: number): number {
    return (time % periodMs) / periodMs;
}

// Lerp between two colors
function lerpColor(a: RGB, b: RGB, t: number): RGB {
    return {
        r: a.r + (b.r - a.r) * t,
        g: a.g + (b.g - a.g) * t,
        b: a.b + (b.b - a.b) * t,
    };
}
```

These are pure functions. No state, no accumulators, no cleanup. Given the same time, they always return the same value.

## Animations

### Cursor pulse

The cursor cell's foreground color breathes between two values — the highlight color and a brighter or shifted variant. Slow, subtle. The user's eye is drawn to the cursor without it being distracting.

```
period:  800ms
range:   palette.textHighlight → palette.textHighlight * 1.3 (clamped)
shape:   sine pulse
applies: foreground color of the character at the cursor position
```

The background of the cursor row can pulse too, but even more subtly — a slight brightness shift on the cursor row background.

### Playback row sweep

When the playback position advances to a new row, instead of the entire row changing color in one frame, the highlight sweeps from left to right across the columns over 2-3 frames. Each frame, the sweep boundary advances by a few columns. Characters to the left of the boundary have the playback row color; characters to the right still have their previous color.

```
trigger: playback step advances (state.playbackRow changes)
duration: ~50ms (3 frames at 60fps)
shape:   linear sweep, left to right
applies: background color of each cell in the playback row

// In the view builder:
const sweepProgress = clamp((time - playbackRowChangeTime) / 50, 0, 1);
const sweepColumn = Math.floor(sweepProgress * totalVisibleColumns);

for each column:
    if column <= sweepColumn:
        bg = palette.playbackRow
    else:
        bg = previousRowBg
```

This is one of those details that separates "functional" from "feels good." The sweep makes the playback position feel like it's rolling forward, not teleporting.

### Active voice glow

Track headers for tracks with active voices (voice state != Idle) get a color shift. The header text pulses gently while the voice is sounding, and fades back to dim when the voice goes idle.

```
trigger: voice becomes active (note on) / idle (release finished)
shape:   sine pulse while active, exponential decay on release
period:  1200ms (slow, ambient)
applies: foreground color of track header text

// Active: pulse between dim and bright
if voice is active:
    fg = lerpColor(palette.textNormal, palette.accent, pulse(time, 1200))

// Fading: decay from last active color to dim
if voice just went idle:
    fg = lerpColor(palette.accent, palette.textDim, decayCurve(time - idleStartTime))
```

This gives you a peripheral sense of which tracks are making sound without looking at the waveform or pattern data.

### Waveform color breathing

The waveform display line shifts color based on amplitude. Louder output = warmer/brighter, quiet = cooler/dimmer. The waveform is always moving (it's driven by the AnalyserNode), but the color adds another dimension.

```
input:   RMS amplitude from AnalyserNode time-domain data
range:   palette.waveformQuiet (dim blue/teal) → palette.waveformLoud (bright green/white)
shape:   direct mapping with smoothing (exponential moving average on the RMS value)
applies: color uniform in the waveform fragment shader
```

The smoothing prevents the color from flickering on transients. A 50ms time constant (~3 frames) is enough.

### Note entry flash

When the user enters a note, the cell briefly flashes brighter before settling to its normal note color. A tiny burst of visual feedback that confirms the keystroke registered.

```
trigger: note entered at cursor position
duration: 100ms
shape:   exponential decay from white to palette.noteColor
applies: foreground color of the note characters in that cell

// In the view builder:
const timeSinceEntry = time - cell.lastEditTime;
if timeSinceEntry < 100:
    fg = lerpColor(white, palette.noteColor, timeSinceEntry / 100)
else:
    fg = palette.noteColor
```

This needs a `lastEditTime` per cell, or at least for the last-edited cell. Since only one cell is edited at a time, a single `{row, track, time}` tuple in the state is enough.

### Beat pulse on playback

During playback, major beat rows get a subtle background brightness pulse when the playback position crosses them. The beat "lands" visually.

```
trigger: playback reaches a major beat row
duration: 200ms
shape:   exponential decay, background brightness bump
applies: background color of the major beat row

// In the view builder:
if row is major beat && (time - lastBeatTime[row]) < 200:
    const t = (time - lastBeatTime[row]) / 200;
    bg = lerpColor(palette.majorBeatFlash, palette.majorBeat, t)
```

This makes the rhythm visible. You can see the beat pattern without hearing it.

### Idle shimmer (ambient)

When the tracker is stopped and idle, the beat-highlight rows shimmer — a very slow, very subtle color wave moves through them. Not distracting, just a sign that the display is alive.

```
condition: transport is stopped, no recent user input (>2s)
shape:    sine wave moving down the rows, very low contrast
period:   4000ms for a full cycle
amplitude: ±2-3 brightness units on the background color
applies:  background color of major/minor beat rows

// In the view builder:
if idle:
    for each row:
        const phase = (row / totalRows + time / 4000) * Math.PI * 2;
        const shimmer = Math.sin(phase) * 0.02; // very subtle
        bg = adjustBrightness(palette.majorBeat, shimmer);
```

This stops the instant the user presses a key or playback starts.

## Interaction with dirty tracking

Animations that run continuously (cursor pulse, idle shimmer, waveform) mean the display is always dirty during those states. The render loop can't skip frames based on state-change detection alone. Instead:

```ts
function frame(now: number) {
    requestAnimationFrame(frame);

    const needsRedraw = dirty              // state changed
        || state.playing                   // playback row animations
        || cursorVisible                   // cursor pulse
        || (now - lastInputTime > 2000     // idle shimmer
            && !state.playing);

    if (!needsRedraw) return;

    dirty = false;
    const commands = buildDrawCommands(state, now);
    renderer.draw(commands);
}
```

When the tracker is truly idle with cursor hidden (e.g. focus lost), no frames are drawn. When the cursor is visible, the pulse runs at 60fps but the actual GPU cost is negligible — the draw commands are identical except for a few color values.

## What the renderer sees

The renderer's interface doesn't change. It still receives `DrawChar[]` and `DrawRect[]` arrays. The animation logic is invisible to it — the view builder just happens to produce slightly different RGB values each frame. A character that was `{char: 'C', x: 5, y: 10, r: 102, g: 204, b: 170}` last frame might be `{char: 'C', x: 5, y: 10, r: 105, g: 210, b: 175}` this frame. The renderer doesn't know or care why.

This is the M8 model. The firmware sends whatever colors it wants. The display client draws them. The separation is total.
