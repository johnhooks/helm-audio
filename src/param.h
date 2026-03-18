#pragma once

#include <cstdint>

namespace helm_audio {

// Shared vocabulary for modulatable and lockable parameters.
// Used by the sequencer (param locks), the voice (SetParam), and the
// modulation system (LFO routing).

enum class ParamId : uint8_t {
    // LFO-routable and lockable
    FilterFreq,
    Index,
    Pitch,
    Send0,
    Send1,
    Send2,
    Send3,

    // Lock-only (not LFO-routable yet)
    Ratio,
    FilterRes,
    Attack,
    Decay,
    Sustain,
    Release,
};

static constexpr int kParamCount = 13;

struct ParamLock {
    ParamId param;
    float value;
};

// -- LFO types ----------------------------------------------------------------

enum class LfoWaveform : uint8_t {
    Sine,
    Triangle,
    Saw,
    Square,
};

struct LfoConfig {
    float rate = 1.0f;
    LfoWaveform waveform = LfoWaveform::Sine;
};

struct ModRouting {
    ParamId target = ParamId::FilterFreq;
    float depth = 0.0f;
};

static constexpr int kMaxLfosPerVoice = 2;
static constexpr int kMaxRoutingsPerLfo = 4;

struct LfoRouting {
    ModRouting routes[kMaxRoutingsPerLfo] = {};
    int routeCount = 0;
};

} // namespace helm_audio
