# Effects

A small pool of shared effect processors (delay, reverb) that voices route into via send buses. Instead of per-voice effects (expensive, 16× memory) or a single global bus (inflexible), we use a fixed pool of configurable effect instances that multiple voices can share.

## Goals

- Multiple voices can route to the same effect bus
- Each bus has its own independent configuration (delay time, reverb size, etc.)
- Voices declare send levels per bus — how much signal they feed into each effect
- Unconfigured/unused buses cost nothing in the audio loop
- Bus assignments and send levels are param-lockable from the sequencer

## Influences

- **Elektron Syntakt** — each track has its own delay and reverb settings, but the hardware pools the actual DSP. We make the pooling explicit: a small number of bus instances with per-bus configuration.
- **Elektron Digitone** — shared chorus/delay/reverb buses. All tracks send into the same effects. Our model is a superset: if you only use one bus, it collapses to the Digitone model.
- **Hardware mixing consoles** — aux send/return is the standard pattern. Each channel (voice) has a send knob per aux bus. The bus runs its effect and returns to the master mix.

## Architecture

```
Voice 0 ──dry──────────────────────────────────────────┐
    ├─send[0]→ Bus 0 [overdrive → delay] ──────────────┤
    └─send[1]→ Bus 1 [chorus → reverb] ────────────────┤
                                                       ├── master mix → output
Voice 1 ──dry──────────────────────────────────────────┤
    ├─send[0]→ Bus 0 [overdrive → delay] ──────────────┤
    └─send[2]→ Bus 2 [reverb] ─────────────────────────┤
                                                       │
Voice 2 ──dry──────────────────────────────────────────┤
    └─send[3]→ Bus 3 [delay → reverb] ─────────────────┘
```

Each voice produces a dry sample. The synth distributes that sample to the voice's assigned buses, scaled by send level. Each bus accumulates input from all voices that route to it, processes through its effect chain, and returns to the master mix.

### Bus pool

A fixed number of effect bus slots, allocated at init. Tentatively 4 buses. The count is a compile-time constant so there's no dynamic allocation.

```cpp
static constexpr int kMaxEffectBuses = 4;
static constexpr int kMaxEffectsPerBus = 4;
```

Each bus is a chain of up to `kMaxEffectsPerBus` effect slots, processed in series. A bus with a single reverb is a valid chain. A bus with overdrive → delay → reverb is also valid. The chain order matters — distortion before delay sounds different from delay before distortion.

Each bus has:
- A chain of effect slots, each with its own type and configuration
- The number of active slots in the chain
- An input accumulator (summed each block, cleared after processing)
- An output buffer (the wet signal returned to the master mix)
- An active flag (true if the chain has at least one configured effect)

### Voice sends

Each voice stores a small array of send levels — one per bus:

```cpp
// in Patch
float sends[kMaxEffectBuses] = {};  // 0.0 = no send, 1.0 = full send
```

Send levels are param-lockable. A hi-hat can have zero reverb send on most steps but a splash of reverb on the accent — just a param lock on the send level.

### Processing order

Each audio block (128 samples):

1. Clear all bus input accumulators
2. For each active voice:
   a. `voice.Process()` → dry sample
   b. Accumulate `dry * send[i]` into each active bus
   c. Accumulate `dry` into the master mix
3. For each active bus:
   a. Feed the accumulated input through the effect chain in order (slot 0 → slot 1 → ... → slot N)
   b. Add the chain's final output to the master mix
4. Output the master mix

This means effects process once per block, not once per voice. A reverb shared by 8 voices costs the same as a reverb used by 1. And because the chain is serial, each effect processes the output of the previous one — overdrive feeds its distorted signal into the delay, which feeds its repeats into the reverb.

### Active flag and zero-cost bypass

Buses default to inactive. When a bus is configured with at least one effect slot and at least one voice sends to it, it becomes active. The processing loop skips inactive buses entirely:

```cpp
for (int i = 0; i < kMaxEffectBuses; i++) {
    if (!buses_[i].active) continue;
    // process...
}
```

A voice with all sends at 0.0 contributes nothing to any bus — no multiply, no accumulate. The send loop can skip sends that are zero:

```cpp
for (int i = 0; i < kMaxEffectBuses; i++) {
    if (sends[i] > 0.0f) {
        buses_[i].Accumulate(dry * sends[i]);
    }
}
```

### Bus configuration

Buses are configured via the same pattern protocol as voice patches. A `loadBusConfig` trig type (or extending `loadPatch`) sets up a bus's effect chain.

Each slot in the chain has its own type and parameters:

```cpp
struct EffectSlotConfig {
    EffectType type = EffectType::None;  // None, Delay, Reverb, Overdrive, Chorus, ...

    // Delay params
    float delayTime = 0.3f;     // seconds
    float delayFeedback = 0.4f;
    float delayMix = 1.0f;      // wet/dry within this slot

    // Reverb params
    float reverbSize = 0.5f;
    float reverbDamping = 0.5f;
    float reverbMix = 1.0f;

    // Overdrive params
    float drive = 0.0f;

    // ... other effect types as we add them
};

struct BusConfig {
    EffectSlotConfig slots[kMaxEffectsPerBus];
    int slotCount = 0;  // number of active slots in the chain
};
```

A bus config with `slotCount = 0` is inactive. A config with `slotCount = 2` where slot 0 is overdrive and slot 1 is delay gives you a dirty delay — the signal gets distorted, then the distorted signal feeds into the delay line.

Bus configs can change mid-pattern (via trigs), but this should be rare — mostly you set up buses at pattern load and leave them.

## LFOs

LFOs are separate from the effect bus system. They live per-voice because they modulate voice-local parameters (operator levels, filter cutoff, FM index, send levels).

LFOs always free-run — they tick every sample regardless of whether they're routed to anything. This avoids phase discontinuities if a routing is added mid-note and keeps the cost predictable (one `Process()` per LFO per sample, no branching).

The routing determines what the LFO *does*, not whether it runs:

```cpp
struct LfoRouting {
    LfoTarget target = LfoTarget::None;  // FilterFreq, Index, OpLevel, Send, ...
    float depth = 0.0f;                  // modulation amount
    int targetIndex = 0;                 // which operator, which send, etc.
};
```

If `target == None` or `depth == 0`, the LFO value is computed but never applied — zero cost beyond the oscillator tick.

LFO count per voice is TBD. The Digitone has 2 per track. Starting with 2 seems right.

## DaisySP modules

Likely candidates from DaisySP:
- **Delay**: `DelayLine` — simple delay line, we wrap it with feedback and filtering
- **Reverb**: `ReverbSc` — Schroeder/Chamberlin reverb, stereo, good quality for the cost
- **LFO**: `Oscillator` — same module we use for FM operators, just at sub-audio rates

## Ownership

- **Effect buses** live on the Synth, not on voices. The synth owns the pool, manages accumulation, and mixes the returns into the master output.
- **Send levels** live on the voice's Patch. They travel with the voice configuration and are lockable per step.
- **LFOs** live on the Voice. They modulate voice-internal parameters and follow the voice lifecycle.

## Open questions

- Should bus output be mono or stereo? Reverb naturally wants stereo. Delay could go either way. The current voice output is mono — stereo would mean doubling the output path.
- Should sends be pre- or post-filter? Post-filter (current assumption) means the effect gets the shaped sound. Pre-filter would let the effect process the raw FM output. Could be configurable per send, but that might be over-engineering it.
- Max delay time determines the `DelayLine` buffer size. Need to pick a ceiling — 1 second? 2 seconds? This directly affects memory.
