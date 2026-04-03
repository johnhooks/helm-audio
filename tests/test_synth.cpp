#include <doctest/doctest.h>
#include "synth.h"

#include <cmath>
#include <stdexcept>
#include <vector>

using namespace helm_audio;

static constexpr float kSampleRate = 48000.0f;
static constexpr size_t kBlockSize = 128;

static float sumAbs(const float* buf, size_t n) {
    float sum = 0.0f;
    for (size_t i = 0; i < n; i++) sum += std::abs(buf[i]);
    return sum;
}

// Helper: build an empty pattern with the given track count.
// Each track has `length` empty steps (no trigs, no locks).
static Pattern makeEmptyPattern(int numTracks, int length = 16) {
    Pattern p;
    p.length = length;
    p.tracks.resize(numTracks);
    for (auto& track : p.tracks) {
        track.steps.resize(length);
    }
    return p;
}

TEST_CASE("Init derives track count from pattern") {
    Pattern pattern = makeEmptyPattern(6);

    Synth synth;
    synth.Init(kSampleRate, &pattern);

    CHECK(synth.GetNumTracks() == 6);
    CHECK(synth.GetTempo() == doctest::Approx(120.0f));
    CHECK_FALSE(synth.IsPlaying());
}

TEST_CASE("SetTempo stores BPM") {
    Pattern pattern = makeEmptyPattern(2);
    Synth synth;
    synth.Init(kSampleRate, &pattern);
    synth.SetTempo(140.0f);
    CHECK(synth.GetTempo() == doctest::Approx(140.0f));
}

TEST_CASE("Process silence with no notes") {
    Pattern pattern = makeEmptyPattern(4);
    Synth synth;
    synth.Init(kSampleRate, &pattern);

    float left[kBlockSize] = {};
    float right[kBlockSize] = {};
    synth.Process(left, right, kBlockSize);

    CHECK(sumAbs(left, kBlockSize) == 0.0f);
    CHECK(sumAbs(right, kBlockSize) == 0.0f);
}

TEST_CASE("NoteOn produces audio via listener interface") {
    Pattern pattern = makeEmptyPattern(4);
    Synth synth;
    synth.Init(kSampleRate, &pattern);

    synth.onNoteOn(0, 60, 100);

    float left[480] = {};
    float right[480] = {};
    synth.Process(left, right, 480);

    CHECK(sumAbs(left, 480) > 0.0f);
    CHECK(sumAbs(right, 480) > 0.0f);
}

TEST_CASE("Sequencer integration — pattern triggers voice") {
    Synth synth;

    Patch patch;
    patch.attack = 0.001f;
    patch.decay = 0.1f;
    patch.sustain = 0.8f;
    patch.release = 0.1f;
    patch.filterFreq = 8000.0f;

    // Build a pattern with a NoteOn + patch load at step 0
    Pattern pattern;
    pattern.length = 16;
    pattern.tracks.resize(2);
    pattern.tracks[0].steps.resize(16);
    pattern.tracks[1].steps.resize(16);

    Step step;
    step.patchIndex = 0;
    step.trig = NoteOn{60, 100};
    pattern.tracks[0].steps[0] = step;

    // Init with the real pattern — sequencer starts here, no swap needed
    synth.Init(kSampleRate, &pattern);
    synth.LoadPatchBank({patch});
    synth.SetTempo(120.0f);
    synth.Play();

    // At 120 BPM, 48kHz: ticksPerSample = 0.001
    // Step 0 fires at tick 0, which is the very first Advance call (~1000 samples in).
    // Process enough for the tick + attack.
    constexpr size_t kSamples = 2048;
    std::vector<float> left(kSamples, 0.0f);
    std::vector<float> right(kSamples, 0.0f);
    synth.Process(left.data(), right.data(), kSamples);

    CHECK(sumAbs(left.data(), kSamples) > 0.0f);
}

TEST_CASE("Effect bus routing") {
    Pattern pattern = makeEmptyPattern(2);
    Synth synth;
    synth.Init(kSampleRate, &pattern);

    OverdriveEffect overdrive;
    overdrive.Init(kSampleRate);
    overdrive.SetDrive(0.5f);
    synth.ConfigureBus(0, 0, &overdrive);

    Patch patch;
    patch.attack = 0.001f;
    patch.sustain = 0.8f;
    patch.release = 0.1f;
    patch.filterFreq = 8000.0f;
    patch.sends[0] = 1.0f;
    synth.LoadPatchBank({patch});

    synth.onLoadPatch(0, 0);
    synth.onNoteOn(0, 60, 127);

    constexpr size_t kSamples = 480;
    float leftWet[kSamples] = {};
    float rightWet[kSamples] = {};
    synth.Process(leftWet, rightWet, kSamples);

    // Compare to a synth with no effect bus
    Pattern pattern2 = makeEmptyPattern(2);
    Synth synthDry;
    synthDry.Init(kSampleRate, &pattern2);
    synthDry.LoadPatchBank({patch});
    synthDry.onLoadPatch(0, 0);
    synthDry.onNoteOn(0, 60, 127);

    float leftDry[kSamples] = {};
    float rightDry[kSamples] = {};
    synthDry.Process(leftDry, rightDry, kSamples);

    float wetSum = sumAbs(leftWet, kSamples);
    float drySum = sumAbs(leftDry, kSamples);
    CHECK(wetSum > 0.0f);
    CHECK(drySum > 0.0f);
    CHECK(wetSum != doctest::Approx(drySum).epsilon(0.001));
}

