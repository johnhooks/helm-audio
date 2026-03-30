# 4-Operator FM Voice

A new 4-operator FM voice with the 8 OPM algorithms and 2 operator envelope groups for timbre shaping.

## Why

2 operators produce useful sounds but the timbral range is limited — one modulator into one carrier gives you one axis of harmonic control. 4 operators with routing algorithms opens up branching, parallel stacks, cross-modulation, and additive blending. The OPM/OPN chip family proves that 4 ops + 8 algorithms covers the practical range without the complexity of the DX7's 6-op/32-algorithm system.

## Operators

4 operators labeled A, B, C, D. Each has:

```
ratio       frequency multiplier (1.0 = fundamental)
detune      fine tune in Hz
level       output amplitude scalar
```

Each operator is a sine oscillator running at `noteFreq * ratio + detune`. Self-feedback uses a 2-sample history buffer averaged for stability (the Yamaha convention). Only operator A has feedback — see the feedback convention under Algorithms.

## Envelope groups

The operator envelopes control **modulation depth over time** — how much the modulators affect the signal chain as a note evolves. Carriers don't need their own envelope because the amplitude envelope handles the voice output.

- **Envelope A**: shapes operator A (one modulator's contribution over time)
- **Envelope B**: shapes operators B and C together (a paired modulator group)
- **Amplitude envelope**: gates the final voice output (volume shape)

Operator D is the primary carrier in most algorithms — it doesn't have an operator envelope because its output is shaped by the amplitude envelope directly.

This gives 3 ADSRs total. The Digitone uses ADE (Attack Decay End) envelopes for operators where the End level sets a nonzero sustain brightness, but we use standard ADSR for now since that's what we already have.

### How they shape sound

- **Bell**: fast A and B decay (harmonics die quickly), long amplitude release (tone rings out as a pure sine)
- **Pad**: slow A attack (one modulation layer fades in), sustained B (other layer holds), sustained amplitude
- **Pluck**: fast A and B decay, short amplitude decay — bright transient that disappears
- **Evolving texture**: different A and B decay rates — one modulation layer dies while the other sustains, timbre shifts over the note

## Algorithms

The 8 algorithms from the Yamaha YM2151 (OPM) chip family — the canonical 4-operator FM algorithm set. `→` means "modulates," **bold** operators are carriers (output audio).

### Why OPM

The YM2151, designated OPM (FM Operator Type-M), was Yamaha's first standalone FM synthesis chip for OEM use, released around 1983-84. It powered the sound hardware in mid-1980s arcade machines: Sega System 16, Capcom CPS-1, Konami boards, and the Sharp X68000 computer. OutRun, Street Fighter II, After Burner, Ghosts 'n Goblins — all OPM.

The same 8 algorithms carry through the entire OPN family: the YM2203 (OPN), YM2608 (OPNA, the NEC PC-88/98 chip), and the YM2612 (OPN2, the Sega Genesis chip). Every 4-operator FM chip Yamaha built uses these 8 topologies. They've been independently validated by every subsequent 4-op FM implementation — the Digitone's 8 cover the same topology categories, the M8's 12 are these 8 plus 4 minor permutations, and the Reface DX's 12 follow the same pattern.

8 algorithms is the right number. They span the full topology space from maximum serial depth to pure additive without redundant permutations. The M8's extras (e.g., `[A>B]+C+D` is just algo 4 with one modulator level at zero) can be approximated by parameter choices on the base 8. The DX7's 32 are mostly redundant for 6 operators; at 4 operators the useful space is exactly 8.

### Feedback convention

Feedback is a per-voice parameter applied to operator A. In the OPM/OPN chips, each algorithm designates one operator for optional self-feedback. We simplify this: A is always the feedback candidate. A is a modulator in algorithms 0-6, so feedback on A enriches the modulation source — transforming it from sine through sawtooth to noise, giving waveform variety at the top of the chain. In algorithm 7 (additive), feedback on A adds harmonics to one of the four carrier sines.

```
Algo 0: A → B → C → D                serial (deepest FM)
Algo 1: [A + B] → C → D              parallel mods into serial
Algo 2: [B → C] + A → D              serial + parallel into carrier
Algo 3: [A → B] + C → D              serial pair + parallel into carrier
Algo 4: [A → B] + [C → D]            two pairs (the workhorse)
Algo 5: A → [B + C + D]              one mod, three carriers
Algo 6: [A → B] + C + D              one pair + two sines
Algo 7: A + B + C + D                additive (no FM)
```

### What each algorithm is good for

| Algo | Topology | Character |
|------|----------|-----------|
| 0 | Full serial | Deepest FM. Complex metallic tones, aggressive basses, noise-like textures at high index |
| 1 | Parallel mods → serial | Two modulation sources converge then chain. Richer than single serial, good for complex pads |
| 2 | Serial + parallel → carrier | Asymmetric: one 2-deep modulation path + one direct mod into the carrier. Metallic with control |
| 3 | Serial pair + parallel → carrier | A→B chain plus independent C, both modulating D. Two modulation characters blended |
| 4 | Two pairs | Two independent timbres mixed. The workhorse — e-piano, layered bass, brass, most musical patches |
| 5 | One mod, three carriers | Additive character with shared FM brightness. Organs, chords, tonal with unified modulation |
| 6 | One pair + two sines | Mostly additive with one FM element for brightness. Clean tones with a sparkle |
| 7 | Additive | Four sines at different ratios, no modulation. Pure additive synthesis. Organs, sub-bass, simple tones |

### Envelope application in algorithms

Which envelope applies to which operator depends on the operator's role in each algorithm:

- Operators acting as **modulators** are scaled by their envelope group (A or B). This controls how the FM depth evolves over time.
- Operators acting as **carriers** (output audio) are NOT scaled by an operator envelope — they pass through to the amplitude envelope.

The rule is simple: A gets envA when it's a modulator. B and C get envB when they're modulators. D is always a carrier.

**Algo 0** — A → B → C → D (serial):
```
A: osc × envA × level                  modulator
B: osc(+A) × envB × level              modulator
C: osc(+B) × envB × level              modulator
D: osc(+C) × level                     carrier
```

**Algo 1** — [A + B] → C → D (parallel mods into serial):
```
A: osc × envA × level                  modulator
B: osc × envB × level                  modulator
C: osc(+A+B) × envB × level            modulator
D: osc(+C) × level                     carrier
```

**Algo 2** — [B → C] + A → D (serial + parallel into carrier):
```
A: osc × envA × level                  modulator
B: osc × envB × level                  modulator
C: osc(+B) × envB × level              modulator
D: osc(+A+C) × level                   carrier
```

**Algo 3** — [A → B] + C → D (serial pair + parallel into carrier):
```
A: osc × envA × level                  modulator
B: osc(+A) × envB × level              modulator
C: osc × envB × level                  modulator
D: osc(+B+C) × level                   carrier
```

**Algo 4** — [A → B] + [C → D] (two pairs):
```
A: osc × envA × level                  modulator
B: osc(+A) × level                     carrier
C: osc × envB × level                  modulator
D: osc(+C) × level                     carrier
out = B + D
```

**Algo 5** — A → [B + C + D] (one mod, three carriers):
```
A: osc × envA × level                  modulator
B: osc(+A) × level                     carrier
C: osc(+A) × level                     carrier
D: osc(+A) × level                     carrier
out = B + C + D
```

**Algo 6** — [A → B] + C + D (one pair + two sines):
```
A: osc × envA × level                  modulator
B: osc(+A) × level                     carrier
C: osc × level                         carrier
D: osc × level                         carrier
out = B + C + D
```

**Algo 7** — A + B + C + D (additive):
```
A: osc × level                         carrier
B: osc × level                         carrier
C: osc × level                         carrier
D: osc × level                         carrier
out = A + B + C + D
```

Note: envB has no effect in algorithms 5, 6, and 7 (B and C are carriers in all three). envA has no effect in algorithm 7 (A is a carrier).

### Rendering

Each algorithm is a hardcoded render function. No opcode system — with only 8 algorithms and 4 operators, explicit code is clearer than an encoding scheme.

## Signal chain

```
4 operators (routed by algorithm)
    ↓
  filter (SVF: LP/HP/BP/notch)
    ↓
  × amplitude envelope
    ↓
  output (mono)
```

## Patch structure

```
operators[4]        4 × { ratio, detune, level }
algorithm           0-7
index               overall FM depth scalar
feedback            operator A self-feedback amount (0 = off)

envA                ADSR for operator A
envB                ADSR for operators B + C

filterFreq          SVF cutoff
filterRes           SVF resonance

ampEnv              ADSR for voice amplitude
sends[4]            effect bus send levels

lfos[2]             LFO configs
lfoRoutings[2]      modulation routing tables
```

The `index` field scales all modulation connections in the algorithm. At index 0, no FM occurs regardless of algorithm — all operators produce pure sines. The Digitone doesn't have a global index (it uses per-operator level as FM depth), but a global index is useful for param locking and LFO modulation of overall brightness.

## Parameter locks

All existing param lock targets carry over. New targets:

- `Algorithm` — switch routing topology per step

The envelope group params (envA/envB attack, decay, sustain, release) are lockable through the existing ADSR param IDs. The modulation system already handles arbitrary ParamId values.

## What this does NOT include

- X/Y dual output bus system (Digitone feature)
- Per-operator envelopes (simplified to 2 groups)
- Operator waveforms beyond sine (future)
- ADE envelopes with End level (using ADSR for now)
- Envelope delay per operator group (future)
- Phase reset options (future)
- Key tracking on modulation depth (future)
- Velocity sensitivity (separate enhancement)
- Noise source (separate enhancement)
- Pitch envelope (separate enhancement)
- HARM continuous harmonic morphing (future)
- Digitone UI macro mode for B grouping (UI layer)
