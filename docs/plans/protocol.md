# Plan: Binary protocol

## Context

The engine runs as a Web Audio AudioWorkletProcessor. JS is the brain — it builds patterns, configures voices, manages effects. C++ is the clock — it sequences, synthesizes, mixes. The only communication path is MessagePort.

JS is always the source of truth. The engine never modifies patches or patterns — it receives them and executes. The frontend retains its own representation for UI rendering and game state.

## Message transport

Every message is a single binary ArrayBuffer transferred zero-copy via `port.postMessage()`. The first byte is a message type tag. The C++ side reads the tag and dispatches to the appropriate decoder.

```ts
const buffer = builder.toTransferable();
port.postMessage(buffer, [buffer]);
```

The AudioWorklet's `onmessage` passes the buffer straight to C++. Decoding happens between render calls (in the message event handler), builds the full C++ struct, then queues it for the engine to pick up safely — e.g., pending pattern swaps happen at the next sequencer boundary.

## Message header

Every message starts with:

```
u8    messageType
```

| Value | Type | Purpose |
|-------|------|---------|
| 0x01 | PatchBank | Full set of voice patches, replaces the current bank |
| 0x02 | Pattern | Queued pattern, picked up at next boundary |
| 0x03 | BusConfig | Effect bus configuration |
| 0x04 | Transport | Play, stop, restart |
| 0x05 | Tempo | Set global BPM |
| 0x06 | Trigger | Immediate note trigger on a track |

The body immediately follows the header byte. The decoder reads the tag, then dispatches to the type-specific decoder which consumes the rest of the buffer.

### Engine → JS (future)

| Type | Purpose |
|------|---------|
| `position` | Current tick/step/bar for UI visualization |
| `boundary` | Pattern boundary reached — JS should queue next |

Engine → JS messages are a separate design concern. Noting them here for completeness but not specifying the format yet.

## Binary layouts

All multi-byte values are little-endian (matches WASM). Encoded with `@bitmachina/binary` Builder, decoded in C++ by walking a `const uint8_t*` buffer with a byte offset.

### Patch bank

Sends the full bank every time. Simpler than incremental updates — avoids state drift between JS and the engine. Patch count is small (16 max), and the data per patch is ~120 bytes, so the full bank is under 2KB.

```
u8    patchCount

Per patch:
  --- Operator 0 (carrier) ---
  f32   ratio
  f32   detune
  f32   level
  f32   feedback
  f32   attack
  f32   decay
  f32   sustain
  f32   release

  --- Operator 1 (modulator) ---
  f32   ratio
  f32   detune
  f32   level
  f32   feedback
  f32   attack
  f32   decay
  f32   sustain
  f32   release

  --- Voice parameters ---
  f32   index
  f32   filterFreq
  f32   filterRes
  f32   sends[0]
  f32   sends[1]
  f32   sends[2]
  f32   sends[3]

  --- Amplitude envelope ---
  f32   attack
  f32   decay
  f32   sustain
  f32   release

  --- LFO 0 ---
  f32   rate
  u8    waveform          (0=Sine, 1=Triangle, 2=Saw, 3=Square)
  u8    routeCount        (0–4)
  Per route:
    u8    target          (ParamId)
    f32   depth

  --- LFO 1 ---
  f32   rate
  u8    waveform
  u8    routeCount
  Per route:
    u8    target
    f32   depth
```

Patch size: 27 f32s (108 bytes) + 2 LFOs (variable, ~2–22 bytes each) = ~112–152 bytes per patch. Full bank of 16 patches: ~2KB.

### Pattern

Sparse encoding — only steps with data are sent. The C++ decoder expands into the dense `Pattern` struct (tracks with `vector<Step>`).

```
u8    trackCount
u8    patternLength       (in sixteenth-note steps)

Per track:
  u8    stepCount         (this track's step count, for polymetric)
  u8    eventCount        (number of non-empty steps encoded below)

  Per event:
    u8    stepIndex       (which step, 0-based)
    u8    flags           (bitmask: see below)
    i8    microTiming     (-5 to +5 ticks)

    if flags & HAS_PATCH_INDEX:
      u8    patchIndex    (1-indexed, matches sequencer convention)

    if flags & HAS_TRIG:
      u8    trigType      (1=NoteOn, 2=NoteOff, 3=FadeOut)
      if trigType == NoteOn:
        u8    note
        u8    velocity

    if flags & HAS_LOCKS:
      u8    lockCount
      Per lock:
        u8    paramId     (ParamId enum value)
        f32   value
```

**Flags bitmask:**
```
bit 0: HAS_TRIG          (0x01)
bit 1: HAS_LOCKS         (0x02)
bit 2: HAS_PATCH_INDEX   (0x04)
bit 3: ONESHOT           (0x08)
```

A typical 16-track, 16-step pattern with ~30% step density would be roughly 200–500 bytes.

### Bus config

Fixed layout — always encodes all 4 buses. Each bus lists its effect slots with type-specific parameters.

