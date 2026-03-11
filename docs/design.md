# Design

## Inspiration

### Trackers

The tracker tradition — Ultimate Soundtracker, ProTracker, FastTracker 2, Impulse Tracker — provides the structural foundation. A tracker is a grid: rows are time, columns are channels, cells hold events. The cursor advances down the grid, one step at a time, and the engine executes whatever it finds. Empty cells mean "no change." This is the simplest possible sequencing model and it maps directly to our architecture.

What we take from trackers:

- **The grid.** Patterns are rows × tracks. Each step is addressable. The engine walks rows at a fixed tempo.
- **Sticky state.** Set a parameter, it latches until explicitly changed. Most cells are empty. Efficient for storage, efficient for the musician's (or generator's) mental model.
- **Patterns as the unit of composition.** A pattern is a self-contained loop. Arrangement is a sequence of patterns. This separation makes generative composition natural — JS builds patterns, the engine loops them.
- **Everything is data.** Notes, parameters, voice changes — all just typed values in cells. Trivially serializable to binary.

What we don't take:

- **Fixed row count or timing.** Traditional trackers use 64 rows at a fixed speed/tempo. We use variable-length patterns with per-track step counts.
- **Sample playback.** Trackers were built around pitching recorded samples. We synthesize with FM.
- **Effect column hex commands.** The classic tracker effect column (portamento, arpeggio, vibrato as hex codes) is replaced by parameter locks — named, typed fields rather than opaque command bytes.

### Elektron

Elektron's sequencer concepts (Digitakt, Analog Four, Syntakt) inform how we think about per-step control and generative variation. Elektron took the tracker grid and made it more expressive.

What we take from Elektron:

- **Trigs.** Each step can carry a trigger (note on, note off, sound change) independently from parameter changes. A step isn't just "play a note" — it's a bundle of actions.
- **Parameter locks.** Any synthesis parameter can be overridden on a single step without changing the base sound. The step carries only the fields that changed — a partial override, not a full snapshot.
- **Sound locks.** A single step can load an entirely different voice for that trigger. Our voice config + trig system achieves this.
- **Trig conditions.** Steps can have conditions — fire on first loop only, probability-based, every Nth loop. Our oneshot flag is the starting point, with room for richer conditions.
- **Per-track length.** Each track can have a different step count. A 16-step kick against a 13-step bass against a 7-step pad creates polymetric cycles that don't repeat for a long time. This is a primary source of generative complexity from simple material.

### Sega Mega Drive / Genesis

The YM2612 FM chip and its sound drivers (SMPS, GEMS) are a reference for how the engine is structured. Not an emulation — an adaptation of proven patterns for a browser game context.

What we borrow:

- **Fixed channel assignment.** The Genesis had 6 FM channels, each owned by a track. We have 16. JS decides which track gets which voice — the engine just executes.
- **Per-track streams with a shared clock.** Each Genesis channel had its own linear sequence data, walked forward by a single timing source. Our sequencer does the same: per-track step lists, one clock advancing them all.
- **Sticky state.** On the Genesis, setting an instrument or volume latched until explicitly changed. Same principle — voice configuration persists, trigs override specific parameters per step.
- **SFX channel stealing.** Genesis drivers could temporarily commandeer a music channel for a sound effect, then restore the music state. Our oneshot trigs and voice reassignment serve the same purpose.
- **Compact binary protocol.** Genesis sequence data was tightly packed bytecode. Our binary protocol (via `@bitmachina/binary`) encodes patterns as flat binary buffers transferred zero-copy over MessagePort.

What we do differently:

- **Step-based patterns.** Genesis drivers used accumulated durations (play note, wait N ticks, next event). We use a grid — each step is a sixteenth note, each column is a track.
- **Decoded up front.** Genesis drivers interpreted bytecode on the fly from the Z80. We decode the binary buffer into typed structs at load time, then the sequencer just walks the grid. Safer, easier to validate.
- **Effects routing.** The YM2612 had no DSP — all timbral character came from the FM patch itself. We have DaisySP effects (chorus, overdrive, decimator, etc.) that can be routed per-voice or on a shared bus.
- **Full voice config inline.** Genesis drivers referenced an instrument table by index. We can send full parameter sets per trig because memory isn't constrained. Simpler, no table management.

## System noise as ambient music

The boundary between sound effects and music is intentionally blurred. The game state *is* the composer.

The 16-track engine doesn't distinguish between "SFX tracks" and "music tracks." Any track can carry any kind of pattern. This opens up a design space where the game's activity generates an ambient score:

- **Star spectrum.** The density and spectral class of nearby stars could modulate FM parameters — carrier ratios, modulation indices — creating a slowly evolving harmonic texture that reflects the local environment.
- **Ship systems.** Engine thrust, shield charge, weapon heat — continuous game telemetry mapped to filter sweeps, LFO rates, and envelope shapes across dedicated ambient tracks.
- **Anomalies.** Encountering something unusual in space could introduce dissonance — detuned intervals, harsh modulation indices, effects chain changes — that resolve as the player investigates or moves away.
- **Activity layering.** Quiet exploration might use 6-8 tracks for ambient texture, leaving the rest for SFX. Combat could flip that ratio. The JS layer manages this allocation based on game state.

Each step is a sixteenth note. A 16-step pattern is one bar of 4/4. The internal clock runs at 24 PPQ (6 ticks per sixteenth note), and each step can carry a micro-timing offset to nudge it earlier or later — enabling swing and precise placement of one-shot trigs between grid lines. The grid stays simple for authoring and visualization; the fine clock handles the nuance.

The primary output is ambient generative music — evolving textures, slow parameter changes, polymetric phasing. Sound effects don't need immediate timing either. All ship actions in Helm are processed through a queue; the game is turn-based and slow-paced, so a sound effect landing on the next grid boundary fits the feel. Delay is part of the expectation, not a compromise.

The sequencer doesn't care what it's playing — it just fires trigs on steps. Whether those trigs come from a generative system responding to game telemetry or a hand-authored pattern, the engine executes them the same way.
