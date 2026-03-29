# Elektron sequencer

Reference notes on the Elektron sequencer as implemented across their instruments (Digitakt, Digitone, Analog Four, Syntakt, Octatrack). Verification is primarily against the Digitone II manual, with cross-device notes where behavior is known to differ. This is not a spec to replicate. It is a reference for understanding what makes their approach to step sequencing distinctive, and how it informs what we're building.

## Core architecture

Elektron sequencers are 16-step grids displayed on 16 physical trig buttons. Pattern length is page-based. On newer boxes such as Digitone II, patterns can extend to 128 steps across 8 pages. This keeps the interface tactile because you always have 16 buttons, while still supporting longer sequences.

Patterns are organized in banks (typically 8 banks × 16 patterns = 128 per project). Each pattern contains all track data, tempo, swing, scale/length settings, and sound references.

Three recording/editing modes exist on current Elektron workflows: **grid recording** (step-entry, press buttons to place/edit trigs), **live recording** (play in real time while the pattern loops, captures note, velocity, and micro-timing), and **step recording** (cursor/advance style entry). They produce compatible sequencer data through different input workflows.

## Trig types

Elektron distinguishes several trig types that serve different purposes:

**Note trigs** are the standard trigger. They fire the sound on that step, carrying note, velocity, length, micro-timing, retrig settings, trig condition, and any parameter locks.

**Trigless locks** place parameter lock data on a step without retriggering the sound. This is essential for modulating parameters on a sustained note. For example, you can change filter cutoff midway through a held pad without restarting the amplitude envelope. The sound continues, and only the parameters change.

**Trigless trigs** (Octatrack) retrigger LFOs and effect envelopes without retriggering the main sound source. A middle ground between a full note trig and a trigless lock.

Note length is per-trig, ranging from 1/8 of a step to 128 steps, or infinite (tied notes). This means two notes on the same track can have completely different durations.

## Parameter locks

The defining Elektron feature. Every tweakable parameter on the synth engine can be given a unique value on any step.

How they work:
1. Each track has a base sound with default values for all parameters.
2. On any step with a trig, you hold the trig button and turn a knob. That parameter is then "locked" to that step.
3. When the sequencer reaches that step, it sends the locked value instead of the base value.
4. After the trig's note duration ends, the parameters revert to the base patch. There is no interpolation. Values snap to the locked value on the step, then snap back.

Every parameter on every parameter page is lockable: filter cutoff, resonance, envelope times, LFO speed, oscillator tuning, effects sends, and sample start point.

**Sound locks** are a special form of p-lock that swap the entire sound/preset on a per-step basis. Hold a trig, browse the sound pool, and assign a different sound to that step. This means a single track can play a kick on step 1, a snare on step 5, and a clap on step 9. In practice, that effectively multiplies the number of available voices beyond the track count.

**Parameter slide** (Analog Four): a dedicated slide trig causes all p-locked values on that step to smoothly glide from the previous values. The glide rate is tempo-synced and completes when the next trig arrives. This creates smooth parameter transitions instead of the default per-step snapping.

## Micro-timing

Each trig can be nudged forward or backward from its grid position with sub-step resolution. In grid recording, you hold a trig and press left/right to access micro-timing. Each step stores its own offset independently.

The resolution is fine enough for humanized grooves, flams, or ghost notes that sit just behind the beat. Scale multiplier settings (2x, 3/4x) interact with micro-timing resolution since they change effective step duration.

## Trig conditions

Trig conditions determine whether a trig fires based on runtime state. The full system:

**Pattern count (A:B)**: A = which playthrough the trig fires on, B = total playthroughs before the count resets. 1:2 fires on odd loops. 2:2 on even loops. 3:4 fires every 4th cycle on the 3rd pass. Available up to 8:8. This creates deterministic variation. The pattern evolves over multiple loops without any randomness.

**Probability (X%)**: A percentage chance (1-100%) that the trig fires. Independent per step, evaluated each time.

**Fill / !Fill**: Fill fires only when Fill mode is active (a momentary performance button). !Fill fires only when Fill is not active. Lets you layer a normal pattern and a fill variation on the same track.

**1st / !1st**: Fires only on the first playthrough (intro hits) or every playthrough except the first.

**PRE / !PRE**: Fires if the most recently evaluated trig condition on the same track was true/false. Creates if-then dependency chains within a track.

**NEI / !NEI**: Fires if the most recently evaluated trig condition on the neighboring track (immediately before) was true/false. This creates inter-track dependencies, where one track's behavior influences another.

Trig conditions can be combined with parameter locks (conditional locks). This allows a parameter change to happen only under certain conditions.

## Retrig

Retrig subdivides a single step into multiple rapid retriggers. Typical per-step controls include:

- **Rate**: subdivision amount (exact ranges vary by device/firmware).
- **Length**: the duration over which the velocity curve operates (0.125 steps to infinite).
- **Velocity curve**: controls fade in/out of retrigs. -128 = full fade out, 0 = flat, 127 = full fade in.

## Polymetric tracks

Each track can have its own independent step length. A 16-step kick against a 13-step bass against a 7-step pad creates cycles that don't repeat for a long time (LCM of the step counts). Setting the master length to INF prevents forced collective resets, letting the polymeter run freely.

