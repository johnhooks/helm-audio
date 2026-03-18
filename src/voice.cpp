#include "voice.h"

using namespace daisysp;

namespace helm_audio {

void Voice::Init(float sampleRate) {
    sampleRate_ = sampleRate;
    state_ = VoiceState::Idle;
    gate_ = false;
    freq_ = 440.0f;
    index_ = 1.0f;

    InitOperator(carrier_, sampleRate);
    InitOperator(modulator_, sampleRate);

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
    case ParamId::Pitch: {
        float offset = value;
        carrier_.osc.SetFreq(freq_ * carrier_.ratio + carrier_.detune + offset);
        modulator_.osc.SetFreq(freq_ * modulator_.ratio + modulator_.detune + offset);
        break;
    }
    case ParamId::Ratio:
        modulator_.ratio = value;
        modulator_.osc.SetFreq(freq_ * modulator_.ratio + modulator_.detune);
        break;
    case ParamId::Attack:
        env_.SetAttackTime(value);
        break;
    case ParamId::Decay:
        env_.SetDecayTime(value);
        break;
    case ParamId::Sustain:
        env_.SetSustainLevel(value);
        break;
    case ParamId::Release:
        env_.SetReleaseTime(value);
        savedRelease_ = value;
        break;
    case ParamId::Send0:
    case ParamId::Send1:
    case ParamId::Send2:
    case ParamId::Send3:
        // Send levels will be read by the synth, not applied to DSP here
        break;
    }
}

void Voice::Configure(const Patch& config) {
    ConfigureOperator(carrier_, config.ops[0]);
    ConfigureOperator(modulator_, config.ops[1]);
    index_ = config.index;

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

    // Amplitude envelope — controls the overall volume of the voice.
    float envOut = env_.Process(gate_);

    if (!env_.IsRunning() && !gate_) {
        state_ = VoiceState::Idle;
        env_.SetReleaseTime(savedRelease_);
        return 0.0f;
    }

    // --- FM synthesis: modulator → carrier via phase modulation ---
    //
    // Step 1: Run the modulator's envelope. This shapes the FM depth
    // over time — e.g. a fast decay here means the sound starts bright
    // and mellows, even while the note is still sustaining.
    float modEnv = modulator_.env.Process(modulator_.gate);

    // Step 2: Apply self-feedback on the modulator (if enabled).
    // Feedback feeds the operator's previous output back into its own
    // phase, adding harmonics to the modulator itself. This makes the
    // modulation source richer — like using a complex waveform instead
    // of a pure sine. The 2-sample average smooths the feedback to
    // prevent it from going unstable too quickly.
    if (modulator_.feedback > 0.0f) {
        float fb = (modulator_.fbState[0] + modulator_.fbState[1]) * 0.5f
                   * modulator_.feedback;
        modulator_.osc.PhaseAdd(fb);
    }

    // Step 3: Generate the modulator's sine wave (-1.0 to +1.0).
    float modVal = modulator_.osc.Process();

    // Update feedback history.
    modulator_.fbState[1] = modulator_.fbState[0];
    modulator_.fbState[0] = modVal;

    // Step 4: Scale the modulator output. The effective modulation is:
    //   sine * envelope * level * index * kIdxScalar
    // Each factor serves a different purpose:
    //   - envelope: time-varying depth (timbre evolution)
    //   - level: static per-operator scaling
    //   - index: overall FM depth (the main "brightness" knob)
    //   - kIdxScalar (0.2): maps user-facing index to phase units
    float modOut = modVal * modEnv * modulator_.level * index_ * kIdxScalar;

    // Step 5: Apply self-feedback on the carrier (if enabled).
    // Carrier feedback adds harmonics directly to the audible output —
    // at low values it thickens the tone, at high values it approaches
    // a sawtooth-like waveform.
    if (carrier_.feedback > 0.0f) {
        float fb = (carrier_.fbState[0] + carrier_.fbState[1]) * 0.5f
                   * carrier_.feedback;
        carrier_.osc.PhaseAdd(fb);
    }

    // Step 6: Add the modulator's output to the carrier's phase.
    // This is phase modulation — the carrier's instantaneous phase
    // is shifted by the modulator, creating sidebands (new harmonics).
    carrier_.osc.PhaseAdd(modOut);

    // Step 7: Generate the carrier's output, scaled by its envelope.
    // The carrier envelope shapes the carrier's amplitude over time —
    // independent of the voice's amplitude envelope. A fast carrier
    // decay gives a pluck character. A slow attack brightens over time.
    float carEnv = carrier_.env.Process(carrier_.gate);
    float carrierVal = carrier_.osc.Process() * carrier_.level * carEnv;

    // Update carrier feedback history.
    carrier_.fbState[1] = carrier_.fbState[0];
    carrier_.fbState[0] = carrierVal;

    // Step 8: Filter and apply amplitude envelope.
    filter_.Process(carrierVal);
    return filter_.Low() * envOut;
}