```
Per bus (4 total):
  u8    slotCount         (0–4, 0 = inactive bus)

  Per slot:
    u8    effectType      (0=Delay, 1=Reverb, 2=Overdrive, 3=Chorus)

    if effectType == Delay:
      f32   time          (seconds)
      f32   feedback
      f32   mix

    if effectType == Reverb:
      f32   feedback      (reverb time, 0–1)
      f32   lpFreq        (damping cutoff)

    if effectType == Overdrive:
      f32   drive         (0–1)

    if effectType == Chorus:
      f32   rate          (LFO Hz)
      f32   depth         (0–1)
      f32   feedback      (0–1)
      f32   delay         (0–1)
```

Bus config is tiny — under 100 bytes for a full 4-bus setup.

### Transport

```
u8    messageType         (0x04)
u8    command             (0=Stop, 1=Play, 2=Restart)
```

2 bytes total.

### Tempo

```
u8    messageType         (0x05)
f32   bpm
```

5 bytes total.

### Trigger

Immediate trigger on a track, outside the sequencer. The Synth handles routing to the appropriate voice.

```
u8    messageType         (0x06)
u8    track               (0–15)
u8    flags               (bit 0: HAS_PATCH_INDEX)
u8    trigType             (1=NoteOn, 2=NoteOff, 3=FadeOut)

if flags & HAS_PATCH_INDEX:
  u8    patchIndex

if trigType == NoteOn:
  u8    note
  u8    velocity
```

4–7 bytes depending on flags and trig type. A fire-and-forget message — no sequencer involvement, no timing grid. The Synth executes it on the next process call.

## C++ decoder

A top-level dispatch function reads the message type tag and calls the appropriate decoder. Each decoder takes a `const uint8_t*` buffer (positioned after the tag byte) and byte length:

```cpp
namespace protocol {
    // Top-level dispatch — reads tag, calls the right decoder on Synth
    void Dispatch(Synth& synth, const uint8_t* data, size_t len);

    // Individual decoders (called by Dispatch)
    std::vector<Patch> DecodePatchBank(const uint8_t* data, size_t len);
    Pattern DecodePattern(const uint8_t* data, size_t len);
    BusConfig DecodeBusConfig(const uint8_t* data, size_t len);
}
```

The decoder reads sequentially — no seeking, no random access. It mirrors the encoder's write order exactly. Validation is minimal: bounds-check the buffer length, clamp values to valid ranges. If the buffer is malformed, the decoder stops and returns what it has (or an empty result).

## JS encoder

The `@helm-audio/protocol` package exports typed encoder functions that take structured JS objects and return transferable ArrayBuffers:

```ts
import { encodePatchBank, encodePattern, encodeBusConfig, encodeTransport, encodeTempo } from '@helm-audio/protocol';

// Each encoder returns a transferable ArrayBuffer with the message tag prepended
const buffer = encodePatchBank(patches);
port.postMessage(buffer, [buffer]);
```

The encoder uses `@bitmachina/binary` Builder internally. Each function writes the message type tag as the first byte, then the type-specific body.

## Synth class

The protocol needs a receiver on the C++ side. This is the Synth class described in architecture.md — the integration point that owns voices, buses, sequencer, and modulation state. It's the component that wires decoded messages to the engine:

- `LoadPatchBank(vector<Patch>)` — stores patches by index
- `QueuePattern(Pattern)` — passes to sequencer as pending
- `ConfigureBuses(BusConfig)` — sets up effect bus slots
- `SetTempo(float bpm)` — updates the tick rate
- `Play() / Stop() / Restart()` — transport control
- `Process(float* left, float* right, size_t frames)` — render a block

The Synth implements `SequencerListener` to handle trigs, mapping track indices to voices, looking up patches by index, and applying param locks through the modulation system.

## Implementation order

1. **C++ Synth class** — owns voices, buses, sequencer, modulation. Implements SequencerListener. Block-based `Process()` that renders to stereo output buffers.
2. **C++ decoders** — `protocol::DecodePatchBank`, `DecodePattern`, `DecodeBusConfig`. Tested against known byte sequences.
3. **JS encoders** — `@helm-audio/protocol` package using `@bitmachina/binary`.
4. **AudioWorklet glue** — Emscripten/Embind bridge. MessagePort handler dispatches to decoders, feeds results to Synth.
5. **JS worklet loader** — `@helm-audio/worklet` package. Loads WASM, creates AudioWorkletNode, exposes high-level API.

## Files

| File | Action |
|------|--------|
| `src/synth.h` | **Create** — Synth class declaration |
| `src/synth.cpp` | **Create** — Synth implementation |
| `src/protocol.h` | **Create** — Decoder declarations |
| `src/protocol.cpp` | **Create** — Decoder implementations |
| `tests/test_synth.cpp` | **Create** — Synth unit tests |
| `tests/test_protocol.cpp` | **Create** — Decoder tests with known byte sequences |
| `packages/protocol/` | **Create** — JS encoder package |
| `packages/worklet/` | **Create** — AudioWorklet loader package |
