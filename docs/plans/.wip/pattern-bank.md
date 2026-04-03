# Pattern bank and arrangement

The engine currently holds one pattern and optionally a pending pattern. JS decides when to queue the next one. This works for the game (Helm generates patterns from game state and queues them as needed) but doesn't support tracker-style composition where you author multiple patterns and arrange them into a song.

The Elektron model: the engine owns a bank of patterns and an arrangement (chain) that determines playback order. The user can override the next pattern at any time (queue). The engine handles transitions autonomously at loop boundaries.

## Pattern bank

**64 pattern slots** organized as **4 banks × 16 patterns**.

Banks are a UI concept — the engine sees a flat array of 64 slots. Bank 0 = patterns 0-15, bank 1 = 16-31, etc. The tracker shows one bank at a time with a bank selector.

```cpp
static constexpr int kPatternsPerBank = 16;
static constexpr int kNumBanks = 4;
static constexpr int kMaxPatterns = kPatternsPerBank * kNumBanks;  // 64

// In Synth:
std::unique_ptr<Pattern> patternBank_[kMaxPatterns];
```

Slots can be empty (`nullptr`). The sequencer only plays patterns that exist. Attempting to play an empty slot does nothing (or stops playback, depending on the context).

Pattern indices are `u8` in the protocol (0-255), so the 0-63 range fits with room to grow if we ever need more.

### Loading patterns

The existing `LoadPattern(Pattern&&)` becomes `LoadPatternAt(uint8_t index, Pattern&&)` — stores a pattern at a specific slot in the bank. The protocol decoder calls this instead of replacing the single pattern.

```cpp
void Synth::LoadPatternAt(uint8_t index, Pattern&& pattern) {
    if (index >= kMaxPatterns) return;
    patternBank_[index] = std::make_unique<Pattern>(std::move(pattern));
}
```

JS sends a pattern with its target index. The engine stores it. No playback disruption — patterns can be loaded while another pattern plays.

### Playing a pattern

```cpp
void Synth::PlayPattern(uint8_t index) {
    if (index >= kMaxPatterns || !patternBank_[index]) return;
    // If already playing, queue it for the next boundary
    if (playing_) {
        pendingPatternIndex_ = index;
        sequencer_.SetPendingPattern(patternBank_[index].get());
    } else {
        activePatternIndex_ = index;
        sequencer_.Init(this, patternBank_[index].get());
    }
}
```

The Synth tracks `activePatternIndex_` so the state report can tell JS which pattern is currently playing.

## Chain (arrangement)

A chain is an ordered list of pattern indices. The sequencer walks the chain: when the current pattern reaches its loop boundary, instead of looping, it advances to the next entry in the chain. When the chain ends, it either stops or loops back to the beginning.

```cpp
struct Chain {
    std::vector<uint8_t> entries;  // pattern indices
    bool loop = true;              // loop the chain or stop at end
};
```

The Synth owns the chain and tracks the current position:

```cpp
Chain chain_;
int chainPosition_ = 0;
```

When `CheckLoopBoundary` fires and no manual queue override is pending, the sequencer advances `chainPosition_` and loads the next pattern from the chain:

```
Loop boundary reached:
  1. If pendingPatternIndex_ is set → play that (user override / queue)
  2. Else if chain has a next entry → advance chainPosition_, play chain_[chainPosition_]
  3. Else if chain.loop → reset chainPosition_ to 0, play chain_[0]
  4. Else → stop playback
```

### Single pattern mode

When no chain is set (empty entries list), the engine behaves exactly as it does today — the current pattern loops indefinitely. This is the default for both the game (which queues patterns manually) and simple tracker use.

### Live pattern queuing

The user can queue a pattern at any time during playback, overriding whatever the chain would do next. This is the Elektron "queue next pattern" behavior:

- Press a pattern pad while playing → that pattern is queued
- At the next loop boundary, the queued pattern plays instead of the chain's next entry
- After the queued pattern, playback returns to the chain (or loops the queued pattern if no chain)

The queue is a single slot — queuing a new pattern replaces the previous queue. There's no queue of queues.

## State report changes

The state report (`MessageType.StateReport`) needs to include the active pattern index and chain position so the tracker UI knows what's playing:

```
Wire format: [type: u8] [step: u8] [playing: u8] [patternSwapped: u8]
                                                   [activePattern: u8] [chainPosition: u8]
```

6 bytes instead of 4. The protocol is still tiny.

## Protocol changes

### New message: LoadPatternAt

Extends the existing `Pattern` message. The pattern message already has a track count and length — add the target bank index:

```
[messageType: 0x02] [targetIndex: u8] [trackCount: u8] [length: u8] ...
```

This is a breaking change to the pattern message format. The existing encoder writes `trackCount` first — we'd prepend `targetIndex`. The decoder reads the index and calls `LoadPatternAt(index, pattern)`.

