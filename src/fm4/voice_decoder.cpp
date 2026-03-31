#include "voice_decoder.h"
#include "modulation.h"
#include "voice.h"
#include "../binary_reader.h"

using helm_audio::BinaryReader;

namespace helm_audio::fm4 {

// Voice message type IDs — must match VoiceMessageType in protocol TS.
// Init (0x00) is handled by the JS processor, not the C++ decoder.
static constexpr uint8_t kMsgLoadPatch = 0x01;
static constexpr uint8_t kMsgTrig      = 0x02;
static constexpr uint8_t kMsgNoteOn    = 0x03;
static constexpr uint8_t kMsgNoteOff   = 0x04;
static constexpr uint8_t kMsgFadeOut   = 0x05;

// Step flags — matches the synth protocol's pattern step encoding.
static constexpr uint8_t kHasTrig  = 0x01;
static constexpr uint8_t kHasLocks = 0x02;

// Trig types — matches TrigType enum.
static constexpr uint8_t kTrigNoteOn  = 1;
static constexpr uint8_t kTrigNoteOff = 2;
static constexpr uint8_t kTrigFadeOut = 3;

void VoiceDecoder::Decode(Voice& voice, VoiceModState& mod,
                          const uint8_t* data, size_t length) {
    if (length == 0) return;

    BinaryReader reader(data, length);
    uint8_t type = reader.ReadU8();

    switch (type) {
    case kMsgLoadPatch: DecodeLoadPatch(voice, mod, reader); break;
    case kMsgTrig:      DecodeTrig(voice, mod, reader);      break;
    case kMsgNoteOn:
        voice.NoteOn(reader.ReadU8(), reader.ReadU8());
        break;
    case kMsgNoteOff:
        voice.NoteOff();
        break;
    case kMsgFadeOut:
        voice.FadeOut();
        break;
    default:
        break;
    }
}

void VoiceDecoder::DecodeLoadPatch(Voice& voice, VoiceModState& mod,
                                   BinaryReader& reader) {
    Patch patch;

    // 4 operators: ratio, detune, level
    for (auto& op : patch.ops) {
        op.ratio = reader.ReadF32();
        op.detune = reader.ReadF32();
        op.level = reader.ReadF32();
    }

    patch.algorithm = reader.ReadU8();
    patch.index = reader.ReadF32();
    patch.feedback = reader.ReadF32();

    // Envelope A
    patch.envA_attack = reader.ReadF32();
    patch.envA_decay = reader.ReadF32();
    patch.envA_sustain = reader.ReadF32();
    patch.envA_release = reader.ReadF32();

    // Envelope B
    patch.envB_attack = reader.ReadF32();
    patch.envB_decay = reader.ReadF32();
    patch.envB_sustain = reader.ReadF32();
    patch.envB_release = reader.ReadF32();

    // Amplitude envelope
    patch.ampAttack = reader.ReadF32();
    patch.ampDecay = reader.ReadF32();
    patch.ampSustain = reader.ReadF32();
    patch.ampRelease = reader.ReadF32();

    // Filter
    patch.filterFreq = reader.ReadF32();
    patch.filterRes = reader.ReadF32();

    // Sends
    for (float& send : patch.sends) {
        send = reader.ReadF32();
    }

    // 2 LFOs
    for (int i = 0; i < kMaxLfosPerVoice; ++i) {
        patch.lfos[i].rate = reader.ReadF32();
        patch.lfos[i].waveform =
            static_cast<LfoWaveform>(reader.ReadU8());
        int routeCount = reader.ReadU8();
        patch.lfoRoutings[i].routeCount = routeCount;
        for (int r = 0; r < routeCount && r < kMaxRoutingsPerLfo; ++r) {
            patch.lfoRoutings[i].routes[r].target = reader.ReadU8();
            patch.lfoRoutings[i].routes[r].depth = reader.ReadF32();
        }
    }

    voice.Configure(patch);
    mod.LoadPatch(patch);
}

void VoiceDecoder::DecodeTrig(Voice& voice, VoiceModState& mod,
                              BinaryReader& reader) {
    uint8_t flags = reader.ReadU8();

    // 1. Restore all params to patch defaults (only on trig)
    if (flags & kHasTrig) {
        mod.RestoreDefaults();
    }

    // 2. Read and apply trig (before locks, so NoteOn sets velocity
    //    before any lock processing — but locks don't affect velocity)
    uint8_t trigType = 0;
    uint8_t note = 0;
    uint8_t velocity = 0;
    if (flags & kHasTrig) {
        trigType = reader.ReadU8();
        if (trigType == kTrigNoteOn) {
            note = reader.ReadU8();
            velocity = reader.ReadU8();
        }
    }

    // 3. Apply param locks
    if (flags & kHasLocks) {
        uint8_t lockCount = reader.ReadU8();
        for (int i = 0; i < lockCount; ++i) {
            uint8_t param = reader.ReadU8();
            float value = reader.ReadF32();
            mod.SetBase(static_cast<ParamId>(param), value);
        }
    }

    // 4. Fire trig
    if (flags & kHasTrig) {
        switch (trigType) {
        case kTrigNoteOn:
            voice.NoteOn(note, velocity);
            break;
        case kTrigNoteOff:
            voice.NoteOff();
            break;
        case kTrigFadeOut:
            voice.FadeOut();
            break;
        default:
            break;
        }
    }
}

} // namespace helm_audio::fm4
