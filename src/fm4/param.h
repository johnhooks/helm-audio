#pragma once

#include "../param.h"

#include <cstdint>

namespace helm_audio::fm4 {

// Parameter vocabulary for the 4-op FM voice. Parallel to ParamId (which
// serves the 2-op voice and sequencer path). Kept separate so the existing
// modulation system and sequencer are unaffected.

enum class ParamId : uint8_t {
    // LFO-routable
    FilterFreq,
    Index,
    Pitch,
    Send0,
    Send1,
    Send2,
    Send3,

    // Voice-level
    Algorithm,
    Feedback,
    FilterRes,

    // Amplitude envelope
    AmpAttack,
    AmpDecay,
    AmpSustain,
    AmpRelease,

    // Envelope A (operator A modulation depth)
    EnvAAttack,
    EnvADecay,
    EnvASustain,
    EnvARelease,

    // Envelope B (operators B+C modulation depth)
    EnvBAttack,
    EnvBDecay,
    EnvBSustain,
    EnvBRelease,

    // Per-operator
    RatioA,
    RatioB,
    RatioC,
    RatioD,
    DetuneA,
    DetuneB,
    DetuneC,
    DetuneD,
    LevelA,
    LevelB,
    LevelC,
    LevelD,
};

static constexpr int kParamCount = 34;

// -- Patch types ----------------------------------------------------------

struct OperatorPatch {
    float ratio = 1.0f;
    float detune = 0.0f;
    float level = 1.0f;
};

struct Patch {
    OperatorPatch ops[4];
    uint8_t algorithm = 4; // default: two pairs (the workhorse)
    float index = 1.0f;
    float feedback = 0.0f; // operator A only

    // Envelope A (operator A when modulator)
    float envA_attack = 0.01f;
    float envA_decay = 0.1f;
    float envA_sustain = 1.0f;
    float envA_release = 0.3f;

    // Envelope B (operators B+C when modulator)
    float envB_attack = 0.01f;
    float envB_decay = 0.1f;
    float envB_sustain = 1.0f;
    float envB_release = 0.3f;

    // Amplitude envelope
    float ampAttack = 0.01f;
    float ampDecay = 0.1f;
    float ampSustain = 0.7f;
    float ampRelease = 0.3f;

    float filterFreq = 8000.0f;
    float filterRes = 0.0f;
    float sends[4] = {};

    LfoConfig lfos[kMaxLfosPerVoice] = {};

    // Separate routing type so we can target fm4::ParamId values without
    // touching the shared ModRouting / LfoRouting used by the 2-op path.
    struct ModRoute {
        uint8_t target = 0;
        float depth = 0.0f;
    };
    struct LfoRoute {
        ModRoute routes[kMaxRoutingsPerLfo] = {};
        int routeCount = 0;
    };
    LfoRoute lfoRoutings[kMaxLfosPerVoice] = {};
};

} // namespace helm_audio::fm4