TEST_CASE("Stop allows release tails") {
    Pattern pattern = makeEmptyPattern(2);
    Synth synth;
    synth.Init(kSampleRate, &pattern);

    Patch patch;
    patch.attack = 0.001f;
    patch.sustain = 0.8f;
    patch.release = 0.5f;
    patch.filterFreq = 8000.0f;
    synth.LoadPatchBank({patch});

    synth.onLoadPatch(0, 0);
    synth.onNoteOn(0, 60, 100);

    // Let the attack develop
    float buf[256] = {};
    float buf2[256] = {};
    synth.Process(buf, buf2, 256);

    // Release the note and stop transport
    synth.onNoteOff(0);
    synth.Stop();

    // The voice should still produce audio during release
    float left[kBlockSize] = {};
    float right[kBlockSize] = {};
    synth.Process(left, right, kBlockSize);

    CHECK(sumAbs(left, kBlockSize) > 0.0f);
}

TEST_CASE("Out-of-range track index throws") {
    Pattern pattern = makeEmptyPattern(2);
    Synth synth;
    synth.Init(kSampleRate, &pattern);

    CHECK_THROWS_AS(synth.onNoteOn(2, 60, 100), std::out_of_range);
    CHECK_THROWS_AS(synth.onNoteOff(2), std::out_of_range);
    CHECK_THROWS_AS(synth.onFadeOut(2), std::out_of_range);
    CHECK_THROWS_AS(synth.onLoadPatch(2, 0), std::out_of_range);
    CHECK_THROWS_AS(synth.onParamLock(2, {ParamId::FilterFreq, 1000.0f}), std::out_of_range);
}

TEST_CASE("Out-of-range patch index throws") {
    Pattern pattern = makeEmptyPattern(2);
    Synth synth;
    synth.Init(kSampleRate, &pattern);

    CHECK_THROWS_AS(synth.onLoadPatch(0, 0), std::out_of_range);

    synth.LoadPatchBank({Patch{}});
    CHECK_THROWS_AS(synth.onLoadPatch(0, 1), std::out_of_range);
    CHECK_NOTHROW(synth.onLoadPatch(0, 0));
}

TEST_CASE("QueuePattern with wrong track count throws") {
    Pattern pattern = makeEmptyPattern(4);
    Synth synth;
    synth.Init(kSampleRate, &pattern);

    Pattern tooMany = makeEmptyPattern(5);
    Pattern tooFew = makeEmptyPattern(3);
    Pattern justRight = makeEmptyPattern(4);

    CHECK_THROWS_AS(synth.QueuePattern(&tooMany), std::invalid_argument);
    CHECK_THROWS_AS(synth.QueuePattern(&tooFew), std::invalid_argument);
    CHECK_NOTHROW(synth.QueuePattern(&justRight));
}

TEST_CASE("GetStep advances during playback") {
    // Build a pattern with a NoteOn at step 0
    Pattern pattern;
    pattern.length = 16;
    pattern.tracks.resize(2);
    pattern.tracks[0].steps.resize(16);
    pattern.tracks[1].steps.resize(16);

    Synth synth;
    synth.Init(kSampleRate, &pattern);
    synth.SetTempo(120.0f);

    CHECK(synth.GetStep() == 0);

    synth.Play();

    // At 120 BPM, 48kHz, 24 PPQ: ticksPerSample = 0.001
    // One tick every 1000 samples. One step = 6 ticks = 6000 samples.
    // Process 7000 samples — should be on step 1.
    std::vector<float> left(7000, 0.0f);
    std::vector<float> right(7000, 0.0f);
    synth.Process(left.data(), right.data(), 7000);

    CHECK(synth.GetStep() == 1);
}

TEST_CASE("GetPatternSwapCount increments on pattern swap") {
    Pattern patternA = makeEmptyPattern(2, 4);  // 4-step pattern
    Synth synth;
    synth.Init(kSampleRate, &patternA);
    synth.SetTempo(120.0f);

    CHECK(synth.GetPatternSwapCount() == 0);

    // Queue a new pattern
    Pattern patternB = makeEmptyPattern(2, 4);
    synth.QueuePattern(&patternB);

    synth.Play();

    // Process enough samples to complete one loop of the 4-step pattern.
    // 4 steps × 6 ticks × 1000 samples/tick = 24000 samples.
    // Add margin to ensure the boundary is crossed.
    std::vector<float> left(26000, 0.0f);
    std::vector<float> right(26000, 0.0f);
    synth.Process(left.data(), right.data(), 26000);

    CHECK(synth.GetPatternSwapCount() == 1);
}

TEST_CASE("GetPatternSwapCount does not increment on normal loop") {
    Pattern pattern = makeEmptyPattern(2, 4);  // 4-step pattern
    Synth synth;
    synth.Init(kSampleRate, &pattern);
    synth.SetTempo(120.0f);
    synth.Play();

    // Process enough for two full loops (no pending pattern)
    std::vector<float> left(50000, 0.0f);
    std::vector<float> right(50000, 0.0f);
    synth.Process(left.data(), right.data(), 50000);

    CHECK(synth.GetPatternSwapCount() == 0);
}

TEST_CASE("Out-of-range bus index throws") {
    Pattern pattern = makeEmptyPattern(2);
    Synth synth;
    synth.Init(kSampleRate, &pattern);

    OverdriveEffect od;
    od.Init(kSampleRate);
    CHECK_THROWS_AS(synth.ConfigureBus(-1, 0, &od), std::out_of_range);
    CHECK_THROWS_AS(synth.ConfigureBus(4, 0, &od), std::out_of_range);
    CHECK_NOTHROW(synth.ConfigureBus(0, 0, &od));
}
