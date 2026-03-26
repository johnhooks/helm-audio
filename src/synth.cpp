#include "synth.h"

#include <stdexcept>

namespace helm_audio {

void Synth::Init(float sampleRate, Pattern* pattern) {
    if (pattern == nullptr) {
        throw std::invalid_argument("Synth::Init: pattern must not be null");
    }

    sampleRate_ = sampleRate;
    numTracks_ = static_cast<int>(pattern->tracks.size());
    playing_ = false;
    bpm_ = 120.0f;
    tickAccum_ = 0.0f;

    voices_.resize(numTracks_);
    mods_.resize(numTracks_);
    for (int i = 0; i < numTracks_; i++) {
        voices_[i].Init(sampleRate);
        mods_[i].Init(sampleRate);
    }

    buses_.Init(sampleRate);
    sequencer_.Init(this, pattern);
}

void Synth::SetTempo(float bpm) {
    bpm_ = bpm;
}

void Synth::Play() {
    playing_ = true;
}

void Synth::Stop() {
    playing_ = false;
}

void Synth::Restart() {
    sequencer_.Reset();
    tickAccum_ = 0.0f;
    playing_ = true;
}

void Synth::LoadPatchBank(const std::vector<Patch>& patches) {
    patchBank_ = patches;
}

void Synth::LoadPatchBank(std::vector<Patch>&& patches) {
    patchBank_ = std::move(patches);
}

void Synth::LoadPattern(Pattern&& pattern) {
    ownedPattern_ = std::make_unique<Pattern>(std::move(pattern));
    int newTracks = static_cast<int>(ownedPattern_->tracks.size());

    if (newTracks != numTracks_) {
        numTracks_ = newTracks;
        voices_.resize(numTracks_);
        mods_.resize(numTracks_);
        for (int i = 0; i < numTracks_; i++) {
            voices_[i].Init(sampleRate_);
            mods_[i].Init(sampleRate_);
        }
    }

    sequencer_.Init(this, ownedPattern_.get());
}

void Synth::QueuePattern(Pattern* pattern) {
    if (pattern == nullptr) {
        throw std::invalid_argument("Synth::QueuePattern: pattern must not be null");
    }
    if (static_cast<int>(pattern->tracks.size()) != numTracks_) {
        throw std::invalid_argument("Synth::QueuePattern: pattern track count does not match synth");
    }
    sequencer_.SetPendingPattern(pattern);
}

void Synth::QueuePattern(Pattern&& pattern) {
    if (static_cast<int>(pattern.tracks.size()) != numTracks_) {
        throw std::invalid_argument("Synth::QueuePattern: pattern track count does not match synth");
    }
    ownedPendingPattern_ = std::make_unique<Pattern>(std::move(pattern));
    sequencer_.SetPendingPattern(ownedPendingPattern_.get());
}

void Synth::ConfigureBusFromDecoder(int busIndex, const DecodedBusConfig& config) {
    if (busIndex < 0 || busIndex >= kMaxEffectBuses) return;

    auto& bus = buses_.GetBus(busIndex);
    bus.ClearSlots();

    for (int s = 0; s < config.slotCount && s < kMaxEffectsPerBus; s++) {
        auto effect = CreateEffect(config.slots[s]);
        if (effect) {
            effect->Init(sampleRate_);
            bus.SetSlot(s, effect.get());
            ownedEffects_[busIndex][s] = std::move(effect);
        }
    }
    // Clear any remaining owned effects from previous configuration
    for (int s = config.slotCount; s < kMaxEffectsPerBus; s++) {
        ownedEffects_[busIndex][s].reset();
    }
}

std::unique_ptr<Effect> Synth::CreateEffect(const DecodedEffectSlot& slot) {
    switch (slot.type) {
    case DecodedEffectType::Delay: {
        auto fx = std::make_unique<DelayEffect>();
        fx->Init(sampleRate_);
        fx->SetTime(slot.params[0]);
        fx->SetFeedback(slot.params[1]);
        fx->SetMix(slot.params[2]);
        return fx;
    }
    case DecodedEffectType::Reverb: {
        auto fx = std::make_unique<ReverbEffect>();
        fx->Init(sampleRate_);
        fx->SetFeedback(slot.params[0]);
        fx->SetLpFreq(slot.params[1]);
        return fx;
    }
    case DecodedEffectType::Overdrive: {
        auto fx = std::make_unique<OverdriveEffect>();
        fx->Init(sampleRate_);
        fx->SetDrive(slot.params[0]);
        return fx;
    }
    case DecodedEffectType::Chorus: {
        auto fx = std::make_unique<ChorusEffect>();
        fx->Init(sampleRate_);
        fx->SetRate(slot.params[0]);
        fx->SetDepth(slot.params[1]);
        fx->SetFeedback(slot.params[2]);
        fx->SetDelay(slot.params[3]);
        return fx;
    }
    }
    return nullptr;
}

void Synth::ConfigureBus(int busIndex, int slotIndex, Effect* effect) {
    if (busIndex < 0 || busIndex >= kMaxEffectBuses) {
        throw std::out_of_range("Synth::ConfigureBus: busIndex out of range");
    }
    buses_.GetBus(busIndex).SetSlot(slotIndex, effect);
}

void Synth::Process(float* left, float* right, size_t frames) {
    float ticksPerSample = (bpm_ / 60.0f) * static_cast<float>(kPPQ) / sampleRate_;

    for (size_t i = 0; i < frames; i++) {
        // Advance sequencer
        if (playing_) {
            tickAccum_ += ticksPerSample;
            while (tickAccum_ >= 1.0f) {
                sequencer_.Advance(1);
                tickAccum_ -= 1.0f;
            }
        }

        // Detect if the sequencer swapped in a pending pattern
        if (ownedPendingPattern_ &&
            sequencer_.GetPattern() == ownedPendingPattern_.get()) {
            ownedPattern_ = std::move(ownedPendingPattern_);
        }

        // Tick modulation and apply resolved params
        for (int t = 0; t < numTracks_; t++) {
            mods_[t].Tick();
            voices_[t].SetParam(ParamId::FilterFreq, mods_[t].GetResolved(ParamId::FilterFreq));
            voices_[t].SetParam(ParamId::Index, mods_[t].GetResolved(ParamId::Index));
            voices_[t].SetParam(ParamId::Pitch, mods_[t].GetResolved(ParamId::Pitch));
        }

        // Clear bus inputs
        buses_.ClearInputs();

        // Render voices and route to buses
        float dry = 0.0f;
        float scale = 1.0f / static_cast<float>(numTracks_);

        for (int t = 0; t < numTracks_; t++) {
            float sample = voices_[t].Process() * scale;
            dry += sample;

            static constexpr ParamId kSendParams[kMaxEffectBuses] = {
                ParamId::Send0, ParamId::Send1, ParamId::Send2, ParamId::Send3,
            };
            for (int b = 0; b < kMaxEffectBuses; b++) {
                float sendLevel = mods_[t].GetResolved(kSendParams[b]);
                if (sendLevel > 0.0f) {
                    buses_.RouteVoice(b, sample, sendLevel);
                }
            }
        }

        // Process effects and mix
        buses_.ProcessAll();
        StereoSample wet = buses_.MixReturns();

        left[i] = dry + wet.left;
        right[i] = dry + wet.right;
    }
}

// -- SequencerListener callbacks ------------------------------------------------

void Synth::onNoteOn(uint8_t track, uint8_t note, uint8_t velocity) {
    if (track >= numTracks_) {
        throw std::out_of_range("Synth::onNoteOn: track index out of range");
    }
    voices_[track].NoteOn(note, velocity);
}

void Synth::onNoteOff(uint8_t track) {
    if (track >= numTracks_) {
        throw std::out_of_range("Synth::onNoteOff: track index out of range");
    }
    voices_[track].NoteOff();
}

void Synth::onFadeOut(uint8_t track) {
    if (track >= numTracks_) {
        throw std::out_of_range("Synth::onFadeOut: track index out of range");
    }
    voices_[track].FadeOut();
}

void Synth::onLoadPatch(uint8_t track, uint8_t patchIndex) {
    if (track >= numTracks_) {
        throw std::out_of_range("Synth::onLoadPatch: track index out of range");
    }
    if (patchIndex >= patchBank_.size()) {
        throw std::out_of_range("Synth::onLoadPatch: patchIndex out of range");
    }
    const Patch& patch = patchBank_[patchIndex];
    voices_[track].Configure(patch);
    mods_[track].LoadPatch(patch);
}

void Synth::onParamLock(uint8_t track, const ParamLock& lock) {
    if (track >= numTracks_) {
        throw std::out_of_range("Synth::onParamLock: track index out of range");
    }
    mods_[track].SetBase(lock.param, lock.value);
}

} // namespace helm_audio
