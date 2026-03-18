#include "AudioFile.h"
#include "modulation.h"
#include "voice.h"
#include <array>
#include <chrono>
#include <cmath>
#include <iostream>
#include <string>

using namespace helm_audio;

static constexpr float kSampleRate = 48000.0f;
static constexpr int kNumVoices = 16;

// Delay buffer: 1 second max at 48kHz
static constexpr size_t kMaxDelay = 48000;
static constexpr float kDelayFeedback = 0.45f;
static constexpr float kDelayMix = 0.35f; // wet/dry

int main(int argc, char* argv[]) {
    std::string outputPath = "tmp/output.wav";
    if (argc > 1) {
        outputPath = argv[1];
    }

    std::array<Voice, kNumVoices> voices;
    std::array<VoiceModState, kNumVoices> mods;
    for (int i = 0; i < kNumVoices; i++) {
        voices[i].Init(kSampleRate);
        mods[i].Init(kSampleRate);
    }

    // --- Ambient voices (0-7): slow evolving FM drones ---
    // Low drone cluster — fifths and octaves, detuned
    const uint8_t ambientNotes[8] = {36, 43, 48, 55, 60, 67, 72, 79};
    const float ambientRatios[8]  = {1.0f, 1.5f, 2.0f, 1.0f, 1.5f, 2.0f, 1.0f, 3.0f};
    const float ambientIndices[8] = {0.3f, 0.5f, 0.4f, 0.6f, 0.3f, 0.7f, 0.5f, 0.2f};

    for (int i = 0; i < 8; i++) {
        Patch cfg;
        cfg.ops[1].ratio = ambientRatios[i];
        cfg.index = ambientIndices[i];
        cfg.filterFreq = 1200.0f + i * 200.0f;
        cfg.filterRes = 0.2f;
        cfg.attack = 1.5f + i * 0.3f;  // slow staggered attacks
        cfg.decay = 0.5f;
        cfg.sustain = 0.4f;
        cfg.release = 2.0f + i * 0.2f; // long releases

        // LFO 0: slow filter sweep — each voice at a slightly different rate
        // so they drift against each other (0.07–0.21 Hz)
        cfg.lfos[0].rate = 0.07f + i * 0.02f;
        cfg.lfos[0].waveform = LfoWaveform::Triangle;
        cfg.lfoRoutings[0].routeCount = 1;
        cfg.lfoRoutings[0].routes[0] = {ParamId::FilterFreq, 400.0f + i * 50.0f};

        // LFO 1: very slow index drift — subtle timbre movement
        cfg.lfos[1].rate = 0.03f + i * 0.01f;
        cfg.lfos[1].waveform = LfoWaveform::Sine;
        cfg.lfoRoutings[1].routeCount = 1;
        cfg.lfoRoutings[1].routes[0] = {ParamId::Index, 0.15f};

        voices[i].Configure(cfg);
        mods[i].LoadPatch(cfg);
    }

    // --- Chord voices (8-15): Cm9 chord, brighter and punchier ---
    const uint8_t chordNotes[8] = {48, 55, 60, 63, 67, 72, 74, 79};
    const uint8_t chordVels[8]  = {100, 90, 95, 85, 90, 80, 75, 70};

    for (int i = 0; i < 8; i++) {
        Patch cfg;
        cfg.ops[1].ratio = 1.0f + (i % 4) * 0.5f;
        cfg.index = 0.8f + (i % 3) * 0.4f;
        cfg.filterFreq = 3000.0f + i * 400.0f;
        cfg.filterRes = 0.3f;
        cfg.attack = 0.01f + i * 0.005f;
        cfg.decay = 0.3f;
        cfg.sustain = 0.6f;
        cfg.release = 0.8f + i * 0.1f;

        // LFO 0: index shimmer — faster than ambient, slightly different per voice
        cfg.lfos[0].rate = 0.5f + i * 0.15f;
        cfg.lfos[0].waveform = LfoWaveform::Sine;
        cfg.lfoRoutings[0].routeCount = 1;
        cfg.lfoRoutings[0].routes[0] = {ParamId::Index, 0.3f};

        // LFO 1: gentle filter movement
        cfg.lfos[1].rate = 0.2f + i * 0.05f;
        cfg.lfos[1].waveform = LfoWaveform::Triangle;
        cfg.lfoRoutings[1].routeCount = 1;
        cfg.lfoRoutings[1].routes[0] = {ParamId::FilterFreq, 600.0f};

        voices[8 + i].Configure(cfg);
        mods[8 + i].LoadPatch(cfg);
    }

    // --- Mix filter: slow sweeping bandpass ---
    daisysp::Svf mixFilter;
    mixFilter.Init(kSampleRate);
    mixFilter.SetRes(0.4f);
    mixFilter.SetDrive(0.0f);

    daisysp::Oscillator filterLfo;
    filterLfo.Init(kSampleRate);
    filterLfo.SetWaveform(daisysp::Oscillator::WAVE_TRI);
    filterLfo.SetFreq(0.15f); // very slow sweep
    filterLfo.SetAmp(1.0f);

    // --- Ping-pong delay ---
    // Left: dotted eighth at 90 BPM = 3/16 of a beat = 3/16 * (60/90) = 0.125s
    // Right: quarter note = 60/90 = 0.667s
    // These times give a nice rhythmic spread
    daisysp::DelayLine<float, kMaxDelay> delayL;
    daisysp::DelayLine<float, kMaxDelay> delayR;
    delayL.Init();
    delayR.Init();

    float bpm = 90.0f;
    float beatSec = 60.0f / bpm;
    delayL.SetDelay(beatSec * 0.75f * kSampleRate);  // dotted eighth
    delayR.SetDelay(beatSec * 1.0f * kSampleRate);    // quarter note

    // Filter in the feedback path to darken repeats
    daisysp::OnePole delayFilterL;
    daisysp::OnePole delayFilterR;
    delayFilterL.Init();
    delayFilterR.Init();
    delayFilterL.SetFrequency(0.3f); // normalized, ~low pass
    delayFilterR.SetFrequency(0.3f);

    // --- Timeline ---
    // 0s:  ambient voices start (staggered by attack times)
    // 3s:  chord enters
    // 7s:  chord releases
    // 9s:  ambient releases
    // 14s: end (extra tail for delay repeats)
    float duration = 14.0f;
    int numSamples = static_cast<int>(duration * kSampleRate);

    int ambientOnSample   = 0;
    int chordOnSample     = static_cast<int>(3.0f * kSampleRate);
    int chordOffSample    = static_cast<int>(7.0f * kSampleRate);
    int ambientOffSample  = static_cast<int>(9.0f * kSampleRate);

    AudioFile<float> af;
    af.setNumChannels(2);
    af.setNumSamplesPerChannel(numSamples);
    af.setSampleRate(static_cast<int>(kSampleRate));

    auto start = std::chrono::high_resolution_clock::now();

    bool ambientOn = false;
    bool chordOn = false;

    for (int i = 0; i < numSamples; i++) {
        // --- Events ---
        if (i == ambientOnSample && !ambientOn) {
            for (int v = 0; v < 8; v++) {
                voices[v].NoteOn(ambientNotes[v], 60);
            }
            ambientOn = true;
        }
        if (i == chordOnSample && !chordOn) {
            for (int v = 0; v < 8; v++) {
                voices[8 + v].NoteOn(chordNotes[v], chordVels[v]);
            }
            chordOn = true;
        }
        if (i == chordOffSample && chordOn) {
            for (int v = 8; v < 16; v++) {
                voices[v].NoteOff();
            }
            chordOn = false;
        }
        if (i == ambientOffSample && ambientOn) {
            for (int v = 0; v < 8; v++) {
                voices[v].NoteOff();
            }
            ambientOn = false;
        }

        // --- Filter LFO ---
        float lfoVal = filterLfo.Process();
        float cutoff = 300.0f + (lfoVal + 1.0f) * 0.5f * 3700.0f;
        mixFilter.SetFreq(cutoff);

        // --- Per-voice modulation ---
        for (int v = 0; v < kNumVoices; v++) {
            mods[v].Tick();
            voices[v].SetParam(ParamId::FilterFreq, mods[v].GetResolved(ParamId::FilterFreq));
            voices[v].SetParam(ParamId::Index, mods[v].GetResolved(ParamId::Index));
        }

        // --- Render all voices ---
        float mix = 0.0f;
        for (auto& voice : voices) {
            mix += voice.Process();
        }
        mix *= (1.0f / kNumVoices);

        mixFilter.Process(mix);
        float dry = mixFilter.Low() * 0.6f + mixFilter.Band() * 0.4f;

        // --- Ping-pong delay ---
        float wetL = delayL.Read();
        float wetR = delayR.Read();

        // Cross-feed: left feedback goes to right, right to left
        float fbL = delayFilterL.Process(wetL * kDelayFeedback);
        float fbR = delayFilterR.Process(wetR * kDelayFeedback);

        delayL.Write(dry + fbR);
        delayR.Write(dry + fbL);

        af.samples[0][i] = dry + wetL * kDelayMix;
        af.samples[1][i] = dry + wetR * kDelayMix;
    }

    auto end = std::chrono::high_resolution_clock::now();
    double elapsed = std::chrono::duration<double, std::milli>(end - start).count();
    double realTimeMs = duration * 1000.0;

    std::cout << "Rendered " << duration << "s (" << kNumVoices << " voices) to "
              << outputPath << std::endl;
    std::cout << "Render time: " << elapsed << " ms" << std::endl;
    std::cout << "Real-time ratio: " << realTimeMs / elapsed << "x" << std::endl;

    af.save(outputPath, AudioFileFormat::Wave);

    return 0;
}
