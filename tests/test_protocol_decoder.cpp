#include <doctest/doctest.h>
#include "binary_reader.h"
#include "protocol_decoder.h"
#include "synth.h"

#include <cmath>
#include <cstring>
#include <vector>

using namespace helm_audio;

// --- Test buffer helpers ---
// Mirror the JS encoder's write functions for building test buffers.

static void writeU8(std::vector<uint8_t>& buf, uint8_t v) {
    buf.push_back(v);
}

static void writeI8(std::vector<uint8_t>& buf, int8_t v) {
    buf.push_back(static_cast<uint8_t>(v));
}

static void writeF32(std::vector<uint8_t>& buf, float v) {
    uint8_t bytes[4];
    std::memcpy(bytes, &v, 4);
    buf.insert(buf.end(), bytes, bytes + 4);
}

static constexpr float kSampleRate = 48000.0f;
static constexpr size_t kBlockSize = 128;

static float sumAbs(const float* buf, size_t n) {
    float sum = 0.0f;
    for (size_t i = 0; i < n; i++) sum += std::abs(buf[i]);
    return sum;
}

// Helper: build an empty pattern with the given track count.
static Pattern makeEmptyPattern(int numTracks, int length = 16) {
    Pattern p;
    p.length = length;
    p.tracks.resize(numTracks);
    for (auto& track : p.tracks) {
        track.steps.resize(length);
    }
    return p;
}

// Write an operator to a buffer (matches writeOperator in encode.ts)
static void writeOperator(std::vector<uint8_t>& buf, const OperatorPatch& op) {
    writeF32(buf, op.ratio);
    writeF32(buf, op.detune);
    writeF32(buf, op.level);
    writeF32(buf, op.feedback);
    writeF32(buf, op.attack);
    writeF32(buf, op.decay);
    writeF32(buf, op.sustain);
    writeF32(buf, op.release);
}

// Write an LFO config to a buffer (matches writeLfo in encode.ts)
static void writeLfo(std::vector<uint8_t>& buf, const LfoConfig& config,
                     const LfoRouting& routing) {
    writeF32(buf, config.rate);
    writeU8(buf, static_cast<uint8_t>(config.waveform));
    writeU8(buf, static_cast<uint8_t>(routing.routeCount));
    for (int r = 0; r < routing.routeCount; r++) {
        writeU8(buf, static_cast<uint8_t>(routing.routes[r].target));
        writeF32(buf, routing.routes[r].depth);
    }
}

// Write a full patch to a buffer (matches encodePatchBank per-patch layout)
static void writePatch(std::vector<uint8_t>& buf, const Patch& p) {
    writeOperator(buf, p.ops[0]);
    writeOperator(buf, p.ops[1]);
    writeF32(buf, p.index);
    writeF32(buf, p.filterFreq);
    writeF32(buf, p.filterRes);
    writeF32(buf, p.sends[0]);
    writeF32(buf, p.sends[1]);
    writeF32(buf, p.sends[2]);
    writeF32(buf, p.sends[3]);
    // Amplitude envelope before LFOs
    writeF32(buf, p.attack);
    writeF32(buf, p.decay);
    writeF32(buf, p.sustain);
    writeF32(buf, p.release);
    writeLfo(buf, p.lfos[0], p.lfoRoutings[0]);
    writeLfo(buf, p.lfos[1], p.lfoRoutings[1]);
}

// ============================================================================
// BinaryReader
// ============================================================================

TEST_CASE("BinaryReader reads u8, i8, f32") {
    std::vector<uint8_t> buf;
    writeU8(buf, 0x42);
    writeI8(buf, -3);
    writeF32(buf, 3.14f);

    BinaryReader reader(buf.data(), buf.size());
    CHECK(reader.ReadU8() == 0x42);
    CHECK(reader.ReadI8() == -3);
    CHECK(reader.ReadF32() == doctest::Approx(3.14f));
    CHECK_FALSE(reader.HasRemaining(1));
}

TEST_CASE("BinaryReader returns zero on overrun") {
    uint8_t data[] = {0xFF};
    BinaryReader reader(data, 1);
    CHECK(reader.ReadU8() == 0xFF);
    CHECK(reader.ReadU8() == 0);   // overrun
    CHECK(reader.ReadF32() == 0.0f); // overrun
}

