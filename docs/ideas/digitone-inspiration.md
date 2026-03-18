# Digitone inspiration

Notes on the Elektron Digitone's FM architecture. Not a spec to implement — a reference for when we expand beyond 2 operators.

## Operator layout

The Digitone has 4 operators per voice: **A**, **B1**, **B2**, and **C**. B1 and B2 share a control group on the hardware, so the interface feels like three groups (A, B, C) even though there are four operators. This is a smart UI compromise — 4 operators gives enough routing flexibility, but grouping B1/B2 keeps the panel manageable.

## Output buses

Each algorithm routes operators to two output buses, **X** and **Y**. A MIX knob crossfades between them. This means every algorithm produces two timbral components you can blend, which gives a lot of movement from a single parameter. Algorithm 2, for example, puts two independent 2-op FM stacks on X and Y — crossfading between two completely different timbres.

## The 8 algorithms

`→` means "modulates." **(fb)** marks the self-feedback operator. **Bold** operators are carriers (output audio). (X) and (Y) indicate which output bus.

### Algorithm 1 — Branch
A → **C**(X), B2 → B1(fb) → **C**(X), **A**(Y)

Multiple modulators converge on carrier C. A also outputs directly on Y, so the mix knob blends the modulated C against clean A.

### Algorithm 2 — Two stacks
A → **C**(X), B2 → **B1**(Y)

Two independent 2-op FM pairs. The simplest to reason about — X and Y are completely separate timbres. Good starting point for understanding the X/Y system.

### Algorithm 3 — Root
A(fb) → **B1**(Y), **B2**(X), **C**(X)

One modulator (A) drives all three other operators. A with feedback gives it a richer modulation source. Three carriers means a lot of additive character.

### Algorithm 4 — Full stack
B2(fb) → B1 → **C**(X), A → **C**(X), **B1**(Y)

The deepest modulation chain: B2 → B1 → C, with A also modulating C. Most complex FM interactions. B1 also outputs on Y so the mix knob controls how much of the mid-chain you hear.

### Algorithm 5 — Cross-modulation
B1(fb) → **A**(Y), B2 → **C**(X), A → **C**(X)

A is both a carrier (outputs on Y) and a modulator (feeds into C). Cross-modulation — the output of one carrier affects another.

### Algorithm 6 — Two stacks with feedback
A(fb) → **C**(X), B2 → **B1**(Y)

Same structure as algorithm 2 but A has self-feedback, giving the X stack a richer, more harmonically dense modulation source.

### Algorithm 7 — Hybrid additive/FM
A(fb) → **C**(X), B2 → **B1**(X), **A**(Y), **B2**(Y)

All four operators output audio. Two FM pairs on X, their modulators also output on Y. The most additive algorithm — at low FM depths, it's four sine waves. At high depths, FM character comes through.

### Algorithm 8 — Near-additive
A → **C**(X), **B2**(X), **B1**(fb)(Y)

One FM pair (A → C) plus a standalone carrier (B2) on X. B1 with self-feedback stands alone on Y. Mostly additive with one modulation pair.

## Patterns worth noting

**One feedback operator per algorithm.** Every algorithm has exactly one operator with self-feedback, and it's always self-modulation (the operator feeds its own output back into its phase). This adds harmonic richness to that operator's output without the complexity of cross-feedback loops.

**Algorithms span a spectrum from pure FM to additive.** Algorithm 4 is deep FM (long modulation chain). Algorithm 7-8 are near-additive (most operators output directly). The Digitone doesn't treat FM and additive as separate modes — they're endpoints on a continuum defined by the algorithm choice.

**The X/Y mix is structural, not just a balance knob.** Because different operators route to X and Y, the mix knob can crossfade between fundamentally different timbral components — not just volume balance, but different harmonic structures.

## What this means for helm-audio

We're starting with 2 operators (one algorithm: modulator → carrier). When we expand:

- **4 operators** is the sweet spot — enough for interesting routing without the complexity of DX7's 6-op/32-algorithm system.
- **3-4 algorithms** would cover the useful range: a parallel pair (algo 2), a full stack (algo 4), a branch (algo 1), and maybe a hybrid (algo 7).
- **Self-feedback** on one operator per algorithm is worth implementing — it's a single float parameter and a one-sample delay buffer, but it adds a lot of harmonic range.
- **The X/Y output bus concept** is interesting but might be overkill for a game sound engine. Worth considering if we want that kind of timbral movement from a single parameter.
