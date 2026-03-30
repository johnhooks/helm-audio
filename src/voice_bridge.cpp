#include <emscripten/bind.h>
#include "modulation.h"
#include "voice.h"

using namespace helm_audio;
using namespace emscripten;

static constexpr int kBlockSize = 128;
static constexpr int kNumSends = 4;

// ParamId values for send levels (sequential starting at Send0)
static constexpr ParamId kSendParams[kNumSends] = {
    ParamId::Send0, ParamId::Send1, ParamId::Send2, ParamId::Send3,
};

class VoiceBinding {
public:
    void init(float sampleRate) {
        voice_.Init(sampleRate);
        mod_.Init(sampleRate);
        patch_ = Patch{};
    }

    // --- Trig methods ---

    void noteOn(int note, int velocity) {
        voice_.NoteOn(static_cast<uint8_t>(note),
                      static_cast<uint8_t>(velocity));
    }

    void noteOff() { voice_.NoteOff(); }

    void fadeOut() { voice_.FadeOut(); }

    // --- Patch configuration (flat setters → internal Patch) ---

    void configureOperator(int idx, float ratio, float detune, float level,
                           float feedback, float attack, float decay,
                           float sustain, float release) {
        if (idx < 0 || idx > 1) return;
        auto& op = patch_.ops[idx];
        op.ratio = ratio;
        op.detune = detune;
        op.level = level;
        op.feedback = feedback;
        op.attack = attack;
        op.decay = decay;
        op.sustain = sustain;
        op.release = release;
    }

    void configureFilter(float freq, float res) {
        patch_.filterFreq = freq;
        patch_.filterRes = res;
    }

    void configureEnvelope(float attack, float decay,
                           float sustain, float release) {
        patch_.attack = attack;
        patch_.decay = decay;
        patch_.sustain = sustain;
        patch_.release = release;
    }

    void setIndex(float value) { patch_.index = value; }

    void setSends(float s0, float s1, float s2, float s3) {
        patch_.sends[0] = s0;
        patch_.sends[1] = s1;
        patch_.sends[2] = s2;
        patch_.sends[3] = s3;
    }

    void configureLfo(int idx, float rate, int waveform) {
        if (idx < 0 || idx >= kMaxLfosPerVoice) return;
        patch_.lfos[idx].rate = rate;
        patch_.lfos[idx].waveform = static_cast<LfoWaveform>(waveform);
    }

    void clearLfoRoutes(int lfoIdx) {
        if (lfoIdx < 0 || lfoIdx >= kMaxLfosPerVoice) return;
        patch_.lfoRoutings[lfoIdx].routeCount = 0;
    }

    void addLfoRoute(int lfoIdx, int target, float depth) {
        if (lfoIdx < 0 || lfoIdx >= kMaxLfosPerVoice) return;
        auto& routing = patch_.lfoRoutings[lfoIdx];
        if (routing.routeCount >= kMaxRoutingsPerLfo) return;
        routing.routes[routing.routeCount] = {
            static_cast<ParamId>(target), depth};
        routing.routeCount++;
    }

    // Apply the accumulated patch configuration to voice + modulation
    void applyPatch() {
        voice_.Configure(patch_);
        mod_.LoadPatch(patch_);
    }

    // --- Param lock (single param override) ---

    void setParam(int paramId, float value) {
        mod_.SetBase(static_cast<ParamId>(paramId), value);
    }

    // --- Audio processing ---

    uintptr_t processBlock() {
        for (int i = 0; i < kBlockSize; ++i) {
            // Tick modulation: LFOs + parameter resolution
            mod_.Tick();

            // Apply all resolved params to the voice
            voice_.SetParam(ParamId::FilterFreq,
                            mod_.GetResolved(ParamId::FilterFreq));
            voice_.SetParam(ParamId::FilterRes,
                            mod_.GetResolved(ParamId::FilterRes));
            voice_.SetParam(ParamId::Index,
                            mod_.GetResolved(ParamId::Index));
            voice_.SetParam(ParamId::Pitch,
                            mod_.GetResolved(ParamId::Pitch));
            voice_.SetParam(ParamId::Ratio,
                            mod_.GetResolved(ParamId::Ratio));
            voice_.SetParam(ParamId::Attack,
                            mod_.GetResolved(ParamId::Attack));
            voice_.SetParam(ParamId::Decay,
                            mod_.GetResolved(ParamId::Decay));
            voice_.SetParam(ParamId::Sustain,
                            mod_.GetResolved(ParamId::Sustain));
            voice_.SetParam(ParamId::Release,
                            mod_.GetResolved(ParamId::Release));

            // Render one sample
            outputBuf_[i] = voice_.Process();

            // Capture per-sample send levels
            for (int s = 0; s < kNumSends; ++s) {
                sendBufs_[s][i] = mod_.GetResolved(kSendParams[s]);
            }
        }
        return reinterpret_cast<uintptr_t>(outputBuf_);
    }

    uintptr_t getSendBuffer(int idx) {
        if (idx < 0 || idx >= kNumSends) return 0;
        return reinterpret_cast<uintptr_t>(sendBufs_[idx]);
    }

    int getState() { return static_cast<int>(voice_.GetState()); }

private:
    Voice voice_;
    VoiceModState mod_;
    Patch patch_;
    float outputBuf_[kBlockSize] = {};
    float sendBufs_[kNumSends][kBlockSize] = {};
};

EMSCRIPTEN_BINDINGS(helm_voice) {
    class_<VoiceBinding>("VoiceBinding")
        .constructor()
        .function("init", &VoiceBinding::init)
        .function("noteOn", &VoiceBinding::noteOn)
        .function("noteOff", &VoiceBinding::noteOff)
        .function("fadeOut", &VoiceBinding::fadeOut)
        .function("configureOperator", &VoiceBinding::configureOperator)
        .function("configureFilter", &VoiceBinding::configureFilter)
        .function("configureEnvelope", &VoiceBinding::configureEnvelope)
        .function("setIndex", &VoiceBinding::setIndex)
        .function("setSends", &VoiceBinding::setSends)
        .function("configureLfo", &VoiceBinding::configureLfo)
        .function("clearLfoRoutes", &VoiceBinding::clearLfoRoutes)
        .function("addLfoRoute", &VoiceBinding::addLfoRoute)
        .function("applyPatch", &VoiceBinding::applyPatch)
        .function("setParam", &VoiceBinding::setParam)
        .function("processBlock", &VoiceBinding::processBlock)
        .function("getSendBuffer", &VoiceBinding::getSendBuffer)
        .function("getState", &VoiceBinding::getState);
}
