# Architecture

## Overview

```
JS (brain)                              C++ engine (clock)
├── Builds patterns from game state     ├── Sequencer
├── Encodes as binary ArrayBuffer       ├── Synth (track→voice mapping)
├── Sends via MessagePort               ├── Voice pool
└── Prepares next pattern while         └── Mix bus → audio output
    current one plays
```

The WASM boundary is one data path: pattern in, audio out.

## Components

### Sequencer

Steps through a pattern grid — tracks × steps — one step per sixteenth note. A 16-step pattern is one bar of 4/4. Each track can have its own step count (polymetric). The internal clock runs at 24 PPQ (6 ticks per sixteenth note), and each step can carry a micro-timing offset to nudge it earlier or later from the grid — enabling swing, humanization, and precise placement of one-shot trigs. Trigs fire block-aligned (at the start of whichever 128-sample block contains the tick).

Each step on a track can carry a trig, a parameter lock, both, or nothing. Empty steps inherit the track's current state (sticky). Trigs are typed actions: note on, note off, fade out, load patch. Parameter locks are partial patch overrides that apply for that step only.

Patterns are long-lived (up to ~1 minute), looping until replaced. Trigs can be **repeating** (fire every loop) or **oneshot** (fire once, skipped on subsequent loops). When all tracks have completed their steps, the sequencer picks up any pending pattern queued by JS, or loops the current one.

### Synth

Owns the 16 tracks and the voice pool. Maps tracks to voices. Routes sequencer trigs to the correct voice. Accepts new patterns and patches from JS, queuing them for the sequencer to pick up at the next boundary.

The synth is the integration point — it wires the sequencer to the voices. It handles:
- Track-to-voice assignment
- Voice lifecycle (fade out, reconfigure, re-trigger)
- Mixing all active voices to the output buffer

### Voice

An FM voice built from DaisySP modules. Implements an interface that the synth talks to — the voice doesn't know about tracks or patterns.

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

Voice swaps are scheduled within the pattern itself. JS places fade-out trigs early enough that the voice is silent before the configure trig fires. The engine trusts the pattern — it doesn't validate the lifecycle, it just executes.

## Pattern protocol

Patterns are binary-encoded ArrayBuffers. The JS encoder (`@helm-audio/protocol`) uses `@bitmachina/binary` for typed, position-tracked encoding. The C++ decoder mirrors the same field layout.

Trig types:
- **noteOn** — trigger a track's voice at a pitch/velocity
- **noteOff** — release a track's voice
- **fadeOut** — begin short release on a track's voice (prep for reconfiguration)
- **loadPatch** — load new FM/filter/envelope/LFO params into an idle voice

Parameter locks travel alongside trigs — a step can carry a trig, a lock, both, or neither. Locks are partial: a bitmask indicates which patch fields are overridden, and only those values are sent.

All trig types live in the same pattern grid. The engine doesn't distinguish between "music trigs" and "management trigs" — they're all commands on steps. The trig type byte determines the length and fields of each entry (variable-length, like MIDI status bytes).

Patterns are transferred zero-copy via MessagePort's transferable mechanism.

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