void Voice::NoteOn(uint8_t note, uint8_t velocity) {
    float freq = mtof(note);
    freq_ = freq;

    // Set oscillator frequencies from the note. Each operator runs at
    // noteFreq * ratio + detune. The carrier ratio is usually 1.0 (plays
    // the note pitch). The modulator ratio determines which harmonics
    // the FM produces — e.g. ratio 2.0 emphasizes the octave.
    carrier_.osc.SetFreq(freq_ * carrier_.ratio + carrier_.detune);
    modulator_.osc.SetFreq(freq_ * modulator_.ratio + modulator_.detune);

    // Gate all three envelopes: both operators + amplitude.
    // The operator envelopes start shaping timbre immediately.
    // The amplitude envelope starts shaping volume.
    carrier_.gate = true;
    modulator_.gate = true;
    carrier_.env.Retrigger(false);
    modulator_.env.Retrigger(false);

    gate_ = true;
    env_.Retrigger(false);
    state_ = VoiceState::Active;
}

void Voice::NoteOff() {
    // Release all three envelopes. The modulator's release controls
    // how quickly the timbre simplifies. The amplitude envelope's
    // release controls how quickly the sound fades to silence.
    carrier_.gate = false;
    modulator_.gate = false;
    gate_ = false;
}

void Voice::FadeOut() {
    env_.SetReleaseTime(kFadeOutTime);
    carrier_.gate = false;
    modulator_.gate = false;
    gate_ = false;
    state_ = VoiceState::Fading;
}

VoiceState Voice::GetState() const {
    return state_;
}

void Voice::InitOperator(Operator& op, float sampleRate) {
    op.osc.Init(sampleRate);
    op.osc.SetWaveform(Oscillator::WAVE_SIN);
    op.osc.SetAmp(1.0f);
    op.osc.SetFreq(440.0f);

    op.env.Init(sampleRate);
    op.env.SetAttackTime(0.01f);
    op.env.SetDecayTime(0.1f);
    op.env.SetSustainLevel(1.0f);
    op.env.SetReleaseTime(0.3f);

    op.ratio = 1.0f;
    op.detune = 0.0f;
    op.level = 1.0f;
    op.feedback = 0.0f;
    op.fbState[0] = 0.0f;
    op.fbState[1] = 0.0f;
    op.gate = false;
}

void Voice::ConfigureOperator(Operator& op, const OperatorPatch& patch) {
    op.ratio = patch.ratio;
    op.detune = patch.detune;
    op.level = patch.level;
    op.feedback = patch.feedback;

    op.env.SetAttackTime(patch.attack);
    op.env.SetDecayTime(patch.decay);
    op.env.SetSustainLevel(patch.sustain);
    op.env.SetReleaseTime(patch.release);

    op.osc.SetFreq(freq_ * op.ratio + op.detune);
}

} // namespace helm_audio
