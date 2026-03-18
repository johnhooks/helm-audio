#include <doctest/doctest.h>
#include "modulation.h"

#include <cmath>

using namespace helm_audio;

static constexpr float kSampleRate = 48000.0f;

TEST_CASE("VoiceModState resolves base values with no modulation") {
    VoiceModState mod;
    mod.Init(kSampleRate);

    Patch patch;
    patch.filterFreq = 2000.0f;
    patch.index = 3.0f;
    mod.LoadPatch(patch);

    mod.Tick();

    CHECK(mod.GetResolved(ParamId::FilterFreq) == doctest::Approx(2000.0f));
    CHECK(mod.GetResolved(ParamId::Index) == doctest::Approx(3.0f));
}

TEST_CASE("LFO routed to FilterFreq oscillates around base") {
    VoiceModState mod;
    mod.Init(kSampleRate);

    Patch patch;
    patch.filterFreq = 2000.0f;
    patch.lfos[0].rate = 10.0f; // 10 Hz — fast enough to see oscillation quickly
    patch.lfos[0].waveform = LfoWaveform::Sine;
    patch.lfoRoutings[0].routeCount = 1;
    patch.lfoRoutings[0].routes[0] = {ParamId::FilterFreq, 500.0f};
    mod.LoadPatch(patch);

    float minVal = 100000.0f;
    float maxVal = -100000.0f;

    // Run for one full LFO cycle (48000 / 10 = 4800 samples)
    for (int i = 0; i < 4800; ++i) {
        mod.Tick();
        float val = mod.GetResolved(ParamId::FilterFreq);
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
    }

    // Should oscillate: max above base, min below base
    CHECK(maxVal > 2000.0f);
    CHECK(minVal < 2000.0f);
    // Depth is 500, so range should be roughly base ± 500
    CHECK(maxVal == doctest::Approx(2500.0f).epsilon(0.05));
    CHECK(minVal == doctest::Approx(1500.0f).epsilon(0.05));
}

TEST_CASE("SetBase shifts the modulation center") {
    VoiceModState mod;
    mod.Init(kSampleRate);

    Patch patch;
    patch.filterFreq = 1000.0f;
    patch.lfos[0].rate = 10.0f;
    patch.lfos[0].waveform = LfoWaveform::Sine;
    patch.lfoRoutings[0].routeCount = 1;
    patch.lfoRoutings[0].routes[0] = {ParamId::FilterFreq, 200.0f};
    mod.LoadPatch(patch);

    // Run a few samples at base 1000
    for (int i = 0; i < 100; ++i) mod.Tick();

    // Shift base to 3000
    mod.SetBase(ParamId::FilterFreq, 3000.0f);

    float minVal = 100000.0f;
    float maxVal = -100000.0f;
    for (int i = 0; i < 4800; ++i) {
        mod.Tick();
        float val = mod.GetResolved(ParamId::FilterFreq);
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
    }

    // Should oscillate around 3000 now
    CHECK(maxVal > 3000.0f);
    CHECK(minVal < 3000.0f);
    CHECK(maxVal == doctest::Approx(3200.0f).epsilon(0.05));
    CHECK(minVal == doctest::Approx(2800.0f).epsilon(0.05));
}

TEST_CASE("Depth 0 produces no modulation") {
    VoiceModState mod;
    mod.Init(kSampleRate);

    Patch patch;
    patch.index = 5.0f;
    patch.lfos[0].rate = 10.0f;
    patch.lfoRoutings[0].routeCount = 1;
    patch.lfoRoutings[0].routes[0] = {ParamId::Index, 0.0f}; // zero depth
    mod.LoadPatch(patch);

    for (int i = 0; i < 4800; ++i) {
        mod.Tick();
        CHECK(mod.GetResolved(ParamId::Index) == doctest::Approx(5.0f));
    }
}

TEST_CASE("LFO phase persists across LoadPatch") {
    VoiceModState mod;
    mod.Init(kSampleRate);

    Patch patch;
    patch.filterFreq = 1000.0f;
    patch.lfos[0].rate = 1.0f;
    patch.lfos[0].waveform = LfoWaveform::Sine;
    patch.lfoRoutings[0].routeCount = 1;
    patch.lfoRoutings[0].routes[0] = {ParamId::FilterFreq, 500.0f};
    mod.LoadPatch(patch);

    // Advance LFO partway through its cycle (quarter cycle at 1Hz = 12000 samples)
    for (int i = 0; i < 12000; ++i) mod.Tick();

    float beforeReload = mod.GetResolved(ParamId::FilterFreq);

    // Reload the same patch — LFO phase should NOT reset
    mod.LoadPatch(patch);
    mod.Tick();
    float afterReload = mod.GetResolved(ParamId::FilterFreq);

    // Values should be close (continuous phase), not jump back to start
    CHECK(afterReload == doctest::Approx(beforeReload).epsilon(0.01));
}

TEST_CASE("FilterFreq clamped above 20 Hz") {
    VoiceModState mod;
    mod.Init(kSampleRate);

    Patch patch;
    patch.filterFreq = 30.0f;
    patch.lfos[0].rate = 10.0f;
    patch.lfos[0].waveform = LfoWaveform::Sine;
    patch.lfoRoutings[0].routeCount = 1;
    patch.lfoRoutings[0].routes[0] = {ParamId::FilterFreq, 50.0f};
    mod.LoadPatch(patch);

    for (int i = 0; i < 4800; ++i) {
        mod.Tick();
        CHECK(mod.GetResolved(ParamId::FilterFreq) >= 20.0f);
    }
}

TEST_CASE("Send values clamped to 0-1") {
    VoiceModState mod;
    mod.Init(kSampleRate);

    Patch patch;
    patch.sends[0] = 0.5f;
    patch.lfos[0].rate = 10.0f;
    patch.lfoRoutings[0].routeCount = 1;
    patch.lfoRoutings[0].routes[0] = {ParamId::Send0, 2.0f}; // large depth
    mod.LoadPatch(patch);

    for (int i = 0; i < 4800; ++i) {
        mod.Tick();
        float val = mod.GetResolved(ParamId::Send0);
        CHECK(val >= 0.0f);
        CHECK(val <= 1.0f);
    }
}
