#include "AudioFile.h"
#include "voice.h"
#include <array>
#include <chrono>
#include <iostream>
#include <string>

using namespace helm_audio;

static constexpr float kSampleRate = 48000.0f;
static constexpr int kNumVoices = 8;

int main(int argc, char* argv[]) {
    std::string outputPath = "output.wav";
    if (argc > 1) {
        outputPath = argv[1];
    }

    std::array<Voice, kNumVoices> voices;

    // MIDI notes: C minor 9 chord spread across voices
    const uint8_t notes[kNumVoices] = {48, 55, 60, 63, 67, 72, 74, 79};
    const uint8_t vels[kNumVoices]  = {100, 90, 95, 85, 90, 80, 75, 70};

    // Varying FM configs per voice
    for (int v = 0; v < kNumVoices; v++) {
        voices[v].Init(kSampleRate);

        VoiceConfig config;
        config.ratio = 1.0f + (v % 4) * 0.5f;
        config.index = 0.5f + (v % 3) * 0.5f;
        config.filterFreq = 8000.0f; // wide open, let mix filter do the work
        config.filterRes = 0.0f;
        config.attack = 0.01f + v * 0.01f;
        config.decay = 0.2f;
        config.sustain = 0.6f;
        config.release = 0.4f + v * 0.05f;
        voices[v].Configure(config);
    }

    // Scanner filter
    daisysp::Svf mixFilter;
    mixFilter.Init(kSampleRate);
    mixFilter.SetRes(0.5f);
    mixFilter.SetDrive(0.0f);

    // LFO to sweep the filter
    daisysp::Oscillator lfo;
    lfo.Init(kSampleRate);
    lfo.SetWaveform(daisysp::Oscillator::WAVE_TRI);
    lfo.SetFreq(0.5f);
    lfo.SetAmp(1.0f);

    // Render 4 seconds
    float duration = 4.0f;
    int numSamples = static_cast<int>(duration * kSampleRate);

    AudioFile<float> af;
    af.setNumChannels(1);
    af.setNumSamplesPerChannel(numSamples);
    af.setSampleRate(static_cast<int>(kSampleRate));

    // All voices on
    for (int v = 0; v < kNumVoices; v++) {
        voices[v].NoteOn(notes[v], vels[v]);
    }

    int noteOffSample = static_cast<int>(2.0f * kSampleRate);

    auto start = std::chrono::high_resolution_clock::now();

    for (int i = 0; i < numSamples; i++) {
        if (i == noteOffSample) {
            for (auto& voice : voices) {
                voice.NoteOff();
            }
        }

        float lfoVal = lfo.Process();
        float cutoff = 200.0f + (lfoVal + 1.0f) * 0.5f * 5800.0f;
        mixFilter.SetFreq(cutoff);

        float mix = 0.0f;
        for (auto& voice : voices) {
            mix += voice.Process();
        }
        mix *= (1.0f / kNumVoices);

        mixFilter.Process(mix);
        af.samples[0][i] = mixFilter.Band();
    }

    auto end = std::chrono::high_resolution_clock::now();
    double elapsed = std::chrono::duration<double, std::milli>(end - start).count();
    double realTimeMs = duration * 1000.0;

    std::cout << "Rendered " << duration << "s to " << outputPath << std::endl;
    std::cout << "Render time: " << elapsed << " ms" << std::endl;
    std::cout << "Real-time ratio: " << realTimeMs / elapsed << "x" << std::endl;

    af.save(outputPath, AudioFileFormat::Wave);

    return 0;
}
