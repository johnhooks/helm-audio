# Architecture

## Overview

```
JS (brain)                              C++ engine (clock)
├── Builds sequences from game state    ├── Sequencer
├── Encodes as binary ArrayBuffer       ├── Synth (track→voice mapping)
├── Sends via MessagePort               ├── Voice pool
└── Prepares next sequence while        └── Mix bus → audio output
    current one plays
```

The WASM boundary is one data path: sequence in, audio out.

## Components

### Sequencer

Steps through a timestamped event array with sample-accurate timing. Emits events — it does not know what voices are or what they sound like. It just fires events at the right sample offset.

Sequences are long-lived (up to ~1 minute), looping until replaced. Events can be **repeating** (fire every loop) or **oneshot** (fire once, skipped on subsequent loops). When the sequencer reaches the end of a sequence, it picks up any pending sequence queued by JS, or loops the current one.

### Synth

Owns the 8 tracks and the voice pool. Maps tracks to voices. Routes sequencer events to the correct voice. Accepts new sequences and voice configurations from JS, queuing them for the sequencer to pick up at the next boundary.

The synth is the integration point — it wires the sequencer to the voices. It handles:
- Track-to-voice assignment
- Voice lifecycle (fade out, reconfigure, re-trigger)
- Mixing all active voices to the output buffer

### Voice

An FM voice built from DaisySP modules. Implements an interface that the synth talks to — the voice doesn't know about tracks or sequences.

```
Voice
├── FM2 (carrier + modulator) ──┐
├── FM2 (carrier + modulator) ──┼── mix ── Filter ── ADSR ── out
├── FM2 (carrier + modulator) ──┘
│        ↑        ↑
├── LFO → freq modulation
├── LFO → index modulation
└── LFO → filter cutoff modulation
```

Each voice has multiple FM2 operators mixed together, then run through a single filter and amplitude envelope. LFOs modulate FM parameters for timbral movement. The filter is applied once per voice (post-mix).

### Voice lifecycle

Voices transition through states:

```
idle → configured → active → fading → idle
```

Voice swaps are scheduled within the sequence itself. JS places fade-out events early enough that the voice is silent before the configure event fires. The engine trusts the sequence — it doesn't validate the lifecycle, it just executes.

## Sequence protocol

Sequences are binary-encoded ArrayBuffers. The JS encoder (`@helm-audio/protocol`) uses `@bitmachina/binary` for typed, position-tracked encoding. The C++ decoder mirrors the same field layout.

Event types:
- **noteOn** — trigger a track's voice at a pitch/velocity
- **noteOff** — release a track's voice
- **fadeOut** — begin short release on a track's voice (prep for reconfiguration)
- **configureVoice** — load new FM/filter/envelope/LFO params into an idle voice

All event types live in the same timeline. The engine doesn't distinguish between "music events" and "management events" — they're all commands at sample offsets. The event type byte determines the length and fields of each event (variable-length, like MIDI status bytes).

Sequences are transferred zero-copy via MessagePort's transferable mechanism.

## Build targets

The C++ engine compiles to two targets:
- **Native** (clang/gcc) — for development, testing, and WAV file output
- **WASM** (Emscripten) — for the browser AudioWorklet

The native target is the primary development environment. WASM is a deployment target.

## DaisySP

Platform-agnostic C++ DSP library. Pure float processing, no dynamic allocation at runtime, static memory model.

```cpp
module.Init(sample_rate);
float out = module.Process(input);  // per-sample
```

Key modules:
- **Synthesis**: `Oscillator`, `Fm2`, `FormantOsc`, `VariableShapeOsc`, `OscillatorBank`
- **Filters**: `Ladder` (Moog 12/24dB), `Svf`, `OnePole`
- **Control**: `Adsr`, `AdEnv`, `Phasor`
- **Effects**: `Chorus`, `Flanger`, `Phaser`, `Overdrive`, `Decimator`
- **Utility**: `DelayLine`, `DcBlock`
