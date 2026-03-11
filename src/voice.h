#pragma once

#include "daisysp.h"
#include <cstdint>

namespace helm_audio {

enum class VoiceState : uint8_t {
    Idle,
    Active,
    Fading,
};

struct Patch {
    // FM2 operator params
    float ratio = 1.0f;
    float index = 1.0f;

    // Filter
    float filterFreq = 8000.0f;
    float filterRes = 0.0f;

    // Envelope
    float attack = 0.01f;
    float decay = 0.1f;
    float sustain = 0.7f;
    float release = 0.3f;
};

class Voice {
public:
    void Init(float sampleRate);
    void Configure(const Patch& config);
    float Process();
    void NoteOn(uint8_t note, uint8_t velocity);
    void NoteOff();
    void FadeOut();
    VoiceState GetState() const;

private:
    static constexpr float kFadeOutTime = 0.05f; // 50ms

    float sampleRate_ = 48000.0f;
    VoiceState state_ = VoiceState::Idle;
    bool gate_ = false;

    daisysp::Fm2 fm_;
    daisysp::Svf filter_;
    daisysp::Adsr env_;

    float savedRelease_ = 0.3f;
};

} // namespace helm_audio
