#include <emscripten/bind.h>
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

    // Transport
    void setTempo(float bpm) { synth_.SetTempo(bpm); }
    void play() { synth_.Play(); }
    void stop() { synth_.Stop(); }

    // Direct voice control
    void noteOn(int track, int note, int velocity) {
        synth_.onNoteOn(track, note, velocity);
    }

    void noteOff(int track) {
        synth_.onNoteOff(track);
    }

    // Simplified patch config — flat args, no struct binding needed
    void configurePatch(int patchIndex, float index, float filterFreq,
                        float filterRes, float attack, float decay,
                        float sustain, float release) {
        Patch p;
        p.index = index;
        p.filterFreq = filterFreq;
        p.filterRes = filterRes;
        p.attack = attack;
        p.decay = decay;
        p.sustain = sustain;
        p.release = release;

        if (patchIndex >= static_cast<int>(patchBank_.size())) {
            patchBank_.resize(patchIndex + 1);
        }
        patchBank_[patchIndex] = p;
        synth_.LoadPatchBank(patchBank_);
    }

    void loadPatch(int track, int patchIndex) {
        synth_.onLoadPatch(track, patchIndex);
    }

private:
    Synth synth_;
    Pattern pattern_;
    std::vector<Patch> patchBank_;
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
        .function("setTempo", &SynthBinding::setTempo)
        .function("play", &SynthBinding::play)
        .function("stop", &SynthBinding::stop)
        .function("noteOn", &SynthBinding::noteOn)
        .function("noteOff", &SynthBinding::noteOff)
        .function("configurePatch", &SynthBinding::configurePatch)
        .function("loadPatch", &SynthBinding::loadPatch);
}
