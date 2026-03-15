# helm-audio

An FM synthesizer and sequencer that runs in a Web Audio [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor). The DSP engine is C++ built on [DaisySP](https://github.com/electro-smith/DaisySP), compiled to WASM via Emscripten. A TypeScript control layer builds binary-encoded sequences and sends them to the engine over MessagePort.

**Status: early development.** The voice and sequencer foundations are in place. Not yet usable as a standalone package.

## How it works

The engine has a configurable number of tracks, each assigned an FM voice. Voices are FM patches — operators, filters, envelopes, LFOs — built from DaisySP modules. A tracker-style sequencer steps through a pattern grid with sample-accurate timing, firing triggers and applying per-step parameter locks. JS is the brain (builds patterns from application state), C++ is the clock (renders audio).

Patterns are binary-encoded ArrayBuffers transferred zero-copy over MessagePort. The sequencer supports polymetric track lengths, micro-timing offsets, oneshot triggers, and dynamic voice swapping within a pattern.

The design draws from trackers (ProTracker, FastTracker 2), Elektron sequencers (parameter locks, trig conditions, per-track lengths), and the Sega Genesis sound drivers (fixed channel assignment, sticky state, compact binary protocol). It does not attempt to emulate any of them. It just stole the good ideas.

## Why this exists

This is the audio system for [Helm](https://github.com/johnhooks/helm), a slow, asynchronous space exploration game where WordPress is the server. In Helm, ship sensors model signal detection using DSP concepts — spectral bands, noise floors, matched filters, integration gain. The detection math describes what the sensor "hears." helm-audio makes that literal: game state drives the composition, and the player hears what their sensor hears.

A mining laser is a continuous mid-band tone. A drive spool is a chirp sweeping through the high frequencies. A star is ambient noise shaped by spectral class. The sensor's filter configuration shapes the mix. The bridge officer fantasy is real: you're staring at a spectrum display, watching contacts resolve from noise into identity, and *hearing* it happen.

The engine itself doesn't know about any of this. It doesn't know about spaceships or WordPress or subspace transients. It's an FM synth with a sequencer. It plays what you tell it to play. Helm is the intended consumer, but the engine has no game-specific dependencies. If you want to use it to make music that has nothing to do with space, it won't judge you.

## Tech stack

- **C++17** — engine, sequencer, voice management
- **[DaisySP](https://github.com/electro-smith/DaisySP)** — DSP building blocks (Fm2, Svf, Adsr, Oscillator, etc.)
- **Emscripten** — WASM build target
- **TypeScript** — control layer, sequence generation, binary protocol encoding
- **CMake** — build system with presets for native and WASM targets

## Development

The C++ engine is built and tested natively first (clang/gcc, WAV file output, [doctest](https://github.com/doctest/doctest)). WASM compilation is a deployment target, not a development environment. We debug with printf and WAV files like civilized people.

## License

GPL-2.0-or-later. See [LICENSE.txt](LICENSE.txt).
