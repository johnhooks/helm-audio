#pragma once

#include "param.h"
#include "../voice.h" // for VoiceState

#include "daisysp.h"
#include <cstdint>

namespace helm_audio::fm4 {

// 4-operator FM voice with 8 OPM algorithms.
//
// Operators A, B, C, D. Algorithms route operators as modulators or carriers.
// Two envelope groups shape modulation depth over time:
//   - envA: operator A (topmost modulator in most algorithms)
//   - envB: operators B and C (second modulation layer)
// A third ADSR (ampEnv) gates the final output.
//
// Feedback is voice-level, applied to operator A only. Uses 2-sample averaged
// history for stability (the Yamaha convention).
//
// This class is independent of helm_audio::Voice and is used only through
// voice_bridge. The sequencer path (worklet_bridge / Synth) still uses the
// 2-op Voice.

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
    static constexpr float kIdxScalar = 0.2f;
    static constexpr float kFadeOutTime = 0.05f;

    struct Operator {
        daisysp::Oscillator osc;
        float ratio = 1.0f;
        float detune = 0.0f;
        float level = 1.0f;
    };

    void InitOperator(Operator& op, float sampleRate);
    void UpdateFrequencies();

    float ProcessOp(int idx, float phaseModIn);
    void ApplyFeedback();
    void UpdateFeedbackHistory(float opAOutput);

    // Algorithm render functions. Each returns the pre-filter audio sum.
    float RenderAlgo0(); // A → B → C → D  (serial)
    float RenderAlgo1(); // [A + B] → C → D
    float RenderAlgo2(); // [B → C] + A → D
    float RenderAlgo3(); // [A → B] + C → D
    float RenderAlgo4(); // [A → B] + [C → D]  (two pairs)
    float RenderAlgo5(); // A → [B + C + D]
    float RenderAlgo6(); // [A → B] + C + D
    float RenderAlgo7(); // A + B + C + D  (additive)

    float sampleRate_ = 48000.0f;
    float freq_ = 440.0f;
    float pitchOffset_ = 0.0f;
    float index_ = 1.0f;
    float feedback_ = 0.0f;
    float fbState_[2] = {};
    float velocity_ = 1.0f;
    uint8_t algorithm_ = 4;
    VoiceState state_ = VoiceState::Idle;
    bool gate_ = false;

    Operator ops_[4];

    daisysp::Adsr envA_;
    daisysp::Adsr envB_;
    daisysp::Adsr ampEnv_;
    float envAOut_ = 0.0f;
    float envBOut_ = 0.0f;

    daisysp::Svf filter_;
    float savedRelease_ = 0.3f;
};

} // namespace helm_audio::fm4
