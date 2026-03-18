# Voice

An FM voice built from individual operators using DaisySP modules. The voice doesn't know about tracks, patterns, or the synth. It receives commands (configure, note on, note off, fade out) and produces audio samples.

## Goals

This voice is being built incrementally as a way to learn FM synthesis and DSP programming from the ground up. Each step is chosen to teach a concept — per-operator envelopes, feedback, multi-operator routing — before moving to the next. The end product matters, but understanding how and why it works matters more.

The work is documented in a companion blog series on [johnhooks.io](https://johnhooks.io) with interactive WebAudio demos that explore each concept before we implement it in C++.

## Influences

- **Yamaha DX7** — the canonical 6-operator FM synth. Its architecture (operators, algorithms, per-operator envelopes) is the model we're building toward, not replicating wholesale.
- **Mutable Instruments Plaits** (`../eurorack/plaits/dsp/fm/`) — Émilie Gillet's open-source implementation of a full DX7-compatible FM engine. Our primary code reference for operator rendering, algorithm encoding, feedback, and envelope behavior.
- **Mutable Instruments Rings** (`../eurorack/rings/dsp/fm_voice.*`) — a simpler 2-operator FM voice with feedback on both modulator and carrier. A good reference for the initial 2-op stage.
- **DaisySP** (`../DaisySP`) — provides the building blocks we use directly (`Oscillator`, `Adsr`, `Svf`). We started with its `Fm2` wrapper and are now replacing it with raw operators for more control.
- **DaisyExamples** (`../DaisyExamples`) — usage patterns for DaisySP modules, including FM voices with LFO modulation and envelope-scaled FM depth.

## Design

The Voice is the FM voice. There is no separate FM engine class — this is a Digitone-style instrument committed to FM, not a multi-engine synth. Operators, filter, envelopes, and lifecycle all live in one class that grows as we learn. 2 operators becomes 3, feedback gets added, algorithms get added — all within Voice.

### Why replace daisysp::Fm2

DaisySP's `Fm2` is a convenience wrapper that hides the operator internals. It doesn't expose per-operator envelopes, feedback, or routing. To build an FM voice where the timbre evolves over time (the modulator's envelope decaying faster than the carrier's, for example), we need direct access to each operator's amplitude per-sample. Building from `Oscillator` + `Adsr` gives us that control.

### Operator

An operator is the atomic unit of FM synthesis:

```cpp
struct Operator {
    daisysp::Oscillator osc;  // sine oscillator
    daisysp::Adsr env;        // per-operator envelope
    float ratio = 1.0f;       // frequency relative to the note
    float detune = 0.0f;      // fine detune in Hz
    float level = 1.0f;       // output amplitude scalar
};
```

The oscillator runs at `noteFrequency * ratio + detune`. The envelope controls the operator's output amplitude per-sample. For a modulator, this means the FM depth changes over the note's lifetime — bright attack decaying to a pure tone, bell-like transients, evolving textures.

### Signal chain (2-operator)

```
modulator.osc → × mod.env × index → carrier.osc.PhaseAdd
                                      ↓
                                  carrier.osc
                                      ↓
                                    filter
                                      ↓
                                × amp envelope
                                      ↓
                                    output
```

The modulator's sine output is scaled by its own envelope and the FM index, then added to the carrier's phase. The carrier's output goes through a filter and amplitude envelope. This is identical to what FM2 does internally, except the modulator has its own envelope.

The amplitude envelope is separate from the operator envelopes. Operator envelopes shape the timbre (how bright/complex the sound is over time). The amplitude envelope shapes the volume (attack, sustain, release of the note itself).

### Patch structure

```cpp
struct OperatorPatch {
    float ratio = 1.0f;
    float detune = 0.0f;
    float level = 1.0f;
    float attack = 0.01f;
    float decay = 0.1f;
    float sustain = 1.0f;
    float release = 0.3f;
};

struct Patch {
    // Operators (index 0 = carrier, index 1 = modulator)
    OperatorPatch ops[2];

    // FM depth — scales the modulator's output before it hits the carrier
    float index = 1.0f;

    // Filter
    float filterFreq = 8000.0f;
    float filterRes = 0.0f;

    // Amplitude envelope
    float attack = 0.01f;
    float decay = 0.1f;
    float sustain = 0.7f;
    float release = 0.3f;
};
```

The `index` field is the overall FM depth. The modulator's effective output at any sample is `osc_output * env_output * level * index`. This means you can shape the modulation depth through three independent controls: the operator's level (static), the operator's envelope (time-varying), and the patch's index (global depth, param-lockable from the sequencer).

### Growing toward multi-op

The 2-operator architecture is the foundation. Future steps add complexity without rewriting:

- **3+ operators**: Add more entries to the operators array. Routing defines which operators modulate which.
- **Algorithms**: A routing configuration that says "op 2 modulates op 1, op 3 modulates op 2" or "ops 2 and 3 both modulate op 1." Start with a few hardcoded algorithms, potentially move to the opcode approach from Plaits if we need many.
- **Feedback**: An operator's previous output fed back into its own phase. One float parameter per operator, a one-sample delay buffer.
- **Operator waveforms**: The DaisySP Oscillator supports multiple waveforms (sine, triangle, saw). We start with sine only but the option is there.

## Responsibilities

- Own two operators (carrier + modulator), a filter, and an amplitude envelope
- Accept a `Patch` configuration and apply it to operators, filter, and envelope
- Handle note on (set frequencies from MIDI note, trigger all envelopes)
- Handle note off (release all envelopes)
- Handle fade out (override amp envelope to a short release for clean voice swapping)
- Process one sample: FM synthesis → filter → amplitude envelope → output
- Report current state (idle, active, fading)

## Interface

```cpp
class Voice {
public:
    void Init(float sampleRate);
    void Configure(const Patch& patch);
    float Process();
    void NoteOn(uint8_t note, uint8_t velocity);
    void NoteOff();
    void FadeOut();
    VoiceState GetState() const;
};
```

The synth and sequencer don't need to know about operators — that's internal to the voice.

## Plan

### Step 1: Replace daisysp::Fm2 with raw operators ✓

- [x] Define `Operator` struct (Oscillator + Adsr + ratio + detune + level + feedback)
- [x] Define `OperatorPatch` and update `Patch` with per-operator params and FM index
- [x] Replace `daisysp::Fm2` with two `Operator` instances in Voice
- [x] Wire modulator → carrier via `PhaseAdd`, modulator amplitude scaled by its envelope and index
- [x] Carrier envelope scales carrier output (not just the amplitude envelope)
- [x] Keep the existing filter and amplitude envelope
- [x] Verify existing voice tests still pass (same external interface)

### Step 2: Self-feedback ✓

- [x] Add a feedback parameter to `OperatorPatch`
- [x] Implement 2-sample feedback buffer per operator (averaged for stability, same as DX7/Plaits)
- [x] Either operator can self-modulate — modulator feedback enriches the modulation source, carrier feedback adds harmonics to the output
- [ ] Test: feedback at moderate values produces richer harmonics, high values produce noise

### Step 3: Render and listen

- [ ] Create patches that exercise the modulator envelope: bell (fast mod decay), pad (slow mod attack), pluck (fast mod and amp decay)
- [ ] Create patches that exercise feedback: clean vs. modulator feedback vs. carrier feedback
- [ ] Render to WAV, listen — does the modulator envelope make an audible difference?

### Step 4: New tests

- [ ] Test: modulator envelope at zero sustain produces a timbre that changes over time (bright attack → pure sine)
- [ ] Test: carrier envelope shapes carrier amplitude independently from voice amplitude envelope
- [ ] Test: index 0 produces a pure sine regardless of modulator settings
- [ ] Test: per-operator ratio affects pitch of harmonics
- [ ] Test: NoteOff releases operator envelopes, output eventually reaches zero
- [ ] Test: feedback at moderate values produces richer harmonics

### Step 5: Parameter locks integration

- [ ] Ensure `LockRatio`, `LockIndex` from the sequencer apply correctly to the new voice
- [ ] Add lock types for modulator envelope params if needed
- [ ] Test: param lock on index overrides for a single step, then reverts

### Step 6: 4 operators and algorithms (future)

- [ ] Expand to 4 operators (Digitone-style, see `docs/ideas/digitone-inspiration.md`)
- [ ] Define algorithm enum — start with 3-4 useful topologies (parallel pair, full stack, branch, hybrid)
- [ ] Implement rendering for each algorithm
- [ ] Test: different algorithms produce distinct timbres from the same operator params