TEST_CASE("BinaryReader HasRemaining") {
    uint8_t data[4] = {};
    BinaryReader reader(data, 4);
    CHECK(reader.HasRemaining(4));
    CHECK_FALSE(reader.HasRemaining(5));
    reader.ReadU8();
    CHECK(reader.HasRemaining(3));
    CHECK_FALSE(reader.HasRemaining(4));
}

// ============================================================================
// Transport
// ============================================================================

TEST_CASE("Decode Transport — Play") {
    Pattern pattern = makeEmptyPattern(2);
    Synth synth;
    synth.Init(kSampleRate, &pattern);

    std::vector<uint8_t> buf;
    writeU8(buf, 0x04); // Transport
    writeU8(buf, 0x01); // Play

    ProtocolDecoder decoder;
    decoder.Decode(synth, buf.data(), buf.size());
    CHECK(synth.IsPlaying());
}

TEST_CASE("Decode Transport — Stop") {
    Pattern pattern = makeEmptyPattern(2);
    Synth synth;
    synth.Init(kSampleRate, &pattern);
    synth.Play();

    std::vector<uint8_t> buf;
    writeU8(buf, 0x04); // Transport
    writeU8(buf, 0x00); // Stop

    ProtocolDecoder decoder;
    decoder.Decode(synth, buf.data(), buf.size());
    CHECK_FALSE(synth.IsPlaying());
}

TEST_CASE("Decode Transport — Restart resets sequencer and plays") {
    Pattern pattern = makeEmptyPattern(2);
    Synth synth;
    synth.Init(kSampleRate, &pattern);
    synth.Play();
    synth.SetTempo(240.0f);

    // Advance the sequencer a bit
    float left[2048] = {};
    float right[2048] = {};
    synth.Process(left, right, 2048);

    std::vector<uint8_t> buf;
    writeU8(buf, 0x04); // Transport
    writeU8(buf, 0x02); // Restart

    ProtocolDecoder decoder;
    decoder.Decode(synth, buf.data(), buf.size());
    CHECK(synth.IsPlaying());
}

// ============================================================================
// Tempo
// ============================================================================

TEST_CASE("Decode Tempo") {
    Pattern pattern = makeEmptyPattern(2);
    Synth synth;
    synth.Init(kSampleRate, &pattern);

    std::vector<uint8_t> buf;
    writeU8(buf, 0x05); // Tempo
    writeF32(buf, 140.0f);

    ProtocolDecoder decoder;
    decoder.Decode(synth, buf.data(), buf.size());
    CHECK(synth.GetTempo() == doctest::Approx(140.0f));
}

// ============================================================================
// PatchBank
// ============================================================================

TEST_CASE("Decode PatchBank — single default patch") {
    Pattern pattern = makeEmptyPattern(2);
    Synth synth;
    synth.Init(kSampleRate, &pattern);

    Patch src;
    std::vector<uint8_t> buf;
    writeU8(buf, 0x01); // PatchBank
    writeU8(buf, 1);    // patchCount
    writePatch(buf, src);

    ProtocolDecoder decoder;
    decoder.Decode(synth, buf.data(), buf.size());

    // Verify: load the patch onto a voice and trigger it
    synth.onLoadPatch(0, 0);
    synth.onNoteOn(0, 60, 100);

    float left[480] = {};
    float right[480] = {};
    synth.Process(left, right, 480);
    CHECK(sumAbs(left, 480) > 0.0f);
}

