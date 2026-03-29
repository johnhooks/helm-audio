# ProTracker

[Wikipedia](https://en.wikipedia.org/wiki/Protracker) | Original platform: Amiga | First release: 1990 | Authors: Lars "ZAP" Hamre, Anders Hamre, Sven Vahsen, Rune Johnsrud (the Amiga Freelancers, Norway)

Modern clone: [pt2-clone](https://github.com/8bitbubsy/pt2-clone) by 8bitbubsy

## What it is

ProTracker is the definitive Amiga tracker. Not the first (that was Ultimate Soundtracker, 1987) and not the most technically advanced (that was OctaMED), but the one that became the universal standard. It took the rough ideas from Soundtracker, stabilized them, and released the result as freeware at the exact moment the demoscene was exploding. Timing, accessibility, and freedom made it the most-used tracker in history.

## The origin story

In 1987, a 22-year-old German programmer named Karsten Obarski wrote Ultimate Soundtracker to compose music for a friend's game. He sampled sounds from his **Yamaha DX21**, a 4-operator FM synthesizer, to create the first tracker instruments. Those DX21 samples, shipped as the ST-01 sample disk, became some of the most reused samples in MOD history. The tracker paradigm literally began with FM synthesis captured as 8-bit samples.

Soundtracker was released commercially by EAS Computer Technik in December 1987. Reviews called it "illogical" and "difficult." But the demoscene immediately disassembled the code and began forking it. Obarski withdrew and "simply disappeared without trace," becoming one of the most elusive figures in music technology history.

The forks multiplied: Soundtracker 2.3 (added 31 instruments), Soundtracker 2.4 (added the "M.K." format signature). Then Pex "Mahoney" Tufvesson and Anders "Kaktus" Berkeman, two Swedish teenagers, created NoiseTracker (1989), cleaned up the code, and added vibrato and tone portamento. NoiseTracker's code became the direct basis for ProTracker.

ProTracker emerged from a Norwegian group called the Amiga Freelancers. Lars Hamre was the lead programmer. They fixed the remaining stability issues, added a built-in sample editor, BPM-based tempo control, keyboard split, and most importantly: **fixed PAL/NTSC independence**. Previous trackers tied playback to screen refresh rate (50 Hz PAL vs 60 Hz NTSC), causing songs to play at the wrong speed depending on the machine. ProTracker's non-raster-dependent play routine was arguably its most impactful technical fix.

And they released it as freeware. Universal adoption followed.

## The constraints that defined everything

ProTracker's design was shaped entirely by the Amiga's Paula chip:

- **4 DMA channels**: Hard limit. One sample stream per channel, mixed by hardware with zero CPU overhead. Channels 1+4 go left and 2+3 go right, with hard stereo panning and no center.
- **8-bit samples**: ~29 kHz maximum sample rate, 6-bit volume control (0-63 levels).
- **DMA-driven playback**: Paula handled samples directly from RAM. The CPU stayed free for graphics, which was essential for demos where audio and visuals ran simultaneously.

These constraints shaped every design decision: the 4-column layout, the compact effect system, and the way songs were structured. Four channels forced economy. Every channel was precious. Composers learned to make full arrangements by juggling all four channels for kick, bass, lead, and chords, using techniques like rapid instrument switching, arpeggios as pseudo-chords, and echo effects by sacrificing a channel.

## What was revolutionary

ProTracker didn't invent the tracker. It standardized it. But the tracker paradigm itself was revolutionary:

**The first portable digital music format.** A .MOD file contains both the samples and the sequence in one self-contained file. It predated MP3 (1993) by six years as a shareable music format. MOD files were typically 50-300 KB, so they were transferable over 2400-baud dial-up connections. The BBS trading culture that distributed MOD files pioneered digital music sharing before Napster.

**Democratization of music creation.** Free tool, no additional hardware needed beyond an Amiga. Before trackers, electronic music required thousands in synthesizers and equipment. ProTracker put a complete music production environment on a home computer for the first time.

**The vertical grid paradigm.** Established by Obarski, refined by ProTracker, unchanged for nearly 40 years. Every tracker since uses the same fundamental interface: a vertical grid of note events, played top to bottom, with samples triggered by a keyboard-piano layout.

**Constraint-driven creativity.** Four channels and 8-bit samples became an aesthetic, not a limitation. The characteristic warmth of Amiga MODs comes from the RC filter and Paula's specific mixing behavior, and people still seek out that sound.

## The effect system

15 effects, each a hex digit + two hex parameter digits:

| Cmd | Effect |
|-----|--------|
| 0 | Arpeggio |
| 1/2 | Pitch slide up/down |
| 3 | Portamento to note |
| 4 | Vibrato |
| 9 | Sample offset |
| A | Volume slide |
| B | Position jump |
| C | Set volume |
| D | Pattern break |
| E | Extended effects (16 sub-commands) |
| F | Set speed/tempo |

Plus the E-command sub-effects: fine slides, note cut/delay, pattern loop, and retrigger. Fifteen effects are a complete set for melody and rhythm. Everything expressive about a ProTracker song comes from these effects. They are the performance, in the same way a guitarist's technique is the performance.

## Cultural significance

- **Game music**: Amiga games used MODs extensively due to zero CPU cost. The format carried to SNES, DOS, and eventually modern games (Unreal, Deus Ex used tracker composers).
- **Professional crossover**: Tracker musicians became professional producers. Nasenbluten, Venetian Snares, and Neophyte all used ProTracker in production.
- **UNESCO recognition**: The demoscene (and by extension tracker culture) was recognized as intangible cultural heritage by Finland (2020), Germany and Poland (2021).
- **Archival preservation**: The Library of Congress includes module formats in digital preservation. The Mod Archive and Modland preserve 300,000+ modules.

## What to be inspired by

- **Constraints breed creativity**: 4 channels, 15 effects, 8-bit samples. Real music came from this. Our 8-track FM-only design follows the same principle.
- **The self-contained file**: A MOD is everything needed to reproduce the music. Our "project" concept follows this idea. Save a project, load it anywhere, and hear the same result.
- **Freeware wins**: ProTracker beat its competitors by being free and compatible. The demoscene ethos of free tools and free art applies to what we're building.
- **The effect system IS the expression**: With no envelopes or filters on samples, all expression came from effects. For FM synthesis, the parallel is that parameter automation (our FX columns, tables, modulation) is where the musicality lives.
- **The DX21 connection**: The first tracker samples were FM synthesis. We're closing a circle that started in 1987.

## Sources

- [ProTracker — Wikipedia](https://en.wikipedia.org/wiki/Protracker)
- [Ultimate Soundtracker — Wikipedia](https://en.wikipedia.org/wiki/Ultimate_Soundtracker)
- [MOD file format — Wikipedia](https://en.wikipedia.org/wiki/MOD_(file_format))
- [Soundtracker origins — Xavier Borderie](https://xavier.borderie.net/blog/2021/09/22/soundtracker-origins-part-1-where-in-the-world-is-karsten-obarski/)
- [History of trackers — MusicTech](https://musictech.com/guides/essential-guide/history-of-trackers/)
- [Paula (Amiga) — Wikipedia](https://en.wikipedia.org/wiki/Original_Chip_Set#Paula)
