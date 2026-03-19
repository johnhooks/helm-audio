#pragma once

#include "Effects/chorus.h"
#include "Effects/overdrive.h"
#include "Effects/reverbsc.h"
#include "Filters/onepole.h"
#include "Utility/delayline.h"

namespace helm_audio {

struct StereoSample {
    float left = 0.0f;
    float right = 0.0f;
};

class Effect {
  public:
    virtual ~Effect() = default;
    virtual void Init(float sampleRate) = 0;
    virtual StereoSample Process(StereoSample in) = 0;
};

// --- Stereo ping-pong delay ---
// Two delay lines with cross-fed feedback and OnePole filters to darken repeats.
// Left delay time = time * 0.75, right = time. Produces stereo from mono input.
class DelayEffect : public Effect {
  public:
    void Init(float sampleRate) override {
        sampleRate_ = sampleRate;
        delayL_.Init();
        delayR_.Init();
        filterL_.Init();
        filterR_.Init();
        filterL_.SetFrequency(0.3f);
        filterR_.SetFrequency(0.3f);
        SetTime(0.5f);
        SetFeedback(0.45f);
        SetMix(0.35f);
    }

    StereoSample Process(StereoSample in) override {
        float wetL = delayL_.Read();
        float wetR = delayR_.Read();

        float fbL = filterL_.Process(wetL * feedback_);
        float fbR = filterR_.Process(wetR * feedback_);

        // Cross-feed: left feedback → right input, right feedback → left input
        delayL_.Write(in.left + fbR);
        delayR_.Write(in.right + fbL);

        return {wetL * mix_, wetR * mix_};
    }

    void SetTime(float seconds) {
        delayL_.SetDelay(seconds * 0.75f * sampleRate_);
        delayR_.SetDelay(seconds * sampleRate_);
    }

    void SetFeedback(float fb) { feedback_ = fb; }
    void SetMix(float mix) { mix_ = mix; }

  private:
    static constexpr size_t kMaxDelay = 48000;
    float sampleRate_ = 48000.0f;
    float feedback_ = 0.45f;
    float mix_ = 0.35f;
    daisysp::DelayLine<float, kMaxDelay> delayL_;
    daisysp::DelayLine<float, kMaxDelay> delayR_;
    daisysp::OnePole filterL_;
    daisysp::OnePole filterR_;
};

// --- Stereo reverb ---
// Wraps ReverbSc. Mono input duplicated to both channels.
class ReverbEffect : public Effect {
  public:
    void Init(float sampleRate) override {
        reverb_.Init(sampleRate);
        reverb_.SetFeedback(0.85f);
        reverb_.SetLpFreq(10000.0f);
    }

    StereoSample Process(StereoSample in) override {
        float outL, outR;
        reverb_.Process(in.left, in.right, &outL, &outR);
        return {outL, outR};
    }

    void SetFeedback(float fb) { reverb_.SetFeedback(fb); }
    void SetLpFreq(float freq) { reverb_.SetLpFreq(freq); }

  private:
    daisysp::ReverbSc reverb_;
};

// --- Overdrive ---
// Mono processing, duplicated to stereo output.
class OverdriveEffect : public Effect {
  public:
    void Init(float sampleRate) override {
        (void)sampleRate;
        drive_.Init();
        drive_.SetDrive(0.5f);
    }

    StereoSample Process(StereoSample in) override {
        return {drive_.Process(in.left), drive_.Process(in.right)};
    }

    void SetDrive(float d) { drive_.SetDrive(d); }

  private:
    daisysp::Overdrive drive_;
};

// --- Chorus ---
// Uses DaisySP's stereo Chorus (two engines with built-in LFO modulation).
class ChorusEffect : public Effect {
  public:
    void Init(float sampleRate) override {
        chorus_.Init(sampleRate);
        // Different rates per channel for stereo width
        chorus_.SetLfoFreq(0.8f, 1.1f);
        chorus_.SetLfoDepth(0.5f);
        chorus_.SetFeedback(0.2f);
        chorus_.SetDelay(0.5f, 0.7f);
    }

    StereoSample Process(StereoSample in) override {
        float mono = (in.left + in.right) * 0.5f;
        chorus_.Process(mono);
        return {chorus_.GetLeft(), chorus_.GetRight()};
    }

    void SetRate(float hz) { chorus_.SetLfoFreq(hz); }
    void SetDepth(float d) { chorus_.SetLfoDepth(d); }
    void SetFeedback(float fb) { chorus_.SetFeedback(fb); }
    void SetDelay(float d) { chorus_.SetDelay(d); }

  private:
    daisysp::Chorus chorus_;
};

} // namespace helm_audio
