#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include <doctest/doctest.h>
#include "voice.h"

using namespace helm_audio;

static constexpr float kSampleRate = 48000.0f;

TEST_CASE("Voice starts idle") {
    Voice voice;
    voice.Init(kSampleRate);
    CHECK(voice.GetState() == VoiceState::Idle);
}

TEST_CASE("Voice produces silence when idle") {
    Voice voice;
    voice.Init(kSampleRate);

    float sum = 0.0f;
    for (int i = 0; i < 128; i++) {
        sum += std::abs(voice.Process());
    }
    CHECK(sum == 0.0f);
}

TEST_CASE("Voice produces sound on NoteOn") {
    Voice voice;
    voice.Init(kSampleRate);
    voice.NoteOn(60, 100);

    CHECK(voice.GetState() == VoiceState::Active);

    float sum = 0.0f;
    for (int i = 0; i < 480; i++) {
        sum += std::abs(voice.Process());
    }
    CHECK(sum > 0.0f);
}

TEST_CASE("Voice returns to idle after NoteOff and release") {
    Voice voice;
    voice.Init(kSampleRate);

    Patch config;
    config.release = 0.01f; // short release for test
    config.ops[0].release = 0.01f;
    config.ops[1].release = 0.01f;
    voice.Configure(config);

    voice.NoteOn(60, 100);

    // Process some samples while gate is on
    for (int i = 0; i < 480; i++) {
        voice.Process();
    }
    CHECK(voice.GetState() == VoiceState::Active);

    voice.NoteOff();

    // Process until envelope finishes
    for (int i = 0; i < 48000; i++) {
        voice.Process();
        if (voice.GetState() == VoiceState::Idle) break;
    }
    CHECK(voice.GetState() == VoiceState::Idle);
}

TEST_CASE("FadeOut transitions to Fading then Idle") {
    Voice voice;
    voice.Init(kSampleRate);
    voice.NoteOn(60, 100);

    // Process a bit
    for (int i = 0; i < 480; i++) {
        voice.Process();
    }

    voice.FadeOut();
    CHECK(voice.GetState() == VoiceState::Fading);

    // Process until fade completes (50ms = 2400 samples at 48kHz)
    for (int i = 0; i < 48000; i++) {
        voice.Process();
        if (voice.GetState() == VoiceState::Idle) break;
    }
    CHECK(voice.GetState() == VoiceState::Idle);
}

TEST_CASE("16 voices mix without blowup") {
    static constexpr int kNumVoices = 16;
    Voice voices[kNumVoices];

    for (int v = 0; v < kNumVoices; v++) {
        voices[v].Init(kSampleRate);

        Patch config;
        config.ops[1].ratio = 1.0f + (v % 4) * 0.5f;
        config.index = 0.3f + (v % 3) * 0.3f;
        config.attack = 0.01f;
        config.release = 0.1f;
        voices[v].Configure(config);
        voices[v].NoteOn(36 + v * 2, 80);
    }

    // Process 2048 samples and check the mix stays bounded
    float peak = 0.0f;
    float sum = 0.0f;
    for (int i = 0; i < 2048; i++) {
        float mix = 0.0f;
        for (auto& voice : voices) {
            mix += voice.Process();
        }
        mix *= (1.0f / kNumVoices);
        float absMix = std::abs(mix);
        if (absMix > peak) peak = absMix;
        sum += absMix;
    }

    CHECK(sum > 0.0f);       // actually producing audio
    CHECK(peak < 2.0f);      // not exploding
    CHECK(peak > 0.001f);    // not silence

    // All voices should still be active
    for (auto& voice : voices) {
        CHECK(voice.GetState() == VoiceState::Active);
    }
}

TEST_CASE("Configure changes voice parameters") {
    Voice voice;
    voice.Init(kSampleRate);

    Patch config;
    config.ops[1].ratio = 2.0f;
    config.index = 3.0f;
    config.filterFreq = 2000.0f;
    config.filterRes = 0.5f;
    config.attack = 0.001f;
    config.decay = 0.05f;
    config.sustain = 0.5f;
    config.release = 0.1f;
    voice.Configure(config);

    voice.NoteOn(48, 127);

    float sum = 0.0f;
    for (int i = 0; i < 480; i++) {
        sum += std::abs(voice.Process());
    }
    CHECK(sum > 0.0f);
}
