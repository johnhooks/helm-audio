#include "modulation.h"

#include <algorithm>
#include <cstring>

using namespace daisysp;

namespace helm_audio {

static uint8_t LfoWaveformToDaisy(LfoWaveform wf) {
    switch (wf) {
    case LfoWaveform::Sine:     return Oscillator::WAVE_SIN;
    case LfoWaveform::Triangle: return Oscillator::WAVE_TRI;
    case LfoWaveform::Saw:      return Oscillator::WAVE_SAW;
    case LfoWaveform::Square:   return Oscillator::WAVE_SQUARE;
    }
    return Oscillator::WAVE_SIN;
}

void VoiceModState::Init(float sampleRate) {
    sampleRate_ = sampleRate;
    std::memset(base_, 0, sizeof(base_));
    std::memset(resolved_, 0, sizeof(resolved_));

    for (int i = 0; i < kMaxLfosPerVoice; ++i) {
        lfos_[i].Init(sampleRate);
        lfos_[i].SetWaveform(Oscillator::WAVE_SIN);
        lfos_[i].SetAmp(1.0f);
        lfos_[i].SetFreq(1.0f);
        routings_[i] = LfoRouting{};
    }
}

void VoiceModState::LoadPatch(const Patch& patch) {
    // Copy base values from patch
    base_[static_cast<int>(ParamId::FilterFreq)] = patch.filterFreq;
    base_[static_cast<int>(ParamId::FilterRes)] = patch.filterRes;
    base_[static_cast<int>(ParamId::Index)] = patch.index;
    base_[static_cast<int>(ParamId::Pitch)] = 0.0f;
    base_[static_cast<int>(ParamId::Send0)] = patch.sends[0];
    base_[static_cast<int>(ParamId::Send1)] = patch.sends[1];
    base_[static_cast<int>(ParamId::Send2)] = patch.sends[2];
    base_[static_cast<int>(ParamId::Send3)] = patch.sends[3];
    base_[static_cast<int>(ParamId::Ratio)] = patch.ops[1].ratio;
    base_[static_cast<int>(ParamId::Attack)] = patch.attack;
    base_[static_cast<int>(ParamId::Decay)] = patch.decay;
    base_[static_cast<int>(ParamId::Sustain)] = patch.sustain;
    base_[static_cast<int>(ParamId::Release)] = patch.release;

    // Update LFO rate/waveform but do NOT reset phase
    for (int i = 0; i < kMaxLfosPerVoice; ++i) {
        lfos_[i].SetFreq(patch.lfos[i].rate);
        lfos_[i].SetWaveform(LfoWaveformToDaisy(patch.lfos[i].waveform));
        routings_[i] = patch.lfoRoutings[i];
    }
}

void VoiceModState::SetBase(ParamId id, float value) {
    base_[static_cast<int>(id)] = value;
}

void VoiceModState::Tick() {
    // Start with base values
    for (int i = 0; i < kParamCount; ++i) {
        resolved_[i] = base_[i];
    }

    // Process each LFO and apply its routings
    for (int i = 0; i < kMaxLfosPerVoice; ++i) {
        float lfoVal = lfos_[i].Process();

        const auto& routing = routings_[i];
        for (int r = 0; r < routing.routeCount; ++r) {
            const auto& route = routing.routes[r];
            if (route.depth != 0.0f) {
                int idx = static_cast<int>(route.target);
                resolved_[idx] += lfoVal * route.depth;
            }
        }
    }

    // Clamp resolved values at parameter boundaries
    for (int i = 0; i < kParamCount; ++i) {
        resolved_[i] = Clamp(static_cast<ParamId>(i), resolved_[i]);
    }
}

float VoiceModState::Clamp(ParamId id, float value) {
    switch (id) {
    case ParamId::FilterFreq:
        return std::max(20.0f, value);
    case ParamId::FilterRes:
        return std::clamp(value, 0.0f, 1.0f);
    case ParamId::Index:
        return std::max(0.0f, value);
    case ParamId::Send0:
    case ParamId::Send1:
    case ParamId::Send2:
    case ParamId::Send3:
        return std::clamp(value, 0.0f, 1.0f);
    case ParamId::Attack:
    case ParamId::Decay:
    case ParamId::Release:
        return std::max(0.001f, value);
    case ParamId::Sustain:
        return std::clamp(value, 0.0f, 1.0f);
    case ParamId::Pitch:
    case ParamId::Ratio:
        return value; // no clamping
    }
    return value;
}

} // namespace helm_audio
