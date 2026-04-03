# Tracker history and lineage

The complete family tree of music tracker software, from the first tracker in 1987 to the hardware trackers of 2021.

## The origin

**Ultimate Soundtracker** (1987) by Karsten Obarski, released by EAS Computer Technik for the Amiga. The first tracker ever made. A commercial product that defined an entirely new software category. 4-channel hardware mixing via the Amiga's Paula chip, limited to 15 samples per song. Created the .MOD file format. The source was reverse-engineered by the demoscene, spawning a Cambrian explosion of clones.

## The lineage

```
Soundmonitor (C64, 1986) — conceptual precursor
    │
Ultimate Soundtracker (Amiga, 1987) — THE ORIGIN
    │
    ├── NoiseTracker (1989) — bugfix + 31 samples
    │       │
    │       └── ProTracker (1990) — THE Amiga standard, .MOD
    │               │
    │               └── MilkyTracker (2005) — cross-platform FT2/MOD clone
    │
    ├── MED / OctaMED (1989-1996) — MIDI, 8 channels, commercial
    │
    └── [reverse-engineered to PC]
            │
            ├── Scream Tracker (1990) — Future Crew, .STM/.S3M
            │       │
            │       └── Scream Tracker 3 (1993) — 32ch, FM synth via OPL, .S3M
            │               │
            │               └── Impulse Tracker (1995) — 64ch, NNAs, .IT
            │                       │
            │                       ├── Schism Tracker (2003) — cross-platform IT clone
            │                       └── ModPlug / OpenMPT (1997) — Windows, VST, all formats
            │
            ├── Composer 669 (1992) — first 8ch PC tracker
            │
            └── FastTracker (1993) — Triton, .MOD
                    │
                    └── FastTracker 2 (1994) — .XM, instruments, 32ch
                            │
                            ├── MilkyTracker (2005) — faithful FT2 clone
                            └── Renoise (2002) — pro DAW-quality tracker

[Modular branch]
    Jeskola Buzz (1997) — modular routing + tracker
    SunVox (2008) — modular synth + tracker

[Chiptune branch]
    LSDJ (2000) — Game Boy native
    FamiTracker (2005) — NES 2A03
    DefleMask (2011) — first multi-system chiptune tracker
    Furnace (2021) — ultimate multi-system chiptune tracker

[Hardware branch]
    NerdSeq (2018) — Eurorack tracker module
    Polyend Tracker (2020) — first standalone hardware tracker
    DirtyWave M8 (2021) — handheld, inspired by LSDJ
```

## The Amiga era (1987-1993)

### Ultimate Soundtracker (1987)
Karsten Obarski. The first. Commercial product for the Amiga, criticized as "illogical" and "temperamental" but it invented the tracker paradigm: a vertical grid of note events, played top to bottom, with samples triggered by a keyboard-piano layout. The .MOD format it created is still supported by every tracker 38 years later.

### NoiseTracker (1989)
Pex "Mahoney" Tufvesson and Anders "Kaktus" Berkeman. Swedish demoscene. Mahoney disassembled the entire Soundtracker, fixed the bugs, expanded samples from 15 to 31. Freeware. Its code became the direct basis for ProTracker.

### ProTracker (1990-1993)
Lars Hamre, Anders Hamre, Sven Vahsen, and Rune Johnsrud (the Amiga Freelancers) built on NoiseTracker's code. They added a built-in sample editor, keyboard split, and extended patterns. ProTracker became the standard Amiga tracker and is arguably the most-used tracker in history. It solidified the .MOD format as the universal interchange standard.

4 channels. 31 samples. 64-row patterns. 15 effects. These constraints defined a generation of music. Everything that came after expanded on ProTracker's foundation.

### OctaMED (1989-1996)
Teijo Kinnunen. The first Amiga tracker with native MIDI support. Broke the 4-channel barrier with software mixing for 8 independent channels (1991). Eventually supported 64 channels, 16-bit stereo, hard disk recording. Development remarkably resumed in 2024.

## The PC era (1990-1998)

The Amiga declined. The PC rose. The demoscene carried trackers to DOS.

