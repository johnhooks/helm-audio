#pragma once

#include "param.h"

#include "daisysp.h"

namespace helm_audio::fm4 {

// Per-voice modulation state for the 4-op voice. Same architecture as
// helm_audio::VoiceModState but indexed by fm4::ParamId.

class VoiceModState {
  public:
    void Init(float sampleRate);
    void LoadPatch(const Patch& patch);
    void RestoreDefaults();
    void SetBase(ParamId id, float value);
    void Tick();

    float GetResolved(ParamId id) const {
        return resolved_[static_cast<int>(id)];
    }

  private:
    static float Clamp(ParamId id, float value);

    float sampleRate_ = 48000.0f;
    float defaults_[kParamCount] = {};
    float base_[kParamCount] = {};
    float resolved_[kParamCount] = {};

    daisysp::Oscillator lfos_[kMaxLfosPerVoice];
    Patch::LfoRoute routings_[kMaxLfosPerVoice] = {};
};

} // namespace helm_audio::fm4
