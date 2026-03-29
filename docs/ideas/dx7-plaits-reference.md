# DX7 architecture and the Plaits implementation

Reference notes on the Yamaha DX7's FM architecture and how Émilie Gillet implemented it in Mutable Instruments Plaits (`../eurorack/plaits/dsp/fm/`). This is not a spec to implement. It is a reference for understanding the full picture of multi-operator FM.

## DX7 overview

The DX7 is a 6-operator FM synth with 32 algorithms. Each operator is a sine oscillator with its own 4-stage envelope, level, frequency ratio, detune, and keyboard scaling. The algorithm determines how operators are wired together. It defines which ones modulate which, and which ones output audio.

One operator per algorithm can have self-feedback. There's a global pitch envelope, an LFO with multiple waveforms, and a velocity/keyboard scaling system that adjusts operator levels based on what note you're playing and how hard you hit it.

## Operator

In the Plaits implementation, an operator is minimal runtime state:

```cpp
struct Operator {
    uint32_t phase;     // 32-bit fixed-point phase accumulator
    float amplitude;    // current output amplitude (ramped between samples)
};
```

The phase is a 32-bit integer where the full range (0 to 2^32) represents one cycle. Overflow wraps naturally, so no modulo is needed. This is more efficient than the float-based 0-1 phase that DaisySP uses, and gives better phase precision.

Each sample, the operator:
1. Increments phase by a frequency value
2. Looks up the sine of (phase + modulation input)
3. Multiplies by the current amplitude
4. Writes to an output buffer

The modulation input comes from one of three sources:
- **Another operator's output** (normal FM chain)
- **Self-feedback** (previous two samples averaged and scaled)
- **Nothing** (unmodulated carrier)

## Feedback

Feedback uses a 2-sample history buffer. The feedback signal is the average of the last two samples, scaled by a power-of-two factor:

```
feedback = (previous[0] + previous[1]) * (1 << fb_amount) / 512
```

`fb_amount` ranges 0-7. At 0, feedback is off. At 7, the feedback is strong enough to produce noise-like harmonics. The two-sample averaging smooths the feedback to prevent it from going unstable too quickly.

Every algorithm has exactly one operator that can self-modulate. This is a DX7 constraint. Cross-feedback (operator A feeds back into operator B which feeds back into A) would create a circular dependency that is hard to render in a single pass.

## Algorithms

The DX7 has 32 algorithms. Each one defines a different routing of the 6 operators. They range from a pure serial chain (op 6 → 5 → 4 → 3 → 2 → 1, maximum modulation depth) to mostly parallel (most operators output directly, minimal modulation).

### The opcode system

Plaits encodes each algorithm as 6 bytes, with one opcode per operator. Each opcode packs:

- **Bits 0-1**: destination buffer (where this operator writes its output)
- **Bit 2**: additive flag (add to buffer vs. overwrite)
- **Bits 4-5**: modulation source (which buffer modulates this operator)
- **Bit 6**: feedback source flag (this operator provides the feedback signal)

This is clever because it turns arbitrary routing topologies into a linear sequence of operations on numbered buffers. The "compiler" walks the opcodes and groups consecutive operators with compatible data flow into batched render calls.

For example, a simple chain `op3 → op2 → op1` compiles to one render call that processes 3 operators in sequence, each reading the previous one's output buffer as modulation. A branching topology gets broken into multiple render calls.

### Algorithm categories

The 32 algorithms roughly fall into categories:

**Serial chains** (algorithms 1-5): Long modulation chains producing deep, complex FM. Algorithm 1 is the purest: 6 → 5 → 4 → 3 → 2 → 1.

**Branching** (algorithms 6-15): Multiple modulators feeding into shared carriers, or parallel chains that merge. More control over individual harmonic components.

**Parallel pairs** (algorithms 16-18): Two or three independent FM stacks mixed together. Each stack has its own character.

**Wide/additive** (algorithms 19-32): Many operators output directly with less modulation. Approaches additive synthesis at low FM depths. Some have modulation sharing, where one modulator feeds multiple carriers.

### What this means practically

Most useful timbres come from a small subset of algorithms. The classic DX7 electric piano is algorithm 5. Brass patches often use algorithm 1 or 2. Bell sounds work well with algorithms that have one or two modulation chains. The wide algorithms (19-32) are less commonly used but good for pad-like sounds.

## Per-operator envelope

The DX7 envelope is a 4-stage envelope, but it is not a standard ADSR. Each stage has a rate and a target level. The envelope moves from whatever level it is currently at toward the target at the specified rate. The stages are:

1. Attack: moves toward level 1 (usually max)
2. Decay: moves toward level 2
3. Sustain: moves toward level 3 (held while key is down)
4. Release: moves toward level 4 (usually zero, triggered on key up)

