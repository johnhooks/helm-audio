#pragma once

#include <cstddef>
#include <cstdint>

namespace helm_audio {
class BinaryReader;
}

namespace helm_audio::fm4 {

class Voice;
class VoiceModState;

/// Stateless binary protocol decoder for the fm4 voice worklet.
/// Reads a message buffer and calls the appropriate Voice / VoiceModState
/// methods. Matches the wire format produced by @helm-audio/protocol's
/// voice encoders.
class VoiceDecoder {
  public:
    void Decode(Voice& voice, VoiceModState& mod,
                const uint8_t* data, size_t length);

  private:
    void DecodeLoadPatch(Voice& voice, VoiceModState& mod,
                         helm_audio::BinaryReader& reader);
    void DecodeTrig(Voice& voice, VoiceModState& mod,
                    helm_audio::BinaryReader& reader);
};

} // namespace helm_audio::fm4