Alternatively, add a new message type (`0x08 = LoadPatternAt`) to avoid breaking the existing format. The original `Pattern` message (0x02) could default to loading at the active pattern index for backward compatibility.

### New message: SetStep (live editing)

Updates a single step in a pattern in the bank. The engine overwrites the step in place — no pattern swap, no interruption. If the sequencer hasn't reached this step in the current loop, the change is heard immediately. If it already passed it, the change is heard next loop.

```
[messageType: 0x0B] [patternIndex: u8] [trackIndex: u8] [stepIndex: u8]
[flags: u8] [microTiming: i8]
if HAS_PATCH_INDEX: [patchIndex: u8]
if HAS_TRIG: [trigType: u8] (if NoteOn: [note: u8] [velocity: u8])
if HAS_LOCKS: [lockCount: u8] per lock: [param: u8] [value: f32]
```

The step payload uses the same encoding as events within a pattern message — same flags, same field order. The only difference is the addressing header (pattern + track + step index).

A flags value of `0x00` with no additional data clears the step (resets to empty).

This is the primary message for live editing. Every keystroke in the tracker's phrase view produces a `SetStep` message. The JS tracker state and the engine's pattern data stay in sync because every edit generates a message.

**Engine side:**

```cpp
void Synth::SetStep(uint8_t patternIndex, uint8_t trackIndex,
                    uint8_t stepIndex, const Step& step) {
    if (patternIndex >= kMaxPatterns || !patternBank_[patternIndex]) return;
    auto& tracks = patternBank_[patternIndex]->tracks;
    if (trackIndex >= tracks.size()) return;
    auto& steps = tracks[trackIndex].steps;
    if (stepIndex >= steps.size()) return;
    steps[stepIndex] = step;
}
```

No locking needed. The sequencer reads steps by reference from the pattern array. `SetStep` writes to the same array. Both happen on the audio thread (the protocol decoder runs inside `receiveMessage` which is called from the worklet's `handleMessage`, which runs on the audio thread). There's no cross-thread mutation.

### New message: ClearStep

Convenience for clearing a step without encoding an empty step payload:

```
[messageType: 0x0C] [patternIndex: u8] [trackIndex: u8] [stepIndex: u8]
```

4 bytes. The engine resets the step to default (no trig, no locks, no patch, zero micro-timing).

### New message: SetChain

```
[messageType: 0x09] [entryCount: u8] [loop: u8]
per entry: [patternIndex: u8]
```

### New message: QueuePattern

```
[messageType: 0x0A] [patternIndex: u8]
```

Or this could be a transport command variant — `TransportCommand::QueuePattern` with a pattern index parameter.

## Tracker UI impact

### Pattern grid

The phrase view header shows the current pattern index and bank:

```
PHRASE 00  (Bank A)                T+120
```

Navigation: Shift+Up/Down switches between patterns within the current bank. A bank selector (maybe Shift+Left/Right on the song page) switches banks.

### Song view

The song view becomes the chain editor — a list of pattern indices in the arrangement:

```
SONG                              T+120
                                  1 ---
ROW PAT BNK                       2 ---
 00  00  A                        3 ---
 01  03  A                        4 ---
 02  00  A                        5 ---
 03  10  B                        6 ---
 04  --                           7 ---
 05  --                           8 ---
```

The chain is what the M8 calls the "song" view — an ordered list of patterns. The user builds the arrangement here.

### Live performance

During playback, the user can queue the next pattern from the phrase view by pressing a key combo (e.g. Edit+pattern number). The transport bar shows the queued pattern:

```
> 120.0 BPM  Pat 00 [Q:03]  Oct 4  EDIT
```

`[Q:03]` means pattern 03 is queued for the next boundary.

## What this means for the game

Helm doesn't use banks, chains, or the song view. It calls `PlayPattern(index)` to queue patterns generated from game state. The pattern bank gives it 64 slots to work with instead of 1 — it can pre-generate several patterns (ambient, tension, combat, transition) and switch between them at loop boundaries.

The chain/arrangement system is purely for the tracker authoring tool. The game ignores it.

## Implementation order

1. **Pattern bank storage** — replace single pattern with `patternBank_[64]`, add `LoadPatternAt`, `PlayPattern`
2. **SetStep / ClearStep** — in-place step mutation for live editing. This is the critical path for the tracker — every keystroke produces a `SetStep` message.
3. **Active pattern tracking** — `activePatternIndex_` in the Synth, reported in state
4. **State report expansion** — add `activePattern` and `chainPosition` fields
5. **Protocol messages** — `LoadPatternAt`, `SetStep`, `ClearStep`, `QueuePattern`, `SetChain`
6. **Chain playback** — chain structure, auto-advance at loop boundary
7. **Tracker UI** — bank selector, song/chain editor view

Steps 1-3 are the minimum for a working tracker with live editing. Step 4-5 wire the protocol. Steps 6-7 add arrangement. The game only needs steps 1, 3, and `LoadPatternAt` + `QueuePattern` from step 5.
