#include "protocol_decoder.h"
#include "binary_reader.h"
#include "synth.h"

namespace helm_audio {

// Message type IDs — must match TypeScript MessageType enum.
// Init (0x00) is handled by the JS processor, not the C++ decoder.
static constexpr uint8_t kMsgPatchBank = 0x01;
static constexpr uint8_t kMsgPattern   = 0x02;
static constexpr uint8_t kMsgBusConfig = 0x03;
static constexpr uint8_t kMsgTransport = 0x04;
static constexpr uint8_t kMsgTempo     = 0x05;
static constexpr uint8_t kMsgTrigger   = 0x06;

// Step flags — must match TypeScript encode.ts constants
static constexpr uint8_t kHasTrig       = 0x01;
static constexpr uint8_t kHasLocks      = 0x02;
static constexpr uint8_t kHasPatchIndex = 0x04;
static constexpr uint8_t kOneshot       = 0x08;

// Trig types — must match TypeScript TrigType enum
static constexpr uint8_t kTrigNoteOn  = 1;
static constexpr uint8_t kTrigNoteOff = 2;
static constexpr uint8_t kTrigFadeOut = 3;

// Transport commands — must match TypeScript TransportCommand enum
static constexpr uint8_t kCmdStop    = 0;
static constexpr uint8_t kCmdPlay    = 1;
static constexpr uint8_t kCmdRestart = 2;

void ProtocolDecoder::Decode(Synth& synth, const uint8_t* data, size_t length) {
    if (length == 0) return;

    BinaryReader reader(data, length);
    uint8_t type = reader.ReadU8();

    switch (type) {
    case kMsgPatchBank: DecodePatchBank(synth, reader); break;
    case kMsgPattern:   DecodePattern(synth, reader);   break;
    case kMsgBusConfig: DecodeBusConfig(synth, reader);  break;
    case kMsgTransport: DecodeTransport(synth, reader);  break;
    case kMsgTempo:     DecodeTempo(synth, reader);      break;
    case kMsgTrigger:   DecodeTrigger(synth, reader);    break;
    default: break; // unknown message type — ignore
    }
}

void ProtocolDecoder::DecodeTransport(Synth& synth, BinaryReader& reader) {
    uint8_t cmd = reader.ReadU8();
    switch (cmd) {
    case kCmdStop:    synth.Stop();    break;
    case kCmdPlay:    synth.Play();    break;
    case kCmdRestart: synth.Restart(); break;
    default: break;
    }
}

void ProtocolDecoder::DecodeTempo(Synth& synth, BinaryReader& reader) {
    float bpm = reader.ReadF32();
    synth.SetTempo(bpm);
}

// Wire format from encodePatchBank():
//   [patchCount: u8]
//   per patch:
//     [op0: 8 x f32] [op1: 8 x f32]
//     [index: f32] [filterFreq: f32] [filterRes: f32]
//     [send0..3: 4 x f32]
//     [attack: f32] [decay: f32] [sustain: f32] [release: f32]
//     [lfo0: rate(f32) waveform(u8) routeCount(u8) routes...]
//     [lfo1: rate(f32) waveform(u8) routeCount(u8) routes...]

static OperatorPatch readOperator(BinaryReader& reader) {
    OperatorPatch op;
    op.ratio    = reader.ReadF32();
    op.detune   = reader.ReadF32();
    op.level    = reader.ReadF32();
    op.feedback = reader.ReadF32();
    op.attack   = reader.ReadF32();
    op.decay    = reader.ReadF32();
    op.sustain  = reader.ReadF32();
    op.release  = reader.ReadF32();
    return op;
}

static void readLfo(BinaryReader& reader, LfoConfig& config, LfoRouting& routing) {
    config.rate     = reader.ReadF32();
    config.waveform = static_cast<LfoWaveform>(reader.ReadU8());

    uint8_t routeCount = reader.ReadU8();
    routing.routeCount = routeCount;

    for (int r = 0; r < routeCount && r < kMaxRoutingsPerLfo; r++) {
        routing.routes[r].target = static_cast<ParamId>(reader.ReadU8());
        routing.routes[r].depth  = reader.ReadF32();
    }
    // Skip any routes beyond kMaxRoutingsPerLfo
    for (int r = kMaxRoutingsPerLfo; r < routeCount; r++) {
        reader.ReadU8();
        reader.ReadF32();
    }
}

void ProtocolDecoder::DecodePatchBank(Synth& synth, BinaryReader& reader) {
    uint8_t patchCount = reader.ReadU8();

    std::vector<Patch> patches(patchCount);
    for (int i = 0; i < patchCount; i++) {
        Patch& p = patches[i];

        p.ops[0] = readOperator(reader);
        p.ops[1] = readOperator(reader);

        p.index     = reader.ReadF32();
        p.filterFreq = reader.ReadF32();
        p.filterRes  = reader.ReadF32();

        p.sends[0] = reader.ReadF32();
        p.sends[1] = reader.ReadF32();
        p.sends[2] = reader.ReadF32();
        p.sends[3] = reader.ReadF32();

        // Amplitude envelope — before LFOs in the wire format
        p.attack  = reader.ReadF32();
        p.decay   = reader.ReadF32();
        p.sustain = reader.ReadF32();
        p.release = reader.ReadF32();

        readLfo(reader, p.lfos[0], p.lfoRoutings[0]);
        readLfo(reader, p.lfos[1], p.lfoRoutings[1]);
    }

    synth.LoadPatchBank(std::move(patches));
}

// Wire format from encodePattern():
//   [trackCount: u8] [length: u8]
//   per track:
//     [stepCount: u8] [eventCount: u8]
//     per event:
//       [stepIndex: u8] [flags: u8] [microTiming: i8]
//       if HAS_PATCH_INDEX: [patchIndex: u8]
//       if HAS_TRIG: [trigType: u8] (if NoteOn: [note: u8] [velocity: u8])
//       if HAS_LOCKS: [lockCount: u8] per lock: [param: u8] [value: f32]

void ProtocolDecoder::DecodePattern(Synth& synth, BinaryReader& reader) {
    uint8_t trackCount = reader.ReadU8();
    uint8_t length     = reader.ReadU8();

    Pattern pattern;
    pattern.length = length;
    pattern.tracks.resize(trackCount);

    for (int t = 0; t < trackCount; t++) {
        auto& track = pattern.tracks[t];
        uint8_t stepCount  = reader.ReadU8();
        uint8_t eventCount = reader.ReadU8();

        track.steps.resize(stepCount);

        for (int e = 0; e < eventCount; e++) {
            uint8_t stepIndex   = reader.ReadU8();
            uint8_t flags       = reader.ReadU8();
            int8_t  microTiming = reader.ReadI8();

            if (stepIndex >= stepCount) continue; // guard against bad data

            Step& step = track.steps[stepIndex];
            step.microTiming = microTiming;
            step.oneshot = (flags & kOneshot) != 0;

            if (flags & kHasPatchIndex) {
                step.patchIndex = reader.ReadU8();
            }

            if (flags & kHasTrig) {
                uint8_t trigType = reader.ReadU8();
                switch (trigType) {
                case kTrigNoteOn: {
                    uint8_t note = reader.ReadU8();
                    uint8_t vel  = reader.ReadU8();
                    step.trig = NoteOn{note, vel};
                    break;
                }
                case kTrigNoteOff:
                    step.trig = NoteOff{};
                    break;
                case kTrigFadeOut:
                    step.trig = FadeOut{};
                    break;
                default:
                    break;
                }
            }

            if (flags & kHasLocks) {
                uint8_t lockCount = reader.ReadU8();
                step.locks.resize(lockCount);
                for (int l = 0; l < lockCount; l++) {
                    step.locks[l].param = static_cast<ParamId>(reader.ReadU8());
                    step.locks[l].value = reader.ReadF32();
                }
            }
        }
    }

    synth.LoadPattern(std::move(pattern));
}

// Wire format from encodeBusConfig():
//   per bus (4 total):
//     [slotCount: u8]
//     per slot:
//       [effectType: u8]
//       type-specific params (see writeEffect)

void ProtocolDecoder::DecodeBusConfig(Synth& synth, BinaryReader& reader) {
    for (int bus = 0; bus < kMaxEffectBuses; bus++) {
        DecodedBusConfig config;
        config.slotCount = reader.ReadU8();

        for (int s = 0; s < config.slotCount && s < kMaxEffectsPerBus; s++) {
            auto& slot = config.slots[s];
            slot.type = static_cast<DecodedEffectType>(reader.ReadU8());

            switch (slot.type) {
            case DecodedEffectType::Delay:
                slot.params[0] = reader.ReadF32(); // time
                slot.params[1] = reader.ReadF32(); // feedback
                slot.params[2] = reader.ReadF32(); // mix
                break;
            case DecodedEffectType::Reverb:
                slot.params[0] = reader.ReadF32(); // feedback
                slot.params[1] = reader.ReadF32(); // lpFreq
                break;
            case DecodedEffectType::Overdrive:
                slot.params[0] = reader.ReadF32(); // drive
                break;
            case DecodedEffectType::Chorus:
                slot.params[0] = reader.ReadF32(); // rate
                slot.params[1] = reader.ReadF32(); // depth
                slot.params[2] = reader.ReadF32(); // feedback
                slot.params[3] = reader.ReadF32(); // delay
                break;
            }
        }

        // Skip slots beyond kMaxEffectsPerBus (consume bytes but don't store)
        for (int s = kMaxEffectsPerBus; s < config.slotCount; s++) {
            uint8_t effectType = reader.ReadU8();
            switch (static_cast<DecodedEffectType>(effectType)) {
            case DecodedEffectType::Delay:    reader.ReadF32(); reader.ReadF32(); reader.ReadF32(); break;
            case DecodedEffectType::Reverb:   reader.ReadF32(); reader.ReadF32(); break;
            case DecodedEffectType::Overdrive: reader.ReadF32(); break;
            case DecodedEffectType::Chorus:   reader.ReadF32(); reader.ReadF32(); reader.ReadF32(); reader.ReadF32(); break;
            }
        }

        synth.ConfigureBusFromDecoder(bus, config);
    }
}

// Wire format from encodeTrigger():
//   [track: u8] [hasPatchIndex: u8] [trigType: u8]
//   if hasPatchIndex == 0x01: [patchIndex: u8]
//   if NoteOn: [note: u8] [velocity: u8]

void ProtocolDecoder::DecodeTrigger(Synth& synth, BinaryReader& reader) {
    uint8_t track         = reader.ReadU8();
    uint8_t hasPatchIndex = reader.ReadU8();
    uint8_t trigType      = reader.ReadU8();

    if (hasPatchIndex == 0x01) {
        uint8_t patchIndex = reader.ReadU8();
        synth.onLoadPatch(track, patchIndex);
    }

    switch (trigType) {
    case kTrigNoteOn: {
        uint8_t note = reader.ReadU8();
        uint8_t vel  = reader.ReadU8();
        synth.onNoteOn(track, note, vel);
        break;
    }
    case kTrigNoteOff:
        synth.onNoteOff(track);
        break;
    case kTrigFadeOut:
        synth.onFadeOut(track);
        break;
    default:
        break;
    }
}

} // namespace helm_audio