## Swing

Swing delays every second sixteenth note (even-numbered steps). It is stored per pattern. On some devices (Machinedrum, Octatrack), you can toggle which specific steps are affected by swing, enabling non-standard groove patterns.

## Pattern chaining and song mode

Patterns chain sequentially. While one plays, you queue the next. **Change length** controls how long the active pattern plays before the queued pattern begins.

Song mode (added via firmware updates on newer devices) sequences patterns into rows with loop counts and durations. Chains can be converted into song rows.

## What we take from Elektron

### Already implemented

**Trigs as typed actions.** Our `Trigger` variant (`NoteOn`, `NoteOff`, `FadeOut`) maps directly to Elektron's trig types. A step is not just "play a note." It is a bundle of actions that includes patch loading, triggering, and parameter overrides.

**Parameter locks.** Our `ParamLock` variant (`LockRatio`, `LockIndex`, `LockFilterFreq`, etc.) implements per-step partial overrides of the base patch. Only the changed fields are sent. The rest inherits from the track's current state.

**Sound locks.** Our `patchIndex` field on a step loads an entirely different voice configuration before triggering. Combined with a trig on the same step, this achieves the same effect as Elektron's sound locks. One track can produce multiple timbres.

**Per-track step length.** Each track in our `Pattern` has its own `steps` vector. A 16-step track and a 13-step track cycle independently via track-local ticks. Polymetric sequencing from the start.

**Micro-timing.** Our `int8_t microTiming` offset per step (-5 to +5 ticks within a 6-tick window) nudges trigs earlier or later. The cursor + peek model handles negative offsets by looking ahead to the next step. It is the same concept as Elektron, with a different implementation.

**Oneshot trigs.** Our `oneshot` flag on a step fires on the first loop only. This is the starting point of Elektron's trig condition system.

**Dispatch order.** Patch load → trig → param locks. Same as Elektron's implicit ordering where sound setup happens before the trig fires.

### Not yet implemented, worth considering

**Trig conditions (A:B pattern count).** This is one of the most powerful sources of variation in Elektron sequencers. Our `loopCount` per track already tracks which playthrough we're on, so extending the oneshot flag to a full A:B condition is straightforward. A 4-bar pattern with 1:4, 2:4, 3:4, 4:4 conditions creates a 16-bar phrase from a single pattern.

**Probability.** Per-step percentage chance. Simple to implement (one `uint8_t` per step, random check at dispatch time), high value for generative music. Fits our ambient game audio use case well.

**Fill mode.** A global boolean toggled by the JS layer. Steps with a Fill condition fire only when Fill is active. This is useful for responsive game audio, where game state toggles Fill and pre-authored fills play automatically.

**PRE/NEI conditional logic.** Inter-step and inter-track dependencies. More complex, but creates surprisingly musical results from simple patterns. Worth exploring after the basic condition system works.

**Trigless locks.** Parameter changes without retriggering. Currently our steps either have a trig or do not. A step with only param locks and no trig would achieve this. It might already work if we dispatch locks regardless of trig state, but this needs verification.

**Note length per trig.** Elektron stores duration per note, automatically sending note-off after the duration. We currently rely on explicit NoteOff trigs placed by JS. Per-trig length would simplify pattern authoring and reduce the number of steps JS needs to populate.

**Retrig.** Subdivision within a step. Would require the sequencer to fire multiple note-ons within a single step's tick window, with velocity ramping. More complex, but creates rhythmic effects (rolls, buzz, crescendo) that are hard to achieve otherwise.

**Parameter slide.** Smooth interpolation between p-locked values across steps. Currently our locks snap instantly. Slide would require the synth to interpolate parameters over the duration between two steps. The sequencer could fire a "begin slide to value X" event and let the synth handle the ramp.

### What we don't take

**Page-based UI paradigm.** Our patterns are built by JS, not edited on a 16-button grid. Pattern length isn't constrained by UI pages.

**Complex arpeggiator.** Elektron's per-track arpeggiator is deeply integrated with their keyboard workflow. Our patterns are generated, not played. If we want arpeggiation, JS should generate the pattern.

**MIDI tracks.** We're an internal sound engine, not a MIDI sequencer.

**Per-pattern tempo and swing storage.** Our tempo lives in JS (caller-driven timing). Swing is implemented via micro-timing offsets on individual steps, which is more flexible. JS can apply any groove template by setting offsets, not just even-step delay.

## The core insight

Elektron's innovation is not any single feature. It is the interaction between features in a unified system. Parameter locks turn a step sequencer into a modulation sequencer. Trig conditions turn a fixed loop into an evolving phrase. Sound locks decouple tracks from voices. Per-track length creates polymetric complexity. Trigless locks separate parameter automation from note triggering.

We've implemented the structural foundation: typed trigs, param locks, sound locks, polymetric tracks, and micro-timing. The next layer of expressiveness comes from the conditional system (A:B counts, probability, fill, PRE/NEI), which builds on what is already there without changing the core architecture. The sequencer already tracks loop count per track, so trig conditions become a dispatch-time filter on existing data.
