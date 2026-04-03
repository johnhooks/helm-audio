#include "voice.h"

using namespace daisysp;

namespace helm_audio::fm4 {

void Voice::Init(float sampleRate) {
    sampleRate_ = sampleRate;
    state_ = VoiceState::Idle;
    gate_ = false;
    freq_ = 440.0f;
    pitchOffset_ = 0.0f;
    index_ = 1.0f;
    feedback_ = 0.0f;
    fbState_[0] = 0.0f;
    fbState_[1] = 0.0f;
    algorithm_ = 4;

    for (auto& op : ops_) {
        InitOperator(op, sampleRate);
    }

    filter_.Init(sampleRate);
    filter_.SetFreq(8000.0f);
    filter_.SetRes(0.0f);
    filter_.SetDrive(0.0f);

    envA_.Init(sampleRate);
    envA_.SetAttackTime(0.01f);
    envA_.SetDecayTime(0.1f);
    envA_.SetSustainLevel(1.0f);
    envA_.SetReleaseTime(0.3f);

    envB_.Init(sampleRate);
    envB_.SetAttackTime(0.01f);
    envB_.SetDecayTime(0.1f);
    envB_.SetSustainLevel(1.0f);
    envB_.SetReleaseTime(0.3f);

    ampEnv_.Init(sampleRate);
    ampEnv_.SetAttackTime(0.01f);
    ampEnv_.SetDecayTime(0.1f);
    ampEnv_.SetSustainLevel(0.7f);
    ampEnv_.SetReleaseTime(0.3f);
    savedRelease_ = 0.3f;
}

void Voice::Configure(const Patch& config) {
    for (int i = 0; i < 4; i++) {
        ops_[i].ratio = config.ops[i].ratio;
        ops_[i].detune = config.ops[i].detune;
        ops_[i].level = config.ops[i].level;
    }

    algorithm_ = config.algorithm <= 7 ? config.algorithm : 4;
    index_ = config.index;
    feedback_ = config.feedback;

    envA_.SetAttackTime(config.envA_attack);
    envA_.SetDecayTime(config.envA_decay);
    envA_.SetSustainLevel(config.envA_sustain);
    envA_.SetReleaseTime(config.envA_release);

    envB_.SetAttackTime(config.envB_attack);
    envB_.SetDecayTime(config.envB_decay);
    envB_.SetSustainLevel(config.envB_sustain);
    envB_.SetReleaseTime(config.envB_release);

    ampEnv_.SetAttackTime(config.ampAttack);
    ampEnv_.SetDecayTime(config.ampDecay);
    ampEnv_.SetSustainLevel(config.ampSustain);
    ampEnv_.SetReleaseTime(config.ampRelease);
    savedRelease_ = config.ampRelease;

    filter_.SetFreq(config.filterFreq);
    filter_.SetRes(config.filterRes);

    UpdateFrequencies();
}

void Voice::SetParam(ParamId id, float value) {
    switch (id) {
    case ParamId::FilterFreq:
        filter_.SetFreq(value);
        break;
    case ParamId::FilterRes:
        filter_.SetRes(value);
        break;
    case ParamId::Index:
        index_ = value;
        break;
    case ParamId::Pitch:
        pitchOffset_ = value;
        UpdateFrequencies();
        break;
    case ParamId::Algorithm:
        algorithm_ = static_cast<uint8_t>(value) <= 7
                         ? static_cast<uint8_t>(value)
                         : 4;
        break;
    case ParamId::Feedback:
        feedback_ = value;
        break;
    case ParamId::AmpAttack:
        ampEnv_.SetAttackTime(value);
        break;
    case ParamId::AmpDecay:
        ampEnv_.SetDecayTime(value);
        break;
    case ParamId::AmpSustain:
        ampEnv_.SetSustainLevel(value);
        break;
    case ParamId::AmpRelease:
        ampEnv_.SetReleaseTime(value);
        savedRelease_ = value;
        break;
    case ParamId::EnvAAttack:
        envA_.SetAttackTime(value);
        break;
    case ParamId::EnvADecay:
        envA_.SetDecayTime(value);
        break;
    case ParamId::EnvASustain:
        envA_.SetSustainLevel(value);
        break;
    case ParamId::EnvARelease:
        envA_.SetReleaseTime(value);
        break;
    case ParamId::EnvBAttack:
        envB_.SetAttackTime(value);
        break;
    case ParamId::EnvBDecay:
        envB_.SetDecayTime(value);
        break;
    case ParamId::EnvBSustain:
        envB_.SetSustainLevel(value);
        break;
    case ParamId::EnvBRelease:
        envB_.SetReleaseTime(value);
        break;
    case ParamId::RatioA:
        ops_[0].ratio = value;
        ops_[0].osc.SetFreq(freq_ * value + ops_[0].detune + pitchOffset_);
        break;
    case ParamId::RatioB:
        ops_[1].ratio = value;
        ops_[1].osc.SetFreq(freq_ * value + ops_[1].detune + pitchOffset_);
        break;
    case ParamId::RatioC:
        ops_[2].ratio = value;
        ops_[2].osc.SetFreq(freq_ * value + ops_[2].detune + pitchOffset_);
        break;
    case ParamId::RatioD:
        ops_[3].ratio = value;
        ops_[3].osc.SetFreq(freq_ * value + ops_[3].detune + pitchOffset_);
        break;
    case ParamId::DetuneA:
        ops_[0].detune = value;
        ops_[0].osc.SetFreq(freq_ * ops_[0].ratio + value + pitchOffset_);
        break;
    case ParamId::DetuneB:
        ops_[1].detune = value;
        ops_[1].osc.SetFreq(freq_ * ops_[1].ratio + value + pitchOffset_);
        break;
    case ParamId::DetuneC:
        ops_[2].detune = value;
        ops_[2].osc.SetFreq(freq_ * ops_[2].ratio + value + pitchOffset_);
        break;
    case ParamId::DetuneD:
        ops_[3].detune = value;
        ops_[3].osc.SetFreq(freq_ * ops_[3].ratio + value + pitchOffset_);
        break;
    case ParamId::LevelA:
        ops_[0].level = value;
        break;
    case ParamId::LevelB:
        ops_[1].level = value;
        break;
    case ParamId::LevelC:
        ops_[2].level = value;
        break;
    case ParamId::LevelD:
        ops_[3].level = value;
        break;
    default:
        break;
    }
}

float Voice::Process() {
    if (state_ == VoiceState::Idle) {
        return 0.0f;
    }

    float ampOut = ampEnv_.Process(gate_);

    if (!ampEnv_.IsRunning() && !gate_) {
        state_ = VoiceState::Idle;
        ampEnv_.SetReleaseTime(savedRelease_);
        return 0.0f;
    }

    envAOut_ = envA_.Process(gate_);
    envBOut_ = envB_.Process(gate_);

    float out;
    switch (algorithm_) {
    case 0:  out = RenderAlgo0(); break;
    case 1:  out = RenderAlgo1(); break;
    case 2:  out = RenderAlgo2(); break;
    case 3:  out = RenderAlgo3(); break;
    case 4:  out = RenderAlgo4(); break;
    case 5:  out = RenderAlgo5(); break;
    case 6:  out = RenderAlgo6(); break;
    case 7:  out = RenderAlgo7(); break;
    default: out = RenderAlgo4(); break;
    }

    filter_.Process(out);
    return filter_.Low() * ampOut * velocity_;
}

void Voice::NoteOn(uint8_t note, uint8_t velocity) {
    if (velocity == 0) {
        NoteOff();
        return;
    }
    freq_ = mtof(note);
    pitchOffset_ = 0.0f;
    float v = static_cast<float>(velocity) / 127.0f;
    velocity_ = v * v; // quadratic curve
    UpdateFrequencies();

    gate_ = true;
    envA_.Retrigger(false);
    envB_.Retrigger(false);
    ampEnv_.Retrigger(false);
    state_ = VoiceState::Active;
}

void Voice::NoteOff() {
    gate_ = false;
}

void Voice::FadeOut() {
    ampEnv_.SetReleaseTime(kFadeOutTime);
    gate_ = false;
    state_ = VoiceState::Fading;
}

VoiceState Voice::GetState() const {
    return state_;
}

// -- Private helpers ------------------------------------------------------

void Voice::InitOperator(Operator& op, float sampleRate) {
    op.osc.Init(sampleRate);
    op.osc.SetWaveform(Oscillator::WAVE_SIN);
    op.osc.SetAmp(1.0f);
    op.osc.SetFreq(440.0f);
    op.ratio = 1.0f;
    op.detune = 0.0f;
    op.level = 1.0f;
}

void Voice::UpdateFrequencies() {
    for (auto& op : ops_) {
        op.osc.SetFreq(freq_ * op.ratio + op.detune + pitchOffset_);
    }
}

float Voice::ProcessOp(int idx, float phaseModIn) {
    if (phaseModIn != 0.0f) {
        ops_[idx].osc.PhaseAdd(phaseModIn);
    }
    return ops_[idx].osc.Process() * ops_[idx].level;
}

void Voice::ApplyFeedback() {
    if (feedback_ > 0.0f) {
        float fb = (fbState_[0] + fbState_[1]) * 0.5f * feedback_;
        ops_[0].osc.PhaseAdd(fb);
    }
}

void Voice::UpdateFeedbackHistory(float opAOutput) {
    fbState_[1] = fbState_[0];
    fbState_[0] = opAOutput;
}

// -- Algorithm render functions -------------------------------------------

// Algo 0: A → B → C → D  (full serial)
float Voice::RenderAlgo0() {
    ApplyFeedback();
    float a = ProcessOp(0, 0.0f);
    UpdateFeedbackHistory(a);
    a *= envAOut_ * index_ * kIdxScalar;

    float b = ProcessOp(1, a) * envBOut_ * index_ * kIdxScalar;
    float c = ProcessOp(2, b) * envBOut_ * index_ * kIdxScalar;
    float d = ProcessOp(3, c);
    return d;
}

// Algo 1: [A + B] → C → D  (parallel mods into serial)
float Voice::RenderAlgo1() {
    ApplyFeedback();
    float a = ProcessOp(0, 0.0f);
    UpdateFeedbackHistory(a);
    a *= envAOut_ * index_ * kIdxScalar;

    float b = ProcessOp(1, 0.0f) * envBOut_ * index_ * kIdxScalar;
    float c = ProcessOp(2, a + b) * envBOut_ * index_ * kIdxScalar;
    float d = ProcessOp(3, c);
    return d;
}

// Algo 2: [B → C] + A → D  (serial + parallel into carrier)
float Voice::RenderAlgo2() {
    ApplyFeedback();
    float a = ProcessOp(0, 0.0f);
    UpdateFeedbackHistory(a);
    a *= envAOut_ * index_ * kIdxScalar;

    float b = ProcessOp(1, 0.0f) * envBOut_ * index_ * kIdxScalar;
    float c = ProcessOp(2, b) * envBOut_ * index_ * kIdxScalar;
    float d = ProcessOp(3, a + c);
    return d;
}

// Algo 3: [A → B] + C → D  (serial pair + parallel into carrier)
float Voice::RenderAlgo3() {
    ApplyFeedback();
    float a = ProcessOp(0, 0.0f);
    UpdateFeedbackHistory(a);
    a *= envAOut_ * index_ * kIdxScalar;

    float b = ProcessOp(1, a) * envBOut_ * index_ * kIdxScalar;
    float c = ProcessOp(2, 0.0f) * envBOut_ * index_ * kIdxScalar;
    float d = ProcessOp(3, b + c);
    return d;
}

// Algo 4: [A → B] + [C → D]  (two pairs — the workhorse)
float Voice::RenderAlgo4() {
    ApplyFeedback();
    float a = ProcessOp(0, 0.0f);
    UpdateFeedbackHistory(a);
    a *= envAOut_ * index_ * kIdxScalar;

    float b = ProcessOp(1, a);

    float c = ProcessOp(2, 0.0f) * envBOut_ * index_ * kIdxScalar;
    float d = ProcessOp(3, c);
    return b + d;
}

// Algo 5: A → [B + C + D]  (one mod, three carriers)
float Voice::RenderAlgo5() {
    ApplyFeedback();
    float a = ProcessOp(0, 0.0f);
    UpdateFeedbackHistory(a);
    a *= envAOut_ * index_ * kIdxScalar;

    float b = ProcessOp(1, a);
    float c = ProcessOp(2, a);
    float d = ProcessOp(3, a);
    return b + c + d;
}

// Algo 6: [A → B] + C + D  (one pair + two sines)
float Voice::RenderAlgo6() {
    ApplyFeedback();
    float a = ProcessOp(0, 0.0f);
    UpdateFeedbackHistory(a);
    a *= envAOut_ * index_ * kIdxScalar;

    float b = ProcessOp(1, a);
    float c = ProcessOp(2, 0.0f);
    float d = ProcessOp(3, 0.0f);
    return b + c + d;
}

// Algo 7: A + B + C + D  (additive — no FM)
float Voice::RenderAlgo7() {
    ApplyFeedback();
    float a = ProcessOp(0, 0.0f);
    UpdateFeedbackHistory(a);

    float b = ProcessOp(1, 0.0f);
    float c = ProcessOp(2, 0.0f);
    float d = ProcessOp(3, 0.0f);
    return a + b + c + d;
}

} // namespace helm_audio::fm4
