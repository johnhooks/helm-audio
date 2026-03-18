#pragma once

#include "param.h"
#include "voice.h"

#include "daisysp.h"

namespace helm_audio {

// Per-track modulation runtime state. Owns the LFO oscillators and computes
// resolved parameter values each sample: resolved = base + sum(lfo * depth).
// Designed to be driven by the synth — the voice never sees LFOs directly,
// it just receives resolved floats via SetParam.

class VoiceModState {
public:
    void Init(float sampleRate);
    void LoadPatch(const Patch& patch);
    void SetBase(ParamId id, float value);
    void Tick();

    float GetResolved(ParamId id) const { return resolved_[static_cast<int>(id)]; }
    float GetBase(ParamId id) const { return base_[static_cast<int>(id)]; }

private:
    static float Clamp(ParamId id, float value);

    float sampleRate_ = 48000.0f;
    float base_[kParamCount] = {};
    float resolved_[kParamCount] = {};

    daisysp::Oscillator lfos_[kMaxLfosPerVoice];
    LfoRouting routings_[kMaxLfosPerVoice] = {};
};

} // namespace helm_audio