### Scream Tracker (1990-1994)
Sami "Psi" Tammilehto of Future Crew (the Finnish demogroup behind *Second Reality*) created the first popular PC tracker. Scream Tracker 3 (1993) was the breakthrough: 32 channels, the .S3M format, and uniquely, **9 FM synthesis channels via OPL2/OPL3 chips** alongside sample playback. This is historically relevant to helm-audio. Scream Tracker 3 was doing hardware FM + samples in a tracker in 1993.

### FastTracker 2 (1994)
Fredrik "Mr.H" Huss and Magnus "Vogue" Hogdahl of Triton (Sweden). Written in Borland Pascal + TASM assembly. Created the .XM format.

Revolutionary contributions:
- **Instruments with envelopes**: An instrument is a container of up to 16 samples with a per-note mapping, volume/panning envelopes (12 breakpoints with sustain and loop), and auto-vibrato. This separated "what sound to make" from "which sample to play."
- **Volume column**: A dedicated per-step volume effect alongside the main effect column. Two effects per step.
- **32 channels**: 8x ProTracker's limit.
- **16-bit samples at 44kHz**: CD quality.
- **Linear frequency table**: Pitch slides sound consistent across the entire range (ProTracker's Amiga period table was non-linear).
- **Mouse-driven GUI**: A departure from keyboard-only interfaces. 640x480 graphical UI.

Became the dominant demoscene tracker of the late 90s. Development stopped when Huss and Hogdahl founded Starbreeze Studios (Payday, The Chronicles of Riddick).

### Impulse Tracker (1995-1998)
Jeffrey "Pulse" Lim. Written entirely in assembly language. The .IT format.

Revolutionary contributions:
- **New Note Actions (NNA)**: When a new note triggers on a channel already playing, the old note can cut, continue, note-off, or fade. This enabled polyphonic-like behavior from monophonic channels, where the old note rings out while the new one starts. It fundamentally changed what "4/8/16/32 channels" means in practice.
- **Resonant filters**: Per-instrument low-pass filter with cutoff and resonance. Filter state is per-channel. Controllable via the Zxx MIDI macro effect.
- **Pitch/filter envelopes**: In addition to volume and panning envelopes, IT has a pitch envelope that can act as a filter envelope.
- **64 channels**: Double FT2's limit.
- **The edit mask**: Comma toggles which fields are written when entering a note. Instrument, volume, and effect can independently "come with" the note or be left untouched.
- **Advanced sample interpolation**: Cubic interpolation for smoother sample playback.

IT was the power user's tracker. Its editing model (edit mask, skip value, multichannel mode) is the most sophisticated of any tracker. Source code released under BSD license on December 25, 2014.

## The rivalry

FT2 and IT coexisted from 1995-1998 and had distinct communities:
- **FT2**: More graphical, more accessible, instruments with envelopes, mouse-friendly. Dominant in the XM/demo scene.
- **IT**: Text-mode, keyboard-centric, more technically powerful (NNA, filters, pitch envelopes). Dominant among power users and later module composers.

Both were DOS programs that died when Windows took over. Their legacies live on through MilkyTracker (FT2 clone), SchismTracker (IT clone), OpenMPT (supports both), and Renoise (spiritual successor to both).

## The modern era (1997-present)

### ModPlug / OpenMPT (1997)
Olivier Lapicque. Native Windows tracker supporting IT, XM, MOD, S3M. VST plugin support. Community-maintained as OpenMPT after 2004. The bridge between the DOS tracker era and modern Windows.

### Jeskola Buzz (1997)
Oskari Tammelin created what is often called the first "3rd generation tracker." He introduced visual modular routing with virtual cables connecting synth plugins, effects, and generators. Development halted in 2000 when Tammelin lost the source code, then resumed in 2008.

### Renoise (2002)
Eduard "Taktik" Mueller and Zvonko "Phazze" Tesic. Evolved from NoiseTrekker. Goal: bring tracker workflow to professional production quality. VST/AU plugins, ASIO, sample-accurate automation, advanced DSP chains, Lua scripting. The state of the art in tracker software. Commercial ($75).

### MilkyTracker (2005)
Faithful cross-platform FT2 clone. Open source (GPL). Originally for Pocket PC. The way to run "FastTracker 2" on modern systems.

### SchismTracker (2003)
Faithful cross-platform IT clone. Open source (GPL). The way to run "Impulse Tracker" on modern systems.

### Furnace (2021)
tildearrow. The most comprehensive chiptune tracker ever made. 50+ sound chips including all Yamaha FM families (OPM, OPN, OPLL, OPZ, OPL). Up to 32 chips / 128 channels per song. The closest existing reference for FM synthesis in a tracker UI.

### DirtyWave M8 (2021)
Timothy "Trash80" Lamb. Handheld hardware tracker. Directly inspired by LSDJ (Game Boy tracker). 8 tracks, FM/virtual analog/sample engines. Proves the tracker paradigm works on constraint hardware with 8 buttons and a 480x320 display. Primary UI inspiration for helm-audio.

## The demoscene connection

The demoscene was not just involved in tracker development. It was the primary driving force. Nearly every major tracker was created by demosceners for demosceners:

- **Future Crew** (Finland) → Scream Tracker. Members later founded Remedy Entertainment (Max Payne).
- **Triton** (Sweden) → FastTracker 2. Members later founded Starbreeze Studios (Payday, Riddick).
- ProTracker, NoiseTracker, and the clone explosion were all demoscene productions.
- Impulse Tracker was created by "Pulse," a scene handle.
- Renoise explicitly targeted scene composers.

The .MOD, .S3M, .XM, and .IT formats were the standard music distribution formats for demos. Tracker music competitions were a core feature of demo parties (Assembly, The Party, etc.). The tracker is, fundamentally, a demoscene instrument.

## Notable artists who used trackers

- **C418** (Daniel Rosenfeld): Minecraft soundtrack, composed in Impulse Tracker.
- **Deadmau5**: early work in trackers before switching to DAWs
- **Aphex Twin**: reportedly used trackers alongside hardware
- **Andrew Sega** (Necros): one of the most celebrated tracker musicians and co-founder of Straylight Productions.
- **Alexander Brandon**: Unreal Tournament soundtrack, composed in FastTracker 2 / Impulse Tracker
- **Jesper Kyd**: Hitman soundtrack, early work in trackers on the Amiga demoscene

## Sources

- [Music tracker — Wikipedia](https://en.wikipedia.org/wiki/Music_tracker)
- [Ultimate Soundtracker — Wikipedia](https://en.wikipedia.org/wiki/Ultimate_Soundtracker)
- [ProTracker — Wikipedia](https://en.wikipedia.org/wiki/Protracker)
- [NoiseTracker — Wikipedia](https://en.wikipedia.org/wiki/NoiseTracker)
- [FastTracker 2 — Wikipedia](https://en.wikipedia.org/wiki/FastTracker_2)
- [Impulse Tracker — Wikipedia](https://en.wikipedia.org/wiki/Impulse_Tracker)
- [Scream Tracker — Wikipedia](https://en.wikipedia.org/wiki/Scream_Tracker)
- [OctaMED — Wikipedia](https://en.wikipedia.org/wiki/OctaMED)
- [OpenMPT — Wikipedia](https://en.wikipedia.org/wiki/OpenMPT)
- [Renoise — Wikipedia](https://en.wikipedia.org/wiki/Renoise)
- [Jeskola Buzz — Wikipedia](https://en.wikipedia.org/wiki/Jeskola_Buzz)
- [SunVox — Wikipedia](https://en.wikipedia.org/wiki/SunVox)
- [Future Crew — Wikipedia](https://en.wikipedia.org/wiki/Future_Crew)
- [Triton (demogroup) — Wikipedia](https://en.wikipedia.org/wiki/Triton_(demogroup))
- [Soundtracker origins — Xavier Borderie](https://xavier.borderie.net/blog/2021/09/22/soundtracker-origins-part-1-where-in-the-world-is-karsten-obarski/)
- [History of trackers — MusicTech](https://musictech.com/guides/essential-guide/history-of-trackers/)
