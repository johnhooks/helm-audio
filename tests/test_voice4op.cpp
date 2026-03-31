#include <doctest/doctest.h>
#include "fm4/voice.h"

using namespace helm_audio;
namespace fm4 = helm_audio::fm4;

static constexpr float kSampleRate = 48000.0f;

// Helper: process N samples, return sum of absolute values.
static float processSamples(fm4::Voice& voice, int n) {
    float sum = 0.0f;
    for (int i = 0; i < n; i++) {
        sum += std::abs(voice.Process());
    }
    return sum;
}

TEST_CASE("Voice4Op starts idle") {
    fm4::Voice voice;
    voice.Init(kSampleRate);
    CHECK(voice.GetState() == VoiceState::Idle);
}

TEST_CASE("Voice4Op produces silence when idle") {
    fm4::Voice voice;
    voice.Init(kSampleRate);
    CHECK(processSamples(voice, 128) == 0.0f);
}

TEST_CASE("Voice4Op produces sound on NoteOn") {
    fm4::Voice voice;
    voice.Init(kSampleRate);
    voice.NoteOn(60, 100);

    CHECK(voice.GetState() == VoiceState::Active);
    CHECK(processSamples(voice, 480) > 0.0f);
}

TEST_CASE("Voice4Op returns to idle after NoteOff and release") {
    fm4::Voice voice;
    voice.Init(kSampleRate);

    fm4::Patch config;
    config.ampRelease = 0.01f;
    config.envA_release = 0.01f;
    config.envB_release = 0.01f;
    voice.Configure(config);

    voice.NoteOn(60, 100);
    processSamples(voice, 480);
    CHECK(voice.GetState() == VoiceState::Active);

    voice.NoteOff();
    for (int i = 0; i < 48000; i++) {
        voice.Process();
        if (voice.GetState() == VoiceState::Idle) break;
    }
    CHECK(voice.GetState() == VoiceState::Idle);
}

TEST_CASE("Voice4Op FadeOut transitions to Fading then Idle") {
    fm4::Voice voice;
    voice.Init(kSampleRate);
    voice.NoteOn(60, 100);
    processSamples(voice, 480);

    voice.FadeOut();
    CHECK(voice.GetState() == VoiceState::Fading);

    for (int i = 0; i < 48000; i++) {
        voice.Process();
        if (voice.GetState() == VoiceState::Idle) break;
    }
    CHECK(voice.GetState() == VoiceState::Idle);
}

TEST_CASE("Voice4Op all 8 algorithms produce sound") {
    for (int algo = 0; algo < 8; algo++) {
        CAPTURE(algo);
        fm4::Voice voice;
        voice.Init(kSampleRate);

        fm4::Patch config;
        config.algorithm = static_cast<uint8_t>(algo);
        config.index = 2.0f;
        voice.Configure(config);

        voice.NoteOn(60, 100);
        float sum = processSamples(voice, 480);
        CHECK(sum > 0.0f);
    }
}

TEST_CASE("Voice4Op algorithm 7 (additive) produces sound with index 0") {
    fm4::Voice voice;
    voice.Init(kSampleRate);

    fm4::Patch config;
    config.algorithm = 7;
    config.index = 0.0f;
    voice.Configure(config);

    voice.NoteOn(60, 100);
    CHECK(processSamples(voice, 480) > 0.0f);
}

TEST_CASE("Voice4Op feedback changes the output") {
    auto renderWithFeedback = [](float fb) {
        fm4::Voice voice;
        voice.Init(kSampleRate);

        fm4::Patch config;
        config.algorithm = 4;
        config.index = 2.0f;
        config.feedback = fb;
        voice.Configure(config);

        voice.NoteOn(60, 100);

        float sum = 0.0f;
        for (int i = 0; i < 480; i++) {
            sum += voice.Process();
        }
        return sum;
    };

    float noFb = renderWithFeedback(0.0f);
    float withFb = renderWithFeedback(0.5f);
    CHECK(noFb != withFb);
}

TEST_CASE("Voice4Op configure changes voice parameters") {
    fm4::Voice voice;
    voice.Init(kSampleRate);

    fm4::Patch config;
    config.algorithm = 0;
    config.ops[0].ratio = 3.0f;
    config.ops[1].ratio = 2.0f;
    config.index = 3.0f;
    config.feedback = 0.3f;
    config.filterFreq = 2000.0f;
    config.filterRes = 0.5f;
    config.ampAttack = 0.001f;
    config.ampDecay = 0.05f;
    config.ampSustain = 0.5f;
    config.ampRelease = 0.1f;
    voice.Configure(config);

    voice.NoteOn(48, 127);
    CHECK(processSamples(voice, 480) > 0.0f);
}

TEST_CASE("Voice4Op SetParam switches algorithm at runtime") {
    fm4::Voice voice;
    voice.Init(kSampleRate);

    fm4::Patch config;
    config.algorithm = 4;
    config.index = 2.0f;
    voice.Configure(config);

    voice.NoteOn(60, 100);
    processSamples(voice, 240);

    voice.SetParam(fm4::ParamId::Algorithm, 7.0f);
    float sum = processSamples(voice, 240);
    CHECK(sum > 0.0f);
}
