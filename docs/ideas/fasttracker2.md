# FastTracker 2

[Wikipedia](https://en.wikipedia.org/wiki/FastTracker_2) | Original platform: DOS | First release: November 1994 | Authors: Fredrik "Mr.H" Huss and Magnus "Vogue" Hogdahl (Triton, Sweden)

Modern clone: [ft2-clone](https://github.com/8bitbubsy/ft2-clone) by 8bitbubsy

## What it is

FastTracker 2 was the dominant PC tracker of the mid-to-late 1990s. Created by two members of the Swedish demogroup Triton, it introduced the .XM format and brought tracker music into the 32-channel, 16-bit, CD-quality era. Its core philosophy was "instruments over effects." The goal was to make sounds sophisticated through the instrument editor rather than requiring elaborate effect tricks on every pattern row.

## The people

Fredrik "Mr.H" Huss and Magnus "Vogue" Hogdahl were part of Triton (TRN), a Swedish demogroup active 1992-1996. Triton won competitions with Crystal Dream (1992) and Crystal Dream 2 (1993). FastTracker 2 outlasted their demos in cultural impact. It became the tool that defined PC tracker music.

FT2 was written in Borland Pascal 7 + TASM assembly. That was an unusual choice for a performance-critical DOS program, but it worked. Development began June 1993, public release was November 1994, and final stable version 2.08 shipped in August 1997.

On May 23, 1999, Vogue posted the discontinuation announcement: "If this was an ideal world... there would definitely be a multiplatform FastTracker3. Unfortunately this world is nothing like that." By then, Huss and Hogdahl had founded **Starbreeze Studios** (1998), the game company behind The Chronicles of Riddick, The Darkness, and the Payday series. The need to "make a living" ended FT2's development.

The original source code has never been published, but 8bitbubsy received permission from the authors to port directly from it for the ft2-clone (2018, BSD 3-Clause).

## The Amiga-to-PC transition

FT2 was pivotal in making PCs viable for tracker music. The Amiga had hardware sample playback via Paula, with 4 channels and zero CPU cost. Early PCs had nothing comparable until the Sound Blaster 16 (1992) and Gravis UltraSound (1992). FT2's software mixing freed PC trackers from hardware channel limits entirely: 32 channels, all in software, running on a 486.

Commodore's bankruptcy in April 1994 accelerated the migration. The Scandinavian PC demoscene (Triton, Future Crew) drove adoption. FT2 arrived at the exact moment the scene needed a serious PC tracker.

## What was revolutionary

### The instrument/envelope system

This was FT2's defining innovation and its biggest departure from the MOD/ProTracker tradition.

In ProTracker, a "sample" is just raw audio with a loop point. All expression comes from pattern effects such as volume slides, vibrato, and portamento. Every sustaining sound requires manual effect commands on every relevant row.

FT2 separated **instruments** from **samples**. An instrument is a container:
- Up to 16 samples with a per-note mapping table (`note2SampleLUT[96]`, where each of 96 notes independently maps to one of 16 samples)
- Volume and panning envelopes (up to 12 breakpoints each, with sustain point and loop)
- Auto-vibrato (type, sweep, depth, rate)
- Fadeout value (controls post-note-off decay)

This meant a sound could evolve over time without any pattern effects. A plucked string, a swelling pad, or a pulsing bass could all be defined once in the instrument editor and then triggered with a single note. The envelope editor was graphical: click to add/move points, visually design the volume/panning curve. This was a conceptual leap from ProTracker's "type effects on every row" approach.

### The volume column

A dedicated per-step column for volume/panning effects, separate from the main effect column. Encoded as a single byte with ranges determining function:

| Range (hex) | Function |
|-------------|----------|
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

This gave every step two simultaneous effects. You could control volume without sacrificing the main effect column. That was brilliant for tracker music where volume changes are constant.

### Technical advances

- **32 channels** (8x ProTracker)
- **16-bit samples at 44kHz** (CD quality, vs ProTracker's 8-bit ~29kHz)
- **Linear frequency table**: Pitch slides sound consistent across the entire range. ProTracker's Amiga period table was non-linear, so bass and treble slides behaved differently. FT2's linear mode fixed this.
- **Variable pattern lengths**: 1-256 rows per pattern (ProTracker was fixed at 64)
- **Mouse-driven GUI**: 640x480 graphical interface with buttons, scrollbars, and the graphical envelope editor. A departure from keyboard-only text-mode interfaces.
- **Per-channel oscilloscope displays**: Real-time waveform visualization during playback.

## The XM format

The .XM (Extended Module) format became one of the "big three" module formats (MOD, XM, IT). It hit the sweet spot of power vs complexity. It was more capable than MOD/S3M (envelopes, multisampling, 32 channels) but simpler than IT (no NNA, no filters). The format used pattern compression and delta-encoded sample data for compact file sizes, which was critical for floppy/BBS/early internet distribution.

XM's popularity was a network effect: FT2 was popular → everyone used XM → everyone needed FT2 (or a compatible player). The format persists today through MilkyTracker, OpenMPT, and countless module players.

## The IT rivalry

FT2 and Impulse Tracker coexisted from 1995-1998 with distinct communities:

- **FT2**: Graphical, mouse-friendly, instruments with envelopes. Attracted synthpop/orchestral composers.
- **IT**: Text-mode, keyboard-centric, technically superior (NNA, filters, 64 channels). Attracted techno/industrial/demoscene power users.

The divide was cultural more than technical. Musicians rarely switched despite acknowledging the other tool's strengths, because workflow and muscle-memory lock-in were real. FT2 users accepted 32-channel limits and no NNA because the instrument/envelope workflow was more comfortable. IT users accepted no graphical envelope editor because the keyboard-driven editing was faster.

## What to be inspired by

- **"Instruments over effects"**: Build sophisticated sounds in the instrument editor; keep patterns clean. Our FM patches with per-instrument envelopes, LFOs, and insert chains follow this philosophy.
- **The volume column**: A lightweight per-step control that doesn't consume the main FX column. Worth considering for our sequence view.
- **Graphical envelope editing**: FT2's visual envelope editor set the standard. Our instrument view could draw envelope shapes.
- **Per-note mapping**: The 96-entry lookup table mapping every note to a sample could inspire per-note voice configuration in our FM engine.
- **Fadeout value**: A simple per-instrument parameter controlling post-note-off decay. Directly applicable to FM voice design.
- **The "good enough" principle**: 32 channels and no NNA was technically limiting, but for most music it was sufficient. Simplicity won over technical superiority. Our 8-track, FM-only design embraces this.

## Sources

- [FastTracker 2 — Wikipedia](https://en.wikipedia.org/wiki/FastTracker_2)
- [XM file format — Wikipedia](https://en.wikipedia.org/wiki/XM_(file_format))
- [Triton (demogroup) — Wikipedia](https://en.wikipedia.org/wiki/Triton_(demogroup))
- [Starbreeze Studios — Wikipedia](https://en.wikipedia.org/wiki/Starbreeze_Studios)
- [ft2-clone — 16-bits.org](https://16-bits.org/ft2.php)
