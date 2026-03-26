#include <emscripten/bind.h>
#include "protocol_decoder.h"
#include "synth.h"

using namespace helm_audio;
using namespace emscripten;

class SynthBinding {
public:
    void init(float sampleRate, int numTracks) {
        pattern_.tracks.resize(numTracks);
        for (auto& track : pattern_.tracks) {
            track.steps.resize(16);
        }
        pattern_.length = 16;
        synth_.Init(sampleRate, &pattern_);

        left_ = new float[128];
        right_ = new float[128];
    }

    void destroy() {
        delete[] left_;
        delete[] right_;
        left_ = nullptr;
        right_ = nullptr;
    }

    uintptr_t process() {
        synth_.Process(left_, right_, 128);
        return reinterpret_cast<uintptr_t>(left_);
    }

    uintptr_t getRight() {
        return reinterpret_cast<uintptr_t>(right_);
    }

    void receiveMessage(uintptr_t dataPtr, int length) {
        const auto* data = reinterpret_cast<const uint8_t*>(dataPtr);
        decoder_.Decode(synth_, data, static_cast<size_t>(length));
    }

private:
    Synth synth_;
    ProtocolDecoder decoder_;
    Pattern pattern_;
    float* left_ = nullptr;
    float* right_ = nullptr;
};

EMSCRIPTEN_BINDINGS(helm_audio) {
    class_<SynthBinding>("SynthBinding")
        .constructor()
        .function("init", &SynthBinding::init)
        .function("destroy", &SynthBinding::destroy)
        .function("process", &SynthBinding::process)
        .function("getRight", &SynthBinding::getRight)
        .function("receiveMessage", &SynthBinding::receiveMessage);
}