TEST_CASE("Decode PatchBank — two patches with custom values") {
    Pattern pattern = makeEmptyPattern(2);
    Synth synth;
    synth.Init(kSampleRate, &pattern);

    Patch p0;
    p0.ops[0].ratio = 1.0f;
    p0.ops[1].ratio = 2.0f;
    p0.ops[1].level = 0.8f;
    p0.index = 2.5f;
    p0.filterFreq = 4000.0f;
    p0.filterRes = 0.3f;
    p0.sends[0] = 0.5f;
    p0.attack = 0.01f;
    p0.decay = 0.2f;
    p0.sustain = 0.7f;
    p0.release = 0.4f;

    Patch p1;
    p1.ops[0].ratio = 3.0f;
    p1.ops[0].feedback = 0.2f;
    p1.ops[1].ratio = 1.41f;
    p1.index = 5.0f;
    p1.filterFreq = 2000.0f;
    p1.attack = 0.05f;
    p1.decay = 0.5f;
    p1.sustain = 0.3f;
    p1.release = 1.0f;
    p1.lfos[0].rate = 4.0f;
    p1.lfos[0].waveform = LfoWaveform::Triangle;
    p1.lfoRoutings[0].routeCount = 1;
    p1.lfoRoutings[0].routes[0] = {ParamId::FilterFreq, 2000.0f};

    std::vector<uint8_t> buf;
    writeU8(buf, 0x01); // PatchBank
    writeU8(buf, 2);    // patchCount
    writePatch(buf, p0);
    writePatch(buf, p1);

    ProtocolDecoder decoder;
    decoder.Decode(synth, buf.data(), buf.size());

    // Both patches should be loadable without throwing
    CHECK_NOTHROW(synth.onLoadPatch(0, 0));
    CHECK_NOTHROW(synth.onLoadPatch(1, 1));

    // Trigger patch 0 on track 0 and patch 1 on track 1 — both should produce audio
    synth.onNoteOn(0, 60, 100);
    synth.onNoteOn(1, 48, 100);

    float left[480] = {};
    float right[480] = {};
    synth.Process(left, right, 480);
    CHECK(sumAbs(left, 480) > 0.0f);
}

// ============================================================================
// Pattern
// ============================================================================

// Step flags (must match encode.ts)
static constexpr uint8_t HAS_TRIG       = 0x01;
static constexpr uint8_t HAS_LOCKS      = 0x02;
static constexpr uint8_t HAS_PATCH_INDEX = 0x04;
static constexpr uint8_t ONESHOT        = 0x08;

TEST_CASE("Decode Pattern — single track, NoteOn at step 0") {
    // First init with a placeholder pattern
    Pattern placeholder = makeEmptyPattern(1);
    Synth synth;
    synth.Init(kSampleRate, &placeholder);
    synth.LoadPatchBank({Patch{}});

    std::vector<uint8_t> buf;
    writeU8(buf, 0x02); // Pattern
    writeU8(buf, 1);    // trackCount
    writeU8(buf, 16);   // length

    // Track 0: 16 steps, 1 event
    writeU8(buf, 16);   // stepCount
    writeU8(buf, 1);    // eventCount

    // Event at step 0: NoteOn C-4 with patch 0
    writeU8(buf, 0);                              // stepIndex
    writeU8(buf, HAS_TRIG | HAS_PATCH_INDEX);     // flags
    writeI8(buf, 0);                               // microTiming
    writeU8(buf, 0);                               // patchIndex
    writeU8(buf, 1);                               // trigType: NoteOn
    writeU8(buf, 60);                              // note
    writeU8(buf, 100);                             // velocity

    ProtocolDecoder decoder;
    decoder.Decode(synth, buf.data(), buf.size());

    // Play — the pattern should trigger the note
    synth.SetTempo(120.0f);
    synth.Play();

    std::vector<float> left(2048, 0.0f);
    std::vector<float> right(2048, 0.0f);
    synth.Process(left.data(), right.data(), 2048);

    CHECK(sumAbs(left.data(), 2048) > 0.0f);
}

TEST_CASE("Decode Pattern — all step features") {
    Pattern placeholder = makeEmptyPattern(2);
    Synth synth;
    synth.Init(kSampleRate, &placeholder);
    synth.LoadPatchBank({Patch{}, Patch{}});

    std::vector<uint8_t> buf;
    writeU8(buf, 0x02); // Pattern
    writeU8(buf, 2);    // trackCount
    writeU8(buf, 8);    // length

    // Track 0: 8 steps, 3 events
    writeU8(buf, 8);    // stepCount
    writeU8(buf, 3);    // eventCount

    // Event 0: NoteOn + patch + locks + oneshot + micro-timing
    writeU8(buf, 0);    // stepIndex
    writeU8(buf, HAS_TRIG | HAS_LOCKS | HAS_PATCH_INDEX | ONESHOT); // flags
    writeI8(buf, 3);    // microTiming: +3 ticks
    writeU8(buf, 0);    // patchIndex
    writeU8(buf, 1);    // NoteOn
    writeU8(buf, 60);   // note
    writeU8(buf, 127);  // velocity
    writeU8(buf, 1);    // lockCount
    writeU8(buf, 0);    // ParamId::FilterFreq
    writeF32(buf, 2000.0f);

    // Event 1: NoteOff at step 4
    writeU8(buf, 4);    // stepIndex
    writeU8(buf, HAS_TRIG); // flags
    writeI8(buf, 0);    // microTiming
    writeU8(buf, 2);    // NoteOff

    // Event 2: FadeOut at step 6 with negative micro-timing
    writeU8(buf, 6);    // stepIndex
    writeU8(buf, HAS_TRIG); // flags
    writeI8(buf, -2);   // microTiming: -2 ticks
    writeU8(buf, 3);    // FadeOut

    // Track 1: 8 steps, 0 events (empty)
    writeU8(buf, 8);    // stepCount
    writeU8(buf, 0);    // eventCount

    ProtocolDecoder decoder;
    decoder.Decode(synth, buf.data(), buf.size());

    // Verify: play the pattern and check audio is produced
    synth.SetTempo(120.0f);
    synth.Play();

    std::vector<float> left(4096, 0.0f);
    std::vector<float> right(4096, 0.0f);
    synth.Process(left.data(), right.data(), 4096);

    CHECK(sumAbs(left.data(), 4096) > 0.0f);
}

