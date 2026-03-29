# Impulse Tracker

[Wikipedia](https://en.wikipedia.org/wiki/Impulse_Tracker) | [Source code](https://github.com/jthlim/impulse-tracker) (BSD 3-Clause) | Original platform: DOS | First release: 1995 | Author: Jeffrey "Pulse" Lim (Australia)

Modern clone: [SchismTracker](https://github.com/schismtracker/schismtracker)

## What it is

Impulse Tracker was the most technically advanced DOS tracker ever made. Written entirely in x86 assembly by a single developer in South Australia, it introduced concepts that no other tracker had: virtual polyphony through New Note Actions, resonant filters, pitch envelopes, and an editing interface so efficient that people still use its clone (SchismTracker) 30 years later rather than switch to a modern alternative.

IT was the power user's tracker. Its learning curve was steeper than FastTracker 2's, but the ceiling was higher. Every feature existed because a musician needed it and Jeffrey Lim figured out how to implement it in assembly on a 486.

## Jeffrey Lim

Lim's demoscene handle was "Pulse." He was a member of the Australian demogroup Priests of Power. He worked from South Australia, far from the Finnish/Swedish/German core of the European demoscene, and still built a globally dominant tool through online distribution alone.

He was the sole developer. All 230,000+ lines of x86 assembly were written by one person, including the audio engine, the UI, the file format, the sound card drivers (Sound Blaster, Gravis UltraSound, InterWave), and even IPX network drivers.

On February 16, 2014, Lim posted a [four-part retrospective blog series](http://roartindon.blogspot.com/2014/02/20-years-of-impulse-tracker.html) marking 20 years since the first lines of code. On December 25, 2014, he released the full source code under a BSD 3-Clause license.

## The Scream Tracker lineage

IT didn't come from the Amiga tradition. It descended from the PC branch:

- **Scream Tracker** (1990) by Sami "Psi" Tammilehto of Future Crew (Finland). The first popular PC tracker. Created the .STM format.
- **Scream Tracker 3** (1993). The breakthrough: 32 channels, the .S3M format, and uniquely, **9 FM synthesis channels via OPL2/OPL3 chips** alongside PCM sample playback.
- **Impulse Tracker** (1995). Took ST3's interface as a starting point and built something far more ambitious.

The GUI was directly influenced by Scream Tracker 3. It was text-mode, keyboard-driven, and shared the same general layout philosophy. But the engine underneath was completely different.

## What was revolutionary

### New Note Actions (NNA)

The single most important innovation in tracker history after the tracker paradigm itself.

In every previous tracker, channels were monophonic: one note per channel at a time. Play a new note, the old one cuts instantly. If you wanted a chord to sustain while a melody plays over it, you needed to dedicate separate channels. 4-channel ProTracker songs were a constant juggling act.

NNA changed this. When a new note triggers on a channel that's already playing, IT doesn't just cut the old note. Instead, the old note is moved to a **virtual background channel** and continues according to the NNA setting:

- **Cut**: Silence immediately (traditional behavior)
- **Continue**: Keep playing in the background indefinitely
- **Note Off**: Enter the release phase (like releasing a key on a synthesizer)
- **Note Fade**: Fade out at a configurable rate

This meant a single channel could produce polyphonic-like behavior. A piano part that previously needed 4 channels could now use 1, because old notes ring out naturally while new ones trigger. IT's 64 channels were 64 *foreground* channels, but with NNA the actual simultaneous voice count could be much higher.

Complementing NNA was the **Duplicate Check** system: per-instrument DCT (Duplicate Check Type) and DCA (Duplicate Check Action) settings that detect when a duplicate note/instrument/sample is already playing and apply an action (cut/off/fade). This prevented voice pileup in a more targeted way than NNA alone.

**Past Note Actions** (S70-S72 effects) controlled notes that had already been backgrounded, so you could retroactively cut, off, or fade them. This produced three layers of voice management: NNA for new triggers, Duplicate Check for specific duplicates, and Past Note Actions for cleanup.

This is directly relevant to our voice worklet architecture. When a new note triggers on a track, what happens to the voice that is already playing?

### Resonant filters

IT was the first (and only) DOS tracker with per-instrument resonant filters. Each instrument could have a lowpass filter with cutoff (0-127) and resonance (0-127). Filter state was per-channel. The Zxx MIDI macro effect controlled cutoff in real-time from pattern data.

Version 2.15 (beta) added filter envelopes. The pitch envelope could act as a filter envelope, automating cutoff over the note's lifetime. This brought synthesizer-level sound design to a free DOS tracker.

No other DOS tracker had this. FT2 had no filtering at all. It was hardware sampler/synth technology in software.

### The edit mask

A column-selective editing system unique to IT. The comma key toggles which fields are affected when entering a note: instrument, volume, and effect can independently "come with" the note or be left untouched. The note field is always written (immutable mask).

This enabled layered workflow: enter all the notes first, then make a second pass adding instruments, then a third pass adding effects. The cursor skips masked-off columns, so you're only navigating the fields you're working on. A drummer could enter rhythm patterns without touching instrument or effect columns.

No other tracker had this. ProTracker and FT2 required positioning the cursor on each specific sub-field. IT's edit mask turned pattern editing from "navigate to each field" into "flow through the relevant fields."

### Other innovations

- **64 channels** (double FT2's 32)
- **Pitch envelopes** alongside volume and panning (three envelope types vs FT2's two)
- **Cubic spline interpolation** for superior sample playback quality
- **Sustain loops**: Samples could have independent sustain and regular loops. The sustain loop plays while the note is held; on note-off, playback continues to the regular loop. This enabled realistic release behavior tied to NNA.
- **100% assembly**: Enabled 64-channel mixing on 486 hardware that struggled with 32 channels in competitors

## The "power user" reputation

IT attracted a specific kind of musician: technically minded, keyboard-fluent, willing to climb a learning curve for a higher ceiling. The text-mode interface displayed more data per screen than FT2's graphical UI. The keyboard-driven workflow was faster once learned. The edit mask, skip value, and multichannel mode rewarded expertise with dramatic editing speed.

Community voices describe a "finger feel" that combines tactile keyboard response, cursor advancement timing, and edit-mask flow. SchismTracker exists as a separate project from OpenMPT specifically to preserve this intangible quality. It is not only about features. It is also about how the workflow feels under the fingers.

## The end

IT's shareware model relied on a single revenue stream: a stereo WAV writer plugin. Around 1998, the WAV writer was leaked publicly. With no income and DOS dying under Windows, Lim discontinued development after version 2.14 (April 8, 1999). Version 2.15 with filter envelopes and IPX networking was never officially released.

The cultural split with FT2 also played a role. IT attracted techno/industrial/demoscene, while FT2 attracted synthpop/orchestral scenes. They were different tools for different communities. Neither "won." They coexisted and then declined together as Windows displaced DOS.

## Notable alumni

- **C418** (Daniel Rosenfeld): began in IT and later composed the Minecraft soundtrack.
- **Deadmau5**: early career work in Impulse Tracker before switching to DAWs
- **Bogdan Raczynski**: produced albums entirely in IT, signed to Aphex Twin's Rephlex Records. Aphex Twin cited him as an influence on Drukqs (2001).
- **Necros** (Andrew Sega): one of the most celebrated tracker musicians and co-founder of Straylight Productions.
- **Sean Tyas**: trance producer, started in IT

## What to be inspired by

- **NNA as voice management**: Three layers (NNA, Duplicate Check, Past Note Actions) map directly to our voice worklet lifecycle. When a new note triggers, what happens to the existing voice? Cut, continue, release, and fade are all behaviors we should support explicitly.
- **The edit mask**: Our `EditMask` type already exists in TrackerState. IT proved this is the most efficient way to do pattern editing.
- **Resonant filters per voice**: Our voice worklets have per-voice insert chains. IT proved that per-instrument filtering is essential for sound design in a tracker.
- **The "finger feel" principle**: The intangible quality of how an interface responds to rapid keyboard input. For a browser-based tracker, input latency matters. Key events should translate to visual and audio feedback within one frame.
- **Single-developer ambition**: 230,000 lines of assembly, one person, the most advanced DOS tracker ever. Proof that one developer can build something remarkable with enough focus and constraint.

## Sources

- [Impulse Tracker — Wikipedia](https://en.wikipedia.org/wiki/Impulse_Tracker)
- [IT file format — Wikipedia](https://en.wikipedia.org/wiki/Impulse_Tracker#IT_file_format)
- [Jeffrey Lim's 20-year retrospective](http://roartindon.blogspot.com/2014/02/20-years-of-impulse-tracker.html) (4 parts)
- [Source code — GitHub](https://github.com/jthlim/impulse-tracker)
- [ITTECH.TXT format spec — SchismTracker wiki](https://github.com/schismtracker/schismtracker/wiki/ITTECH.TXT)
- [Scream Tracker — Wikipedia](https://en.wikipedia.org/wiki/Scream_Tracker)
