#include "AudioFile.h"
#include "effect.h"
#include "effect_bus.h"
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

        // Ambient voices send to both delay (bus 0) and reverb (bus 1)
        cfg.sends[0] = 0.4f; // delay
        cfg.sends[1] = 0.5f; // reverb

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

        // Chord voices send mostly to delay, less to reverb
        cfg.sends[0] = 0.5f; // delay
        cfg.sends[1] = 0.2f; // reverb

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

    // --- Effect buses ---
    // Bus 0: ping-pong delay (replaces the manual ping-pong)
    DelayEffect delay;
    delay.Init(kSampleRate);
    float bpm = 90.0f;
    float beatSec = 60.0f / bpm;
    delay.SetTime(beatSec);
    delay.SetFeedback(0.45f);
    delay.SetMix(0.35f);

    // Bus 1: reverb (adds depth to the ambient drones)
    ReverbEffect reverb;
    reverb.Init(kSampleRate);
    reverb.SetFeedback(0.85f);
    reverb.SetLpFreq(8000.0f);

    EffectBusPool buses;
    buses.Init(kSampleRate);
    buses.GetBus(0).SetSlot(0, &delay);
    buses.GetBus(1).SetSlot(0, &reverb);

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

    // --- Timeline ---
    // 0s:  ambient voices start (staggered by attack times)
    // 3s:  chord enters
    // 7s:  chord releases
    // 9s:  ambient releases
    // 14s: end (extra tail for delay/reverb tails)
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

        // --- Render voices and route to buses ---
        buses.ClearInputs();
        float dry = 0.0f;

        for (int v = 0; v < kNumVoices; v++) {
            float sample = voices[v].Process() * (1.0f / kNumVoices);
            dry += sample;

            // Route to effect buses via send levels
            float send0 = mods[v].GetResolved(ParamId::Send0);
            float send1 = mods[v].GetResolved(ParamId::Send1);
            if (send0 > 0.0f)
                buses.RouteVoice(0, sample, send0);
            if (send1 > 0.0f)
                buses.RouteVoice(1, sample, send1);
        }

        // --- Mix filter ---
        mixFilter.Process(dry);
        dry = mixFilter.Low() * 0.6f + mixFilter.Band() * 0.4f;

        // --- Process effect buses ---
        buses.ProcessAll();
        StereoSample wet = buses.MixReturns();

        // --- Master output: dry (mono→stereo) + bus returns (stereo) ---
        af.samples[0][i] = dry + wet.left;
        af.samples[1][i] = dry + wet.right;
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
