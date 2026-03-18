#pragma once

#include "param.h"

#include "daisysp.h"
#include <cstdint>

namespace helm_audio {

// -- Op-----------------------------------------------------------------
//
// An operator is the atomic unit of FM synthesis: a sine oscillator with its
// own ADSR envelope. In a 2-op voice, one operator is the carrier (the sound
// you hear) and the other is the modulator (shapes the carrier's timbre).
//
// The operator's envelope controls its amplitude over time. For the modulator,
// this means the FM depth changes as the note evolves — a fast-decaying
// modulator envelope gives a bright attack that mellows to a pure sine (bells,
// plucks). A sustained modulator keeps the timbre complex throughout (organs,
// basses).

struct OperatorPatch {
    float ratio = 1.0f;     // frequency = note frequency * ratio
                             // integer ratios (1, 2, 3) = harmonic (musical)
                             // non-integer ratios (1.41, 2.7) = inharmonic (metallic, bells)
    float detune = 0.0f;    // fine detune in Hz, added after ratio
    float level = 1.0f;     // output amplitude scalar
    float feedback = 0.0f;  // self-feedback amount (0 = off, 0.1-0.5 = rich, 1.0 = noisy)
    float attack = 0.01f;   // operator envelope — controls this operator's
    float decay = 0.1f;     // amplitude over time, independent of the
    float sustain = 1.0f;   // voice's amplitude envelope
    float release = 0.3f;
};

// -- Patch --------------------------------------------------------------------
//
// Full voice configuration. The signal chain:
//
//   modulator.osc * modulator.env * index --> carrier.PhaseAdd (FM)
//   carrier.osc * carrier.env --> filter --> * amplitude envelope --> output
//
// The carrier envelope shapes the carrier's amplitude over time (independent
// of the voice's amplitude envelope). A fast carrier decay with a slow amp
// release gives a pluck that rings out. A slow carrier attack with instant
// amp attack gives a sound that brightens over time.
//
// Either operator can have self-feedback: the operator's previous output is
// fed back into its own phase, adding harmonics. On the modulator, feedback
// makes the modulation source richer (like using a complex waveform instead
// of a sine). On the carrier, feedback adds harmonics directly to the output.
//
// Three layers of control over modulation depth:
//   - index: overall FM depth (param-lockable per step from the sequencer)
//   - modulator.level: static scaling of this operator's contribution
//   - modulator.envelope: time-varying — shapes how the timbre evolves

struct Patch {
    // ops[0] = carrier (the oscillator you hear)
    // ops[1] = modulator (wobbles the carrier's phase to create harmonics)
    OperatorPatch ops[2];

    // FM index — overall modulation depth. Higher = more harmonics.
    // 0 = pure sine (no modulation), ~1-3 = musical range, 5+ = aggressive
    float index = 1.0f;

    // Filter (lowpass) — shapes the final spectrum after FM
    float filterFreq = 8000.0f;
    float filterRes = 0.0f;

    // Effect bus send levels
    float sends[4] = {};

    // LFO configurations and routing tables
    LfoConfig lfos[kMaxLfosPerVoice] = {};
    LfoRouting lfoRoutings[kMaxLfosPerVoice] = {};

    // Amplitude envelope — gates the final output volume.
    // Separate from operator envelopes: this controls loudness,
    // operator envelopes control timbre.
    float attack = 0.01f;
    float decay = 0.1f;
    float sustain = 0.7f;
    float release = 0.3f;
};

// -- Voice --------------------------------------------------------------------

enum class VoiceState : uint8_t {
    Idle,
    Active,
    Fading,
};

class Voice {
public:
    void Init(float sampleRate);
    void Configure(const Patch& config);
    void SetParam(ParamId id, float value);
    float Process();
    void NoteOn(uint8_t note, uint8_t velocity);
    void NoteOff();
    void FadeOut();
    VoiceState GetState() const;

private:
    // Index scaling matches daisysp::Fm2 so equivalent index values
    // produce equivalent modulation depth.
    // PhaseAdd(modval * idx) where idx = index * 0.2f.
    // The oscillator phase is 0-1, so idx = 1.0 means ±1.0 phase
    // deviation = ±2π radians. index 5 = 2π rads peak deviation.
    static constexpr float kIdxScalar = 0.2f;
    static constexpr float kFadeOutTime = 0.05f; // 50ms

    struct Operator {
        daisysp::Oscillator osc;
        daisysp::Adsr env;
        float ratio = 1.0f;
        float detune = 0.0f;
        float level = 1.0f;
        float feedback = 0.0f;    // self-feedback amount
        float fbState[2] = {};    // 2-sample feedback history
        bool gate = false;
    };

    void InitOperator(Operator& op, float sampleRate);
    void ConfigureOperator(Operator& op, const OperatorPatch& patch);

    float sampleRate_ = 48000.0f;
    float freq_ = 440.0f;
    float index_ = 1.0f;
    VoiceState state_ = VoiceState::Idle;
    bool gate_ = false;

    Operator carrier_;
    Operator modulator_;
    daisysp::Svf filter_;
    daisysp::Adsr env_;

    float savedRelease_ = 0.3f;
};

} // namespace helm_audio
