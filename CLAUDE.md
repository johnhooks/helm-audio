# helm-audio

The audio system for [Helm](https://github.com/johnhooks/helm), a browser-based space game. An 8-track FM sound engine built on [DaisySP](https://github.com/electro-smith/DaisySP), compiled to WASM and running as a Web Audio AudioWorkletProcessor.

## What it is

A sequenced FM sound engine. JS builds a binary-encoded sequence (note events, voice configurations, timing) and sends it to the C++ engine via MessagePort. The engine steps through the sequence with sample-accurate timing and renders audio. JS is the brain, C++ is the clock.

The engine has 8 tracks. Each track is assigned a voice. Voices are FM patches built from DaisySP modules (FM2 operators, filters, envelopes, LFOs). Voices can be dynamically swapped through events in the sequence — the engine handles the timing to do this cleanly.

## Tech stack

- **C++17** — engine, sequencer, voice management
- **DaisySP** — DSP building blocks (`Fm2`, `Ladder`, `Svf`, `Adsr`, `Oscillator`, etc.)
- **Emscripten** — WASM build target, Embind + JS AudioWorklet wrapper
- **TypeScript** — control layer, sequence generation, protocol encoding
- **Bun workspaces** — monorepo
- **Vite** — dev server
- **Vitest** — JS/TS tests
- **doctest** — C++ tests
- **CMake** — build system with presets for native and WASM targets

## Packages

- `@helm-audio/worklet` — compiled WASM engine + JS AudioWorklet loader
- `@helm-audio/protocol` — binary sequence format and JS encoder, uses `@bitmachina/binary`

## Architecture

See `docs/architecture.md`.

## Current focus

Building the engine. See `docs/plans/.wip/` for implementation plans.

## Development strategy

Build and test C++ natively first (clang/gcc, WAV file output, doctest). Only compile to WASM once the logic is correct. Keeps Emscripten out of the debugging loop.

## Conventions

- C++17, DaisySP namespace: `daisysp`
- Audio block size: 128 frames (Web Audio render quantum)
- Sample rate: from JS AudioContext (typically 48000)
- Little-endian byte order for binary protocol (matches WASM)
- Markdown: let paragraphs wrap naturally, no hard line breaks
