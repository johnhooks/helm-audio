#include "modulation.h"

#include <algorithm>
#include <cstring>

using namespace daisysp;

namespace helm_audio::fm4 {

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
    std::memset(defaults_, 0, sizeof(defaults_));
    std::memset(base_, 0, sizeof(base_));
    std::memset(resolved_, 0, sizeof(resolved_));

    for (int i = 0; i < kMaxLfosPerVoice; ++i) {
        lfos_[i].Init(sampleRate);
        lfos_[i].SetWaveform(Oscillator::WAVE_SIN);
        lfos_[i].SetAmp(1.0f);
        lfos_[i].SetFreq(1.0f);
        routings_[i] = Patch::LfoRoute{};
    }
}

void VoiceModState::RestoreDefaults() {
    std::memcpy(base_, defaults_, sizeof(base_));
}

void VoiceModState::LoadPatch(const Patch& patch) {
    base_[static_cast<int>(ParamId::FilterFreq)] = patch.filterFreq;
    base_[static_cast<int>(ParamId::FilterRes)] = patch.filterRes;
    base_[static_cast<int>(ParamId::Index)] = patch.index;
    base_[static_cast<int>(ParamId::Pitch)] = 0.0f;
    base_[static_cast<int>(ParamId::Send0)] = patch.sends[0];
    base_[static_cast<int>(ParamId::Send1)] = patch.sends[1];
    base_[static_cast<int>(ParamId::Send2)] = patch.sends[2];
    base_[static_cast<int>(ParamId::Send3)] = patch.sends[3];

    base_[static_cast<int>(ParamId::Algorithm)] = patch.algorithm;
    base_[static_cast<int>(ParamId::Feedback)] = patch.feedback;

    base_[static_cast<int>(ParamId::AmpAttack)] = patch.ampAttack;
    base_[static_cast<int>(ParamId::AmpDecay)] = patch.ampDecay;
    base_[static_cast<int>(ParamId::AmpSustain)] = patch.ampSustain;
    base_[static_cast<int>(ParamId::AmpRelease)] = patch.ampRelease;

    base_[static_cast<int>(ParamId::EnvAAttack)] = patch.envA_attack;
    base_[static_cast<int>(ParamId::EnvADecay)] = patch.envA_decay;
    base_[static_cast<int>(ParamId::EnvASustain)] = patch.envA_sustain;
    base_[static_cast<int>(ParamId::EnvARelease)] = patch.envA_release;

    base_[static_cast<int>(ParamId::EnvBAttack)] = patch.envB_attack;
    base_[static_cast<int>(ParamId::EnvBDecay)] = patch.envB_decay;
    base_[static_cast<int>(ParamId::EnvBSustain)] = patch.envB_sustain;
    base_[static_cast<int>(ParamId::EnvBRelease)] = patch.envB_release;

    base_[static_cast<int>(ParamId::RatioA)] = patch.ops[0].ratio;
    base_[static_cast<int>(ParamId::RatioB)] = patch.ops[1].ratio;
    base_[static_cast<int>(ParamId::RatioC)] = patch.ops[2].ratio;
    base_[static_cast<int>(ParamId::RatioD)] = patch.ops[3].ratio;
    base_[static_cast<int>(ParamId::DetuneA)] = patch.ops[0].detune;
    base_[static_cast<int>(ParamId::DetuneB)] = patch.ops[1].detune;
    base_[static_cast<int>(ParamId::DetuneC)] = patch.ops[2].detune;
    base_[static_cast<int>(ParamId::DetuneD)] = patch.ops[3].detune;
    base_[static_cast<int>(ParamId::LevelA)] = patch.ops[0].level;
    base_[static_cast<int>(ParamId::LevelB)] = patch.ops[1].level;
    base_[static_cast<int>(ParamId::LevelC)] = patch.ops[2].level;
    base_[static_cast<int>(ParamId::LevelD)] = patch.ops[3].level;

    // Snapshot base values as defaults for RestoreDefaults()
    std::memcpy(defaults_, base_, sizeof(defaults_));

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
    for (int i = 0; i < kParamCount; ++i) {
        resolved_[i] = base_[i];
    }

    for (int i = 0; i < kMaxLfosPerVoice; ++i) {
        float lfoVal = lfos_[i].Process();

        const auto& routing = routings_[i];
        for (int r = 0; r < routing.routeCount; ++r) {
            const auto& route = routing.routes[r];
            if (route.depth != 0.0f) {
                int idx = static_cast<int>(route.target);
                if (idx >= 0 && idx < kParamCount) {
                    resolved_[idx] += lfoVal * route.depth;
                }
            }
        }
    }

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
    case ParamId::Algorithm:
        return std::clamp(value, 0.0f, 7.0f);
    case ParamId::Feedback:
        return std::clamp(value, 0.0f, 1.0f);
    case ParamId::AmpAttack:
    case ParamId::AmpDecay:
    case ParamId::AmpRelease:
    case ParamId::EnvAAttack:
    case ParamId::EnvADecay:
    case ParamId::EnvARelease:
    case ParamId::EnvBAttack:
    case ParamId::EnvBDecay:
    case ParamId::EnvBRelease:
        return std::max(0.001f, value);
    case ParamId::AmpSustain:
    case ParamId::EnvASustain:
    case ParamId::EnvBSustain:
        return std::clamp(value, 0.0f, 1.0f);
    case ParamId::LevelA:
    case ParamId::LevelB:
    case ParamId::LevelC:
    case ParamId::LevelD:
        return std::clamp(value, 0.0f, 1.0f);
    case ParamId::Pitch:
    case ParamId::RatioA:
    case ParamId::RatioB:
    case ParamId::RatioC:
    case ParamId::RatioD:
    case ParamId::DetuneA:
    case ParamId::DetuneB:
    case ParamId::DetuneC:
    case ParamId::DetuneD:
        return value;
    }
    return value;
}

} // namespace helm_audio::fm4
