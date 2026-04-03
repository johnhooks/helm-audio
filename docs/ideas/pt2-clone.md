# ProTracker 2 Clone

[GitHub](https://github.com/8bitbubsy/pt2-clone) | [Downloads](https://16-bits.org/pt2.php) | License: BSD 3-Clause | Language: C + SDL2

## What it is

A highly accurate clone of ProTracker 2.3D (1991, Amiga). ProTracker is the ancestor that defined the format (MOD) and the conventions that every subsequent tracker inherited. The clone by 8bitbubsy aims for Amiga-accurate playback, including the hardware filters and mixing characteristics of the Amiga Paula chip.

## Architecture

Simpler than FT2 or IT. Key source files:

- `pt2_keyboard.c`: keyboard input handling
- `pt2_edit.c`: pattern editing
- `pt2_pattern_viewer.c`: pattern display
- `pt2_sampler.c`: the sample editor (waveform view, loop points)
- `pt2_replayer.c`: MOD playback engine
- `pt2_paula.c`: Amiga Paula chip emulation
- `pt2_posed.c`: position editor (order list)

## The constraints

ProTracker is defined by its constraints:

- **4 channels only**: the Amiga had 4 hardware DMA channels. No more, no less.
- **Samples, not instruments**: no envelopes, no multi-sample mapping. A sample is just raw audio with a loop point.
- **31 samples**: numbered 01-1F (later expanded from the original 15).
- **100 patterns max (pt2-clone)**: each pattern is still fixed at 64 rows.
- **15 effects**: numbered 0-F (with the E-command having sub-effects E0-EF).
- **Fixed pattern length**: always 64 rows. No variable lengths.

These constraints shaped everything: the 4-column layout, the compact effect system, the way songs were structured.

## The editing model

### Single screen

The ProTracker main screen shows the core workflow at once: pattern grid (4 channels), sample info, song position, and a sampler waveform area at the bottom. Additional pages still exist (Disk Op, Edit Op, full Sampler), but the default editing loop is intentionally compact.

### Field layout

```
Note  Sample  Effect+Param
C-3   01      000
```

Just three fields per step: note, sample number, and a 3-digit hex effect. No volume column, no instrument concept. Volume is controlled via effect commands (Cxx = set volume).

### Note entry

Same two-row tracker note layout. ProTracker uses low/high note maps (F1/F2) rather than FT2-style absolute octave keys, covering the classic C-1 to B-3 entry range in two keyboard modes.

### Effects

Only 15 effects, but they cover the essentials:

- 0xy: Arpeggio
- 1xx/2xx: Pitch slide up/down
- 3xx: Portamento to note
- 4xy: Vibrato
- 9xx: Sample offset
- Axy: Volume slide
- Bxx: Position jump
- Cxx: Set volume
- Dxx: Pattern break
- Exx: Extended effects (16 sub-commands)
- Fxx: Set speed/tempo

The E-command sub-effects include fine slides, note cut/delay, loop, retrigger, and the "Funk Repeat" (E8x, almost never used).

## What makes ProTracker unique

### Simplicity as a feature

Four channels force economy. Every channel is precious. You learn to make a full arrangement with kick, bass, lead, and chords by juggling all four channels. This constraint breeds creativity.

### The Amiga sound

The Paula chip's 8-bit samples, RC filter, and specific mixing behavior give ProTracker songs a distinctive warmth. The pt2-clone goes to great lengths to emulate this, including:
- Amiga 500 vs Amiga 1200 filter modes (F12 toggles)
- Stereo separation matching Amiga hardware (channels 1+4 left, 2+3 right)
- BPM timing via CIA chip vs vblank

### Direct sample manipulation

The sampler view at the bottom of the screen lets you draw waveforms, cut/copy/paste, set loop points, and apply effects directly to sample data. This is real-time sample editing integrated into the tracker. It is not a separate program.

### The MOD format

.MOD files are the lingua franca of tracker music. Every tracker can load them. The format is simple enough to implement in a weekend. It's the starting point for understanding tracker file formats.

## The minimal viable tracker

From ProTracker, the irreducible core of what a tracker is:

- **Pattern grid:** N channels x 64 rows, cells contain (note, sample, effect)
- **Cursor navigation:** move between rows, channels, and subfields
- **Edit mode toggle:** record vs. live play
- **Piano keyboard mapping:** two rows of keys = chromatic input
- **Sample/voice slots:** numbered, each with audio data + loop points + volume
- **A replayer:** tick-based, processes one row per speed-interval, applies effects per tick
- **Transport:** play pattern, play song, stop, set position
- **Pattern order list:** sequence of pattern numbers forming the song
- **Basic effects:** set volume, volume slide, portamento, set speed/tempo, pattern break, position jump
- **Disk operations:** load/save

That is about 10 concepts. Everything else, including instruments, envelopes, multiple effect columns, and more channels, is an elaboration on this core.

## The tick-based effect model

Effects are processed per tick. A row lasts N ticks (set by the speed command). Most effects (slides, vibrato) update on ticks 1..N-1. The note itself triggers on tick 0. This tick-based model is the foundation of all tracker timing and maps directly to our sequencer's step-through model.

## Inspiration for helm-audio

- **Start minimal**: ProTracker proves you can make real music with 4 channels and 15 effects. Our MVP should embrace constraints similarly.
- **Single-screen design**: ProTracker's everything-visible-at-once approach is worth considering for our pattern view. Show the sequence grid, transport, and voice activity all on one screen.
- **The 64-row fixed pattern**: simplifies everything. Our 16-step sequence is even simpler.
- **The effect system**: 15 effects is a complete set for melody and rhythm. Our FX columns could start with a similarly small set.
- **Sample offset (9xx)**: a simple but powerful effect. For FM synthesis, the equivalent might be "operator offset" or "algorithm switch on this step."
- **The constraints breed creativity** principle applies to our 8-track, FM-only design.

## Sources

- [pt2-clone — GitHub](https://github.com/8bitbubsy/pt2-clone)
- [pt2-clone project page](https://16-bits.org/pt2.php)
