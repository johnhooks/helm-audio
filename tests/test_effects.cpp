#include <doctest/doctest.h>
#include "effect.h"
#include "effect_bus.h"

#include <cmath>

using namespace helm_audio;

static constexpr float kSampleRate = 48000.0f;

TEST_CASE("Inactive bus produces silence") {
    EffectBus bus;
    // No effects configured — slotCount is 0
    bus.Accumulate(0.5f);
    StereoSample out = bus.Process();
    CHECK(out.left == 0.0f);
    CHECK(out.right == 0.0f);
}

TEST_CASE("OverdriveEffect produces distorted output") {
    OverdriveEffect od;
    od.Init(kSampleRate);
    od.SetDrive(0.8f);

    // Process a moderate signal — overdrive should increase peak amplitude
    float inputLevel = 0.3f;
    StereoSample out = od.Process({inputLevel, inputLevel});

    // Overdrive output should differ from input (nonlinear)
    CHECK(out.left == out.right); // same input → same output per channel
    CHECK(out.left != doctest::Approx(inputLevel).epsilon(0.01));
}

TEST_CASE("DelayEffect produces delayed repeats") {
    DelayEffect delay;
    delay.Init(kSampleRate);
    delay.SetTime(0.01f); // 10ms = 480 samples at 48kHz (left = 360, right = 480)
    delay.SetFeedback(0.5f);
    delay.SetMix(1.0f);

    // Feed an impulse
    delay.Process({1.0f, 1.0f});

    // Process silence until we expect the left delay tap (360 samples)
    StereoSample silence = {0.0f, 0.0f};
    StereoSample out = silence;
    for (int i = 1; i < 360; i++) {
        out = delay.Process(silence);
    }

    // At sample 360, left channel should have the delayed repeat
    out = delay.Process(silence);
    CHECK(out.left != doctest::Approx(0.0f).epsilon(0.001));
}

TEST_CASE("ReverbEffect produces a tail after input stops") {
    ReverbEffect reverb;
    reverb.Init(kSampleRate);
    reverb.SetFeedback(0.8f);

    // Feed signal for a short burst
    for (int i = 0; i < 480; i++) {
        float s = 0.5f * sinf(static_cast<float>(i) * 0.1f);
        reverb.Process({s, s});
    }

    // Process silence — reverb tail should persist
    StereoSample silence = {0.0f, 0.0f};
    float tailEnergy = 0.0f;
    for (int i = 0; i < 4800; i++) {
        StereoSample out = reverb.Process(silence);
        tailEnergy += out.left * out.left + out.right * out.right;
    }

    CHECK(tailEnergy > 0.01f);
}

TEST_CASE("ChorusEffect produces stereo width") {
    ChorusEffect chorus;
    chorus.Init(kSampleRate);
    chorus.SetRate(2.0f);
    chorus.SetDepth(1.0f);
    chorus.SetDelay(0.7f);

    // Process enough samples for the two chorus engines' LFOs to diverge
    bool foundDifference = false;
    for (int i = 0; i < 48000; i++) {
        // Use a signal with harmonic content so modulated delay produces variation
        float in = sinf(static_cast<float>(i) * 440.0f * 6.2831853f / kSampleRate);
        StereoSample out = chorus.Process({in, in});
        if (std::abs(out.left - out.right) > 0.001f) {
            foundDifference = true;
            break;
        }
    }

    CHECK(foundDifference);
}

TEST_CASE("Effect chain: overdrive into delay") {
    OverdriveEffect od;
    od.Init(kSampleRate);
    od.SetDrive(0.7f);

    DelayEffect delay;
    delay.Init(kSampleRate);
    delay.SetTime(0.01f);
    delay.SetFeedback(0.5f);
    delay.SetMix(1.0f);

    EffectBus bus;
    bus.SetSlot(0, &od);
    bus.SetSlot(1, &delay);

    // Feed an impulse through the chain
    bus.Accumulate(0.5f);
    bus.Process();

    // Process silence — the delayed overdrive output should appear
    for (int i = 0; i < 359; i++) {
        bus.Accumulate(0.0f);
        bus.Process();
    }

    bus.Accumulate(0.0f);
    StereoSample out = bus.Process();
    CHECK(out.left != doctest::Approx(0.0f).epsilon(0.001));
}

TEST_CASE("Multiple voices accumulate into one bus") {
    OverdriveEffect od;
    od.Init(kSampleRate);
    od.SetDrive(0.3f); // low distortion — near pass-through

    EffectBus bus;
    bus.SetSlot(0, &od);

    // Accumulate from two "voices"
    bus.Accumulate(0.3f);
    bus.Accumulate(0.2f);

    StereoSample out = bus.Process();

    // Output should reflect the sum of both inputs
    CHECK(out.left != doctest::Approx(0.0f).epsilon(0.01));
    CHECK(out.left == out.right);
}

TEST_CASE("Send level 0 contributes nothing") {
    EffectBusPool pool;
    pool.Init(kSampleRate);

    OverdriveEffect od;
    od.Init(kSampleRate);
    pool.GetBus(0).SetSlot(0, &od);

    pool.ClearInputs();
    pool.RouteVoice(0, 0.5f, 0.0f); // send level 0
    pool.ProcessAll();

    StereoSample out = pool.GetBusOutput(0);
    // With zero send, the accumulator should be 0, so overdrive processes 0
    CHECK(out.left == doctest::Approx(0.0f).epsilon(0.0001));
    CHECK(out.right == doctest::Approx(0.0f).epsilon(0.0001));
}

TEST_CASE("EffectBusPool routes and mixes multiple buses") {
    EffectBusPool pool;
    pool.Init(kSampleRate);

    OverdriveEffect od;
    od.Init(kSampleRate);
    od.SetDrive(0.5f);

    OverdriveEffect od2;
    od2.Init(kSampleRate);
    od2.SetDrive(0.3f);

    pool.GetBus(0).SetSlot(0, &od);
    pool.GetBus(1).SetSlot(0, &od2);

    pool.ClearInputs();
    pool.RouteVoice(0, 0.5f, 0.8f);
    pool.RouteVoice(1, 0.5f, 0.6f);
    pool.ProcessAll();

    StereoSample mix = pool.MixReturns();
    CHECK(mix.left != doctest::Approx(0.0f).epsilon(0.001));

    // Both buses contribute
    StereoSample bus0 = pool.GetBusOutput(0);
    StereoSample bus1 = pool.GetBusOutput(1);
    CHECK(bus0.left != doctest::Approx(0.0f).epsilon(0.001));
    CHECK(bus1.left != doctest::Approx(0.0f).epsilon(0.001));
}
