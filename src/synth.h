#pragma once

#include "effect_bus.h"
#include "modulation.h"
#include "sequencer.h"
#include "voice.h"

#include <vector>

namespace helm_audio {

class Synth : public SequencerListener {
public:
    void Init(float sampleRate, Pattern* pattern);
    void Process(float* left, float* right, size_t frames);

    // Transport
    void SetTempo(float bpm);
    void Play();
    void Stop();

    // Configuration
    void LoadPatchBank(const std::vector<Patch>& patches);
    void QueuePattern(Pattern* pattern);
    void ConfigureBus(int busIndex, int slotIndex, Effect* effect);

    int GetNumTracks() const { return numTracks_; }
    float GetTempo() const { return bpm_; }
    bool IsPlaying() const { return playing_; }

    // SequencerListener
    void onNoteOn(uint8_t track, uint8_t note, uint8_t velocity) override;
    void onNoteOff(uint8_t track) override;
    void onFadeOut(uint8_t track) override;
    void onLoadPatch(uint8_t track, uint8_t patchIndex) override;
    void onParamLock(uint8_t track, const ParamLock& lock) override;

private:
    float sampleRate_ = 48000.0f;
    int numTracks_ = 0;
    bool playing_ = false;

    float bpm_ = 120.0f;
    float tickAccum_ = 0.0f;

    std::vector<Voice> voices_;
    std::vector<VoiceModState> mods_;
    std::vector<Patch> patchBank_;
    Sequencer sequencer_;
    EffectBusPool buses_;
};

} // namespace helm_audio
