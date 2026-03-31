#include <emscripten/bind.h>
#include "fm4/modulation.h"
#include "fm4/voice.h"
#include "fm4/voice_decoder.h"

using namespace emscripten;
namespace fm4 = helm_audio::fm4;

static constexpr int kBlockSize = 128;
static constexpr int kNumSends = 4;

static constexpr fm4::ParamId kSendParams[kNumSends] = {
    fm4::ParamId::Send0, fm4::ParamId::Send1,
    fm4::ParamId::Send2, fm4::ParamId::Send3,
};

class VoiceBinding {
  public:
    void init(float sampleRate) {
        voice_.Init(sampleRate);
        mod_.Init(sampleRate);
    }

    void receiveMessage(uintptr_t dataPtr, int length) {
        const auto* data = reinterpret_cast<const uint8_t*>(dataPtr);
        decoder_.Decode(voice_, mod_, data, static_cast<size_t>(length));
    }

    uintptr_t processBlock() {
        using P = fm4::ParamId;
        for (int i = 0; i < kBlockSize; ++i) {
            mod_.Tick();

            voice_.SetParam(P::FilterFreq, mod_.GetResolved(P::FilterFreq));
            voice_.SetParam(P::FilterRes, mod_.GetResolved(P::FilterRes));
            voice_.SetParam(P::Index, mod_.GetResolved(P::Index));
            voice_.SetParam(P::Pitch, mod_.GetResolved(P::Pitch));
            voice_.SetParam(P::Algorithm, mod_.GetResolved(P::Algorithm));
            voice_.SetParam(P::Feedback, mod_.GetResolved(P::Feedback));
            voice_.SetParam(P::AmpAttack, mod_.GetResolved(P::AmpAttack));
            voice_.SetParam(P::AmpDecay, mod_.GetResolved(P::AmpDecay));
            voice_.SetParam(P::AmpSustain, mod_.GetResolved(P::AmpSustain));
            voice_.SetParam(P::AmpRelease, mod_.GetResolved(P::AmpRelease));
            voice_.SetParam(P::EnvAAttack, mod_.GetResolved(P::EnvAAttack));
            voice_.SetParam(P::EnvADecay, mod_.GetResolved(P::EnvADecay));
            voice_.SetParam(P::EnvASustain, mod_.GetResolved(P::EnvASustain));
            voice_.SetParam(P::EnvARelease, mod_.GetResolved(P::EnvARelease));
            voice_.SetParam(P::EnvBAttack, mod_.GetResolved(P::EnvBAttack));
            voice_.SetParam(P::EnvBDecay, mod_.GetResolved(P::EnvBDecay));
            voice_.SetParam(P::EnvBSustain, mod_.GetResolved(P::EnvBSustain));
            voice_.SetParam(P::EnvBRelease, mod_.GetResolved(P::EnvBRelease));
            voice_.SetParam(P::RatioA, mod_.GetResolved(P::RatioA));
            voice_.SetParam(P::RatioB, mod_.GetResolved(P::RatioB));
            voice_.SetParam(P::RatioC, mod_.GetResolved(P::RatioC));
            voice_.SetParam(P::RatioD, mod_.GetResolved(P::RatioD));
            voice_.SetParam(P::DetuneA, mod_.GetResolved(P::DetuneA));
            voice_.SetParam(P::DetuneB, mod_.GetResolved(P::DetuneB));
            voice_.SetParam(P::DetuneC, mod_.GetResolved(P::DetuneC));
            voice_.SetParam(P::DetuneD, mod_.GetResolved(P::DetuneD));
            voice_.SetParam(P::LevelA, mod_.GetResolved(P::LevelA));
            voice_.SetParam(P::LevelB, mod_.GetResolved(P::LevelB));
            voice_.SetParam(P::LevelC, mod_.GetResolved(P::LevelC));
            voice_.SetParam(P::LevelD, mod_.GetResolved(P::LevelD));

            outputBuf_[i] = voice_.Process();

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
    fm4::Voice voice_;
    fm4::VoiceModState mod_;
    fm4::VoiceDecoder decoder_;
    float outputBuf_[kBlockSize] = {};
    float sendBufs_[kNumSends][kBlockSize] = {};
};

EMSCRIPTEN_BINDINGS(helm_voice) {
    class_<VoiceBinding>("VoiceBinding")
        .constructor()
        .function("init", &VoiceBinding::init)
        .function("receiveMessage", &VoiceBinding::receiveMessage)
        .function("processBlock", &VoiceBinding::processBlock)
        .function("getSendBuffer", &VoiceBinding::getSendBuffer)
        .function("getState", &VoiceBinding::getState);
}