TEST_CASE("Decode Pattern — resizes track count") {
    // Start with 4 tracks
    Pattern placeholder = makeEmptyPattern(4);
    Synth synth;
    synth.Init(kSampleRate, &placeholder);
    CHECK(synth.GetNumTracks() == 4);

    // Load a pattern with 2 tracks via protocol
    std::vector<uint8_t> buf;
    writeU8(buf, 0x02); // Pattern
    writeU8(buf, 2);    // trackCount
    writeU8(buf, 8);    // length

    // Track 0: 8 empty steps
    writeU8(buf, 8);
    writeU8(buf, 0);
    // Track 1: 8 empty steps
    writeU8(buf, 8);
    writeU8(buf, 0);

    ProtocolDecoder decoder;
    decoder.Decode(synth, buf.data(), buf.size());

    CHECK(synth.GetNumTracks() == 2);
}

// ============================================================================
// BusConfig
// ============================================================================

TEST_CASE("Decode BusConfig — overdrive on bus 0") {
    Pattern pattern = makeEmptyPattern(2);
    Synth synth;
    synth.Init(kSampleRate, &pattern);

    Patch patch;
    patch.attack = 0.001f;
    patch.sustain = 0.8f;
    patch.release = 0.1f;
    patch.filterFreq = 8000.0f;
    patch.sends[0] = 1.0f;
    synth.LoadPatchBank({patch});

    std::vector<uint8_t> buf;
    writeU8(buf, 0x03); // BusConfig

    // Bus 0: 1 slot — overdrive
    writeU8(buf, 1);    // slotCount
    writeU8(buf, 2);    // EffectType::Overdrive
    writeF32(buf, 0.7f); // drive

    // Bus 1-3: empty
    writeU8(buf, 0);
    writeU8(buf, 0);
    writeU8(buf, 0);

    ProtocolDecoder decoder;
    decoder.Decode(synth, buf.data(), buf.size());

    // Trigger a note with send to bus 0 and verify the effect colors the output
    synth.onLoadPatch(0, 0);
    synth.onNoteOn(0, 60, 127);

    float left[480] = {};
    float right[480] = {};
    synth.Process(left, right, 480);

    // Compare to no-effect baseline
    Pattern pattern2 = makeEmptyPattern(2);
    Synth synthDry;
    synthDry.Init(kSampleRate, &pattern2);
    synthDry.LoadPatchBank({patch});
    synthDry.onLoadPatch(0, 0);
    synthDry.onNoteOn(0, 60, 127);

    float leftDry[480] = {};
    float rightDry[480] = {};
    synthDry.Process(leftDry, rightDry, 480);

    float wetSum = sumAbs(left, 480);
    float drySum = sumAbs(leftDry, 480);
    CHECK(wetSum > 0.0f);
    CHECK(drySum > 0.0f);
    CHECK(wetSum != doctest::Approx(drySum).epsilon(0.001));
}

