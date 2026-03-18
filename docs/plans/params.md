# Parameter system

The parameter system is the shared vocabulary that connects the sequencer, voice, and modulation layer. Every tweakable value on a voice — filter cutoff, FM index, envelope times — is identified by a `ParamId`. This single enum is used by param locks (sequencer overrides per step), `Voice::SetParam` (per-sample updates), and `VoiceModState` (LFO modulation runtime).

## ParamId

`ParamId` (`src/param.h`) enumerates every parameter the system knows about. Parameters are split into two tiers based on whether they're routable as LFO targets:

**LFO-routable and lockable:**
- `FilterFreq` — lowpass filter cutoff frequency
- `Index` — FM modulation depth (brightness)
- `Pitch` — additive Hz offset applied to both operators
- `Send0`–`Send3` — effect bus send levels (0–1)

**Lock-only (not LFO-routable yet):**
- `Ratio` — modulator frequency ratio
- `FilterRes` — filter resonance
- `Attack`, `Decay`, `Sustain`, `Release` — amplitude envelope

The distinction is practical, not architectural. Lock-only params are ones where per-sample modulation either doesn't make sense (ratio changes mid-sample would click) or isn't needed yet. Moving a param from lock-only to LFO-routable requires no structural changes — just add routings.

## Param locks

Param locks are per-step overrides set in the sequencer pattern. They change a parameter's value for the duration of a step, like the Elektron parameter lock system.

**Data flow:**
1. The sequencer hits a step that has locks (`Step::locks`, a vector of `ParamLock{ParamId, float}`)
2. For each lock, it calls `listener->onParamLock(track, lock)`
3. The synth (the listener) receives the lock and calls `VoiceModState::SetBase(param, value)` on the track's mod state — this shifts the base value that modulation operates around
4. On the next `Tick()`, the resolved value reflects the new base

Locks are sticky — they persist until the next lock on the same param or a patch load resets all bases. A step with no lock for a given param leaves the previous value in place.

`ParamLock` is a simple struct (`{ParamId param; float value}`), replacing an earlier system that used a `std::variant` of typed structs (`LockRatio`, `LockIndex`, etc.). The variant approach didn't scale — adding a param meant adding a struct, updating the variant typedef, and adding a visitor case. The current design just adds an enum value.

## Voice::SetParam

`Voice::SetParam(ParamId, float)` (`src/voice.cpp`) applies a resolved parameter value to the voice's DSP state. It's a switch on ParamId that calls the appropriate DaisySP setter:

- `FilterFreq` → `filter_.SetFreq(value)`
- `FilterRes` → `filter_.SetRes(value)`
- `Index` → `index_ = value`
- `Pitch` → recomputes both operator frequencies with an additive Hz offset
- `Ratio` → updates modulator ratio and recomputes its frequency
- `Attack`/`Decay`/`Sustain`/`Release` → amplitude envelope setters
- `Send0`–`Send3` → no-op on the voice (sends are read by the synth mixer)

This is the per-sample hot path for modulated params. `Configure()` remains for full patch loads — it sets everything at once from a `Patch` struct. `SetParam` is for targeted updates between `Configure` calls.

The voice never sees LFOs, routings, or modulation depth. It receives a float and applies it. This keeps the voice simple and means the modulation system can change without touching voice code.

## LFO modulation

Each patch owns two LFOs that can modulate parameters on their voice. The LFOs are part of the sound design — when you load a patch, its LFOs and routings come with it.

### Patch data

`Patch` (`src/voice.h`) carries the static LFO configuration:

- `LfoConfig lfos[2]` — rate (Hz) and waveform (sine, triangle, saw, square) per LFO
- `LfoRouting lfoRoutings[2]` — up to 4 target/depth pairs per LFO

The routing table says which params each LFO modulates and by how much. Depth is bipolar — the LFO swings the parameter above and below its base value. Unused slots have depth 0 and are skipped.

### VoiceModState

`VoiceModState` (`src/modulation.h`, `src/modulation.cpp`) is the per-track modulation runtime. One instance per track, owned by the synth. It holds:

- Two `daisysp::Oscillator` instances — the LFOs, free-running, never phase-reset
- `base[kParamCount]` — current base values, set by `LoadPatch` or `SetBase` (from param locks)
- `resolved[kParamCount]` — computed each sample by `Tick()`

**`LoadPatch(patch)`** copies base values from the patch (filter freq, index, sends, envelope times, etc.) and updates LFO rate/waveform/routings. It does not reset LFO phase — this is critical. A patch change mid-phrase should not cause a discontinuity in an ongoing filter sweep.

**`SetBase(ParamId, float)`** overrides a single base value. This is how param locks feed in — the sequencer fires a lock, the synth calls `SetBase`, and the next `Tick()` resolves around the new center.

**`Tick()`** runs once per sample:
1. Copy base values to resolved
2. Process each LFO oscillator (always — the tick cost is trivial)
3. For each routing with nonzero depth: `resolved[target] += lfoValue * depth`
4. Clamp all resolved values at parameter boundaries

Clamping rules:
- `FilterFreq` ≥ 20 Hz
- `FilterRes`, sends, `Sustain` — clamped to 0–1
- `Index` ≥ 0
- `Attack`, `Decay`, `Release` ≥ 0.001s
- `Pitch`, `Ratio` — unclamped

### Integration pattern

The synth's per-sample loop (not yet built — currently demonstrated in `render_wav.cpp`):

```
for each sample:
    for each track:
        mods[track].Tick()
        voice.SetParam(FilterFreq, mods[track].GetResolved(FilterFreq))
        voice.SetParam(Index, mods[track].GetResolved(Index))
        // ... other modulated params
    for each track:
        output += voice.Process()
```

When the synth receives a param lock from the sequencer:
```
onParamLock(track, lock):
    mods[track].SetBase(lock.param, lock.value)
```

When the synth loads a patch:
```
onLoadPatch(track, patchIndex):
    voice.Configure(patches[patchIndex])
    mods[track].LoadPatch(patches[patchIndex])
```

## Design decisions

**Why param locks and LFOs are separate systems.** Locks set the base, LFOs swing around it. A step can lock the filter to 500 Hz while an LFO sweeps ±200 Hz around that locked value. The two compose without knowing about each other — `SetBase` moves the center, `Tick` adds the oscillation.

**Why LFOs free-run.** LFOs are not gated by note on/off. Phase persists across patch loads, note triggers, and voice idle/reactivation. This avoids discontinuities and means LFO effects feel continuous across a phrase. The cost is one oscillator tick per sample per LFO regardless of voice state — negligible.

**Why the voice doesn't know about modulation.** The voice receives resolved floats via `SetParam`. It doesn't know whether a value came from a patch default, a param lock, an LFO, or manual control. This means the modulation system can be extended (more LFO shapes, envelopes as mod sources, external CV) without touching voice code.

**Why depth is on the routing, not the LFO.** One LFO can modulate multiple params at different depths — e.g. LFO 0 sweeps filter at depth 500 and index at depth 0.3 simultaneously. The LFO just produces a normalized signal; the routing scales it per target.
