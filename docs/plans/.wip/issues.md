# Known issues

Open items discovered during implementation. None are blockers.

## Protocol doc: patchIndex is 0-indexed, not 1-indexed

The protocol spec (`docs/plans/protocol.md`) says patchIndex in the pattern encoding is "1-indexed, matches sequencer convention." This is wrong. The C++ `Patch` bank is a `std::vector` indexed from 0, `onLoadPatch` uses the index directly, and the JS encoder writes it as-is. Everything is 0-indexed. The doc comment needs to be corrected.

**Location:** `docs/plans/protocol.md`, pattern binary layout, `HAS_PATCH_INDEX` section.

## Per-sample SetParam calls for idle voices

`Synth::Process` calls `mods_[t].Tick()` and `voices_[t].SetParam()` for every track every sample, even when the voice is idle. For 8 tracks this is negligible. At 16 tracks with complex LFO routing it may start to matter. Could skip modulation for idle voices — but adds a branch and couples the Synth to voice state. Not worth optimizing until profiling shows it's a problem.

## Resolved

The following issues have been resolved:

- **Effect lifetime ownership** — Resolved. `Synth::ConfigureBusFromDecoder()` creates `std::unique_ptr<Effect>` instances owned by the Synth in a fixed-size array (`ownedEffects_[bus][slot]`). The existing raw-pointer `ConfigureBus()` API is preserved for tests.
- **Synth has no Restart** — Resolved. `Synth::Restart()` calls `Sequencer::Reset()` (resets tick and track cursors to 0) then sets `playing_ = true`.
- **LoadPatchBank copies on the audio thread** — Resolved. Added `LoadPatchBank(std::vector<Patch>&&)` move overload. The protocol decoder uses this path.