TEST_CASE("Decode BusConfig — all effect types") {
    Pattern pattern = makeEmptyPattern(2);
    Synth synth;
    synth.Init(kSampleRate, &pattern);

    std::vector<uint8_t> buf;
    writeU8(buf, 0x03); // BusConfig

    // Bus 0: delay
    writeU8(buf, 1);
    writeU8(buf, 0);     // Delay
    writeF32(buf, 0.3f); // time
    writeF32(buf, 0.4f); // feedback
    writeF32(buf, 0.5f); // mix

    // Bus 1: reverb
    writeU8(buf, 1);
    writeU8(buf, 1);       // Reverb
    writeF32(buf, 0.85f);  // feedback
    writeF32(buf, 10000.0f); // lpFreq

    // Bus 2: overdrive
    writeU8(buf, 1);
    writeU8(buf, 2);     // Overdrive
    writeF32(buf, 0.5f); // drive

    // Bus 3: chorus
    writeU8(buf, 1);
    writeU8(buf, 3);     // Chorus
    writeF32(buf, 0.8f); // rate
    writeF32(buf, 0.5f); // depth
    writeF32(buf, 0.2f); // feedback
    writeF32(buf, 0.5f); // delay

    ProtocolDecoder decoder;
    decoder.Decode(synth, buf.data(), buf.size());

    // Verify all buses are active by triggering a note with sends
    Patch patch;
    patch.attack = 0.001f;
    patch.sustain = 0.8f;
    patch.filterFreq = 8000.0f;
    patch.sends[0] = 0.5f;
    patch.sends[1] = 0.5f;
    patch.sends[2] = 0.5f;
    patch.sends[3] = 0.5f;
    synth.LoadPatchBank({patch});
    synth.onLoadPatch(0, 0);
    synth.onNoteOn(0, 60, 100);

    float left[480] = {};
    float right[480] = {};
    synth.Process(left, right, 480);
    CHECK(sumAbs(left, 480) > 0.0f);
}

// ============================================================================
// Trigger (immediate)
// ============================================================================

TEST_CASE("Decode Trigger — NoteOn with patch") {
    Pattern pattern = makeEmptyPattern(2);
    Synth synth;
    synth.Init(kSampleRate, &pattern);
    synth.LoadPatchBank({Patch{}});

    std::vector<uint8_t> buf;
    writeU8(buf, 0x06); // Trigger
    writeU8(buf, 0);    // track
    writeU8(buf, 0x01); // hasPatchIndex
    writeU8(buf, 1);    // trigType: NoteOn
    writeU8(buf, 0);    // patchIndex
    writeU8(buf, 60);   // note
    writeU8(buf, 100);  // velocity

    ProtocolDecoder decoder;
    decoder.Decode(synth, buf.data(), buf.size());

    float left[480] = {};
    float right[480] = {};
    synth.Process(left, right, 480);
    CHECK(sumAbs(left, 480) > 0.0f);
}

TEST_CASE("Decode Trigger — NoteOff") {
    Pattern pattern = makeEmptyPattern(2);
    Synth synth;
    synth.Init(kSampleRate, &pattern);
    synth.LoadPatchBank({Patch{}});
    synth.onLoadPatch(0, 0);
    synth.onNoteOn(0, 60, 100);

    // Let the note develop
    float buf[256] = {};
    float buf2[256] = {};
    synth.Process(buf, buf2, 256);

    // Send NoteOff trigger
    std::vector<uint8_t> msg;
    writeU8(msg, 0x06); // Trigger
    writeU8(msg, 0);    // track
    writeU8(msg, 0x00); // no patchIndex
    writeU8(msg, 2);    // NoteOff

    ProtocolDecoder decoder;
    decoder.Decode(synth, msg.data(), msg.size());

    // After release tail dies, should be silent.
    // Default release is 0.3s = ~14400 samples. Process well beyond that.
    float left[96000] = {};
    float right[96000] = {};
    synth.Process(left, right, 96000);

    // Last samples should be silent (release tail ended)
    float tailSum = sumAbs(left + 95000, 1000);
    CHECK(tailSum == doctest::Approx(0.0f).epsilon(0.0001));
}

TEST_CASE("Decode Trigger — FadeOut") {
    Pattern pattern = makeEmptyPattern(2);
    Synth synth;
    synth.Init(kSampleRate, &pattern);
    synth.LoadPatchBank({Patch{}});
    synth.onLoadPatch(0, 0);
    synth.onNoteOn(0, 60, 100);

    float buf[256] = {};
    float buf2[256] = {};
    synth.Process(buf, buf2, 256);

    std::vector<uint8_t> msg;
    writeU8(msg, 0x06); // Trigger
    writeU8(msg, 0);    // track
    writeU8(msg, 0x00); // no patchIndex
    writeU8(msg, 3);    // FadeOut

    ProtocolDecoder decoder;
    decoder.Decode(synth, msg.data(), msg.size());

    // FadeOut is 50ms (~2400 samples at 48kHz). Process well beyond that.
    float left[12000] = {};
    float right[12000] = {};
    synth.Process(left, right, 12000);

    float tailSum = sumAbs(left + 11000, 1000);
    CHECK(tailSum == doctest::Approx(0.0f).epsilon(0.0001));
}