This is more flexible than ADSR because any stage can go up or down. The sustain level does not have to be below the decay level. You can create envelopes that rise in multiple stages, dip and recover, or have non-zero release targets.

### DX7 envelope quirks (preserved in Plaits)

- **Ascending segments are logarithmic**: When moving to a higher level, the curve is reshaped to approximate the DX7's characteristic attack shape. Descending segments are linear.
- **Low-level floor**: Values below ~6.7 are clamped up, preventing near-zero values from creating extremely slow segments.
- **Rate scaling**: Envelope speed increases with pitch. Higher notes have faster envelopes. This mimics acoustic instruments where higher-pitched sounds decay faster.
- **Keyboard scaling**: Operator level can be adjusted based on the MIDI note, with separate curves for left and right sides of a breakpoint. Four curve types: linear up/down, exponential up/down.

## Frequency modes

Each operator can run in one of two frequency modes:

**Ratio mode** (default): Frequency = note frequency × coarse ratio × fine adjustment. Coarse ratios are looked up from a table (0.5, 1, 2, 3, ... 31). Fine adds sub-ratio detuning. The operator tracks the keyboard. Play a higher note and the operator runs faster.

**Fixed mode**: Frequency is a fixed Hz value regardless of what note is played. Coarse sets a base (1, 10, 100, 1000 Hz), fine adds offset. Useful for noise-like effects, inharmonic metallic sounds, or operators that shouldn't track pitch.

## LFO

One global LFO per voice with 6 waveforms:

| # | Waveform | Character |
|---|----------|-----------|
| 0 | Triangle | Smooth, symmetric |
| 1 | Ramp down | Sawtooth falling |
| 2 | Ramp up | Sawtooth rising |
| 3 | Square | On/off modulation |
| 4 | Sine | Smooth, like triangle but rounder |
| 5 | Sample & hold | Random value each cycle |

The LFO has a delay parameter. It fades in over time after a note triggers, so vibrato or tremolo can develop gradually. The Plaits implementation uses a two-stage delay ramp for smooth onset.

LFO modulates two targets:
- **Pitch** (vibrato): applied globally to the voice frequency
- **Amplitude** (tremolo): applied per-operator, scaled by each operator's amp mod sensitivity

## DX7 patch format

The Plaits implementation uses a struct that mirrors the DX7 SysEx format:

- 6 operators × (envelope + keyboard scaling + rate scaling + amp mod + velocity + level + mode + coarse + fine + detune)
- Global pitch envelope
- Algorithm number (0-31)
- Feedback amount (0-7)
- Phase reset flag
- LFO parameters (rate, delay, pitch depth, amp depth, waveform, pitch mod sensitivity)
- Transpose
- Patch name (10 chars)

This means Plaits can load actual DX7 patches from SysEx dumps. The conversion functions in `dx_units.h` handle the mapping from DX7's 0-99 parameter ranges to the internal float representations.

## Rendering pipeline

The full render flow per audio block:

1. **Pitch**: Combine base note + pitch envelope + LFO pitch mod → base frequency `f0`
2. **Per-operator frequency**: `f[i] = ratio[i] * f0` (or fixed Hz if in fixed mode)
3. **Per-operator amplitude**: envelope output × velocity × keyboard scaling × rate scaling × (brightness for modulators, amp mod for carriers)
4. **Algorithm render**: Execute the compiled render calls. Each call processes a group of operators, reading modulation from buffers and writing output to buffers
5. **Sum**: Buffer 0 contains the final mixed output

The amplitude values are ramped linearly across the block to prevent clicks when parameters change.

## What this means for helm-audio

The DX7/Plaits architecture is the ceiling: 6 operators, 32 algorithms, and full SysEx compatibility. We do not need that full scope for a game sound engine, but the concepts are directly applicable:

- **Per-operator envelopes** are the most important feature we've already implemented. They're what give FM its expressive range.
- **The opcode approach** is elegant but only necessary when you have many algorithms. With 3-4 algorithms, hardcoded render paths are simpler and more readable.
- **Feedback** is a high-value addition. It requires one float parameter and a 2-sample buffer per operator, and it adds significant harmonic range.
- **Fixed frequency mode** is interesting for percussion and effects. Low-cost to add since it's just a branch in frequency calculation.
- **Rate scaling** (faster envelopes at higher pitches) is a subtle but musically important detail. Worth considering when we polish the voice.

## Source files

All in `../eurorack/plaits/dsp/fm/`:

- `voice.h`: 6-operator voice, render pipeline
- `operator.h`: operator state and the templated `RenderOperators` function
- `algorithms.h` / `algorithms.cc`: 32 algorithms encoded as opcodes
- `patch.h`: DX7-compatible patch structure
- `dx_units.h`: parameter conversion functions (DX7 0-99 ranges to internal floats)
- `envelope.h`: 4-stage envelope with DX7 quirks
- `lfo.h`: LFO with 6 waveforms and delay
