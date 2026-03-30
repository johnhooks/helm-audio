# FM Synthesis

An overview of frequency modulation synthesis — how it works, why it matters, and how it connects to what we're building.

## The idea in one paragraph

Use one oscillator to modulate the phase of another, both running at audio rates. The modulator creates sidebands around the carrier frequency — new spectral components that didn't exist in either oscillator alone. The ratio between carrier and modulator frequencies determines whether the spectrum is harmonic (pitched) or inharmonic (metallic, bell-like). The modulation depth (index) controls how many sidebands appear. Sweep the index with an envelope and you get natural timbral evolution — bright attacks that mellow over time — from just two sine waves and a handful of parameters.

## Why FM

FM synthesis produces enormous timbral variety from minimal resources. Two oscillators with three parameters (carrier frequency, modulator frequency, modulation index) generate spectra that would require dozens of additive oscillators to replicate. Four operators with 8 routing algorithms cover everything from electric pianos to metallic percussion to evolving pads to pure additive organ tones.

This matters for a game audio engine. FM is computationally cheap per voice (sine table lookups and additions), parameterically expressive (a few values produce complex sounds), and responds naturally to real-time modulation (LFOs and envelopes on the index create organic timbral movement). The same voice architecture can produce music, sound effects, and ambient textures.

The tradeoff is that FM parameter relationships are non-linear. Subtractive synthesis has intuitive signal flow (oscillator through filter through amplifier). FM's relationship between parameters and spectrum is governed by Bessel functions — mathematically elegant but not always intuitive. Good presets and algorithm design matter more than in subtractive synthesis.

## How it works

**Carriers and modulators.** A carrier is an operator whose output you hear. A modulator is an operator whose output feeds into another operator's phase input, creating sidebands. An algorithm defines how a set of operators connect — who modulates whom, who outputs audio.

**C:M ratio.** The carrier-to-modulator frequency ratio determines the harmonic structure. Integer ratios (1:1, 1:2, 2:1) produce pitched tones with harmonic series. Non-integer ratios (1:1.414, 1:sqrt(2)) produce inharmonic, metallic spectra — bells, gongs, metallic percussion.

**Modulation index.** Controls brightness / spectral complexity. At index 0, output is a pure sine. As the index increases, more sidebands appear. The number of significant sidebands is approximately index + 1. Sweeping the index with an envelope is the core of FM's expressiveness — it produces the bright-attack-to-warm-sustain contour that characterizes natural sounds.

**Feedback.** An operator can modulate itself. This transforms a sine oscillator into a waveform that ranges continuously from sine (no feedback) through sawtooth (moderate feedback) to noise (high feedback), controlled by one parameter.

**Algorithms.** A routing topology for operators. Serial chains (modulator into modulator into carrier) produce deep, complex spectra. Parallel carriers (multiple operators outputting audio) produce additive, organ-like tones. Stacked pairs (two independent modulator-carrier pairs) are the most versatile general-purpose topology. Eight well-chosen algorithms cover the practical range.


## The historical thread

John Chowning discovered FM synthesis at Stanford in 1967 by sweeping a modulator oscillator from the sub-audio range into the audio range. Instead of vibrato, he got timbral transformation. His 1973 JAES paper formalized the math. Yamaha licensed the patent and turned it into the DX7 (1983) — 6 operators, 32 algorithms, 16-voice polyphony, $2,000. Over 200,000 units sold. The sound of the 1980s.

Yamaha also built FM into OEM chips. The YM2151 (OPM) went into arcade machines. The YM2612 (OPN2) went into the Sega Genesis — 4 operators, 8 algorithms, the sound of a generation of games. The YM3812 (OPL2) went into the Sound Blaster — 2 operators, the sound of PC gaming. All of these chips use phase modulation, not true frequency modulation, though the name "FM" stuck.

FM faded in the 1990s as sample-based synthesis took over. It came back through software (Dexed, FM8) and hardware (Elektron Digitone, Korg opsix). The Digitone (2018) proved that 4 operators with 8 algorithms and good UI controls could be more musical than the DX7's 32 cryptic algorithms.


## What we take from this

### Architecture decisions confirmed

**4 operators, 8 algorithms.** The YM2151, YM2612, and Digitone all use 4 operators with 8 algorithms. This covers the practical timbral range without the complexity of the DX7's 6-op/32-algorithm system. Our [4-op voice plan](../plans/fm-4op-voice.md) follows this convention.

**Phase modulation.** Every practical FM implementation since the DX7 uses PM, not true FM. PM is pitch-stable, feedback-stable, and simpler to implement digitally. DaisySP's Fm2 already uses PM. We follow the same convention.

**Envelope-modulated index is the core technique.** The modulator envelope is a brightness envelope. Fast decay = pluck/bell. Slow attack = swelling pad. Different decay rates per operator group = evolving texture. This is why our 4-op voice has dedicated envelope groups for operator A and operators B+C — independent brightness contours on different parts of the algorithm.

**Feedback on one operator per algorithm.** Standard Yamaha convention. Gives waveform variety (sine to saw to noise from one parameter) without the stability problems of mutual feedback.

### Design inspiration

**The stacked-pairs topology is the workhorse.** Algorithm 4 in OPM/OPN (two independent 2-op pairs) and algorithm 5 in the DX7 (three 2-op stacks) are by far the most-used. Our algorithm 4 ([A→B]+[C→D]) follows this pattern. It should be the default starting point for patches.

**The index is the most important modulation target.** A global FM depth scalar that LFOs and param locks can modulate gives one-knob control over overall brightness. This is why our patch structure has an `index` field separate from per-operator levels.

**C:M ratio determines character class.** Integer ratios = pitched tones (melodic voices). Non-integer ratios = metallic/inharmonic (percussion, effects). Ratios near integers = chorus/beating effects (thickening). Operator ratio presets grouped by character class would make patch design faster.

**Feedback amount is underrated.** A single operator with feedback sweeps from sine through sawtooth to noise. Combined with an algorithm that uses that operator as a modulator, you get the full range from clean FM to dirty, harmonically rich FM to noise-based sounds — all from one parameter.

### What the Digitone adds beyond classic FM

The key ideas the Digitone adds beyond standard FM:

- **B-group macro** — controlling two operators (B1+B2) as one parameter group, reducing cognitive load
- **Dual carrier output with MIX** — blending two timbral characters from one algorithm with one knob
- **ADE envelopes with End level** — modulation decays to a nonzero brightness instead of always reaching zero
- **HARM parameter** — continuous harmonic morphing on operators, richer than discrete waveform switching
- **Key tracking on modulation depth** — higher notes get less FM depth, physically accurate

We skip the X/Y dual output for now (single output simplifies the engine) but the B-group concept and ADE envelopes are worth considering for the UI layer.

