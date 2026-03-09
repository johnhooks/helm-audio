#include "voice.h"

using namespace daisysp;

namespace helm_audio {

void Voice::Init(float sampleRate) {
    sampleRate_ = sampleRate;
    state_ = VoiceState::Idle;
    gate_ = false;

    fm_.Init(sampleRate);
    fm_.SetFrequency(440.0f);
    fm_.SetRatio(1.0f);
    fm_.SetIndex(1.0f);

    filter_.Init(sampleRate);
    filter_.SetFreq(8000.0f);
    filter_.SetRes(0.0f);
    filter_.SetDrive(0.0f);

    env_.Init(sampleRate);
    env_.SetAttackTime(0.01f);
    env_.SetDecayTime(0.1f);
    env_.SetSustainLevel(0.7f);
    env_.SetReleaseTime(0.3f);
    savedRelease_ = 0.3f;
}

void Voice::Configure(const VoiceConfig& config) {
    fm_.SetRatio(config.ratio);
    fm_.SetIndex(config.index);

    filter_.SetFreq(config.filterFreq);
    filter_.SetRes(config.filterRes);

    env_.SetAttackTime(config.attack);
    env_.SetDecayTime(config.decay);
    env_.SetSustainLevel(config.sustain);
    env_.SetReleaseTime(config.release);
    savedRelease_ = config.release;
}

float Voice::Process() {
    if (state_ == VoiceState::Idle) {
        return 0.0f;
    }

    float envOut = env_.Process(gate_);

    // Check if envelope has finished
    if (!env_.IsRunning() && !gate_) {
        state_ = VoiceState::Idle;
        // Restore release time if we were fading
        env_.SetReleaseTime(savedRelease_);
        return 0.0f;
    }

    float fmOut = fm_.Process();
    filter_.Process(fmOut);
    return filter_.Low() * envOut;
}

void Voice::NoteOn(uint8_t note, uint8_t velocity) {
    float freq = mtof(note);
    float vel = static_cast<float>(velocity) / 127.0f;

    fm_.SetFrequency(freq);
    gate_ = true;
    env_.Retrigger(false);
    state_ = VoiceState::Active;
}

void Voice::NoteOff() {
    gate_ = false;
    // State stays Active until envelope finishes in Process()
}

void Voice::FadeOut() {
    env_.SetReleaseTime(kFadeOutTime);
    gate_ = false;
    state_ = VoiceState::Fading;
}

VoiceState Voice::GetState() const {
    return state_;
}

} // namespace helm_audio
