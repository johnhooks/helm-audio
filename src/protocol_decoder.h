#pragma once

#include "effect_bus.h"

#include <cstddef>
#include <cstdint>

namespace helm_audio {

class BinaryReader;
class Synth;

// Decoded effect configuration — intermediate representation between
// the binary protocol and the Synth's effect ownership model. The
// decoder builds these, the Synth creates actual Effect instances.

enum class DecodedEffectType : uint8_t {
    Delay = 0,
    Reverb = 1,
    Overdrive = 2,
    Chorus = 3,
};

struct DecodedEffectSlot {
    DecodedEffectType type;
    float params[4] = {};  // interpretation depends on type
};

struct DecodedBusConfig {
    DecodedEffectSlot slots[kMaxEffectsPerBus];
    int slotCount = 0;
};

/// Stateless binary protocol decoder. Reads a message buffer and calls
/// the appropriate Synth methods. The Synth owns all state — the decoder
/// is just a translation layer from bytes to API calls.
class ProtocolDecoder {
public:
    void Decode(Synth& synth, const uint8_t* data, size_t length);

private:
    void DecodePatchBank(Synth& synth, BinaryReader& reader);
    void DecodePattern(Synth& synth, BinaryReader& reader);
    void DecodeBusConfig(Synth& synth, BinaryReader& reader);
    void DecodeTransport(Synth& synth, BinaryReader& reader);
    void DecodeTempo(Synth& synth, BinaryReader& reader);
    void DecodeTrigger(Synth& synth, BinaryReader& reader);
};

} // namespace helm_audio