// ============================================================================
// Empty / unknown messages
// ============================================================================

TEST_CASE("Decode empty buffer does nothing") {
    Pattern pattern = makeEmptyPattern(2);
    Synth synth;
    synth.Init(kSampleRate, &pattern);

    ProtocolDecoder decoder;
    decoder.Decode(synth, nullptr, 0);
    // No crash, no state change
    CHECK(synth.GetTempo() == doctest::Approx(120.0f));
}

TEST_CASE("Decode unknown message type does nothing") {
    Pattern pattern = makeEmptyPattern(2);
    Synth synth;
    synth.Init(kSampleRate, &pattern);

    std::vector<uint8_t> buf;
    writeU8(buf, 0xFF); // unknown type
    writeU8(buf, 0x42); // garbage

    ProtocolDecoder decoder;
    decoder.Decode(synth, buf.data(), buf.size());
    CHECK(synth.GetTempo() == doctest::Approx(120.0f));
}

// ============================================================================
// Integration — full sequence via protocol
// ============================================================================

TEST_CASE("Full integration — patch bank + pattern via protocol") {
    // Build a synth with a placeholder
    Pattern placeholder = makeEmptyPattern(2);
    Synth synth;
    synth.Init(kSampleRate, &placeholder);
    ProtocolDecoder decoder;

    // 1. Send patch bank
    Patch kick;
    kick.ops[0].ratio = 1.0f;
    kick.ops[1].ratio = 2.0f;
    kick.ops[1].level = 0.5f;
    kick.index = 3.0f;
    kick.filterFreq = 4000.0f;
    kick.attack = 0.001f;
    kick.decay = 0.15f;
    kick.sustain = 0.0f;
    kick.release = 0.1f;

    std::vector<uint8_t> patchBuf;
    writeU8(patchBuf, 0x01);
    writeU8(patchBuf, 1);
    writePatch(patchBuf, kick);
    decoder.Decode(synth, patchBuf.data(), patchBuf.size());

    // 2. Send pattern: NoteOn at step 0, NoteOff at step 2
    std::vector<uint8_t> patBuf;
    writeU8(patBuf, 0x02); // Pattern
    writeU8(patBuf, 2);    // trackCount
    writeU8(patBuf, 16);   // length

    // Track 0: 16 steps, 2 events
    writeU8(patBuf, 16);
    writeU8(patBuf, 2);
    // Event 0: NoteOn + patch at step 0
    writeU8(patBuf, 0);
    writeU8(patBuf, HAS_TRIG | HAS_PATCH_INDEX);
    writeI8(patBuf, 0);
    writeU8(patBuf, 0);  // patchIndex
    writeU8(patBuf, 1);  // NoteOn
    writeU8(patBuf, 36); // note (C-2)
    writeU8(patBuf, 127);
    // Event 1: NoteOff at step 2
    writeU8(patBuf, 2);
    writeU8(patBuf, HAS_TRIG);
    writeI8(patBuf, 0);
    writeU8(patBuf, 2);  // NoteOff

    // Track 1: 16 steps, 0 events
    writeU8(patBuf, 16);
    writeU8(patBuf, 0);

    decoder.Decode(synth, patBuf.data(), patBuf.size());

    // 3. Send tempo
    std::vector<uint8_t> tempoBuf;
    writeU8(tempoBuf, 0x05);
    writeF32(tempoBuf, 120.0f);
    decoder.Decode(synth, tempoBuf.data(), tempoBuf.size());

    // 4. Send play
    std::vector<uint8_t> playBuf;
    writeU8(playBuf, 0x04);
    writeU8(playBuf, 0x01);
    decoder.Decode(synth, playBuf.data(), playBuf.size());

    CHECK(synth.IsPlaying());

    // 5. Render audio — should hear the kick
    std::vector<float> left(4096, 0.0f);
    std::vector<float> right(4096, 0.0f);
    synth.Process(left.data(), right.data(), 4096);

    CHECK(sumAbs(left.data(), 4096) > 0.0f);
}
