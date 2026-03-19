#pragma once

#include "effect.h"

namespace helm_audio {

static constexpr int kMaxEffectBuses = 4;
static constexpr int kMaxEffectsPerBus = 4;

class EffectBus {
  public:
    void Accumulate(float in) { inputAccum_ += in; }

    StereoSample Process() {
        if (slotCount_ == 0) {
            inputAccum_ = 0.0f;
            return {0.0f, 0.0f};
        }

        StereoSample result = {inputAccum_, inputAccum_};
        inputAccum_ = 0.0f;

        for (int i = 0; i < slotCount_; i++) {
            result = slots_[i]->Process(result);
        }

        return result;
    }

    void ClearInput() { inputAccum_ = 0.0f; }

    void SetSlot(int index, Effect* effect) {
        if (index < 0 || index >= kMaxEffectsPerBus)
            return;
        slots_[index] = effect;
        if (index >= slotCount_)
            slotCount_ = index + 1;
    }

    void ClearSlots() {
        for (int i = 0; i < kMaxEffectsPerBus; i++)
            slots_[i] = nullptr;
        slotCount_ = 0;
    }

    bool IsActive() const { return slotCount_ > 0; }
    int SlotCount() const { return slotCount_; }

  private:
    Effect* slots_[kMaxEffectsPerBus] = {};
    int slotCount_ = 0;
    float inputAccum_ = 0.0f;
};

class EffectBusPool {
  public:
    void Init(float sampleRate) {
        (void)sampleRate;
        for (auto& bus : buses_)
            bus.ClearSlots();
    }

    void ClearInputs() {
        for (auto& bus : buses_)
            bus.ClearInput();
    }

    void RouteVoice(int busIndex, float sample, float sendLevel) {
        if (busIndex < 0 || busIndex >= kMaxEffectBuses)
            return;
        buses_[busIndex].Accumulate(sample * sendLevel);
    }

    void ProcessAll() {
        for (int i = 0; i < kMaxEffectBuses; i++) {
            if (buses_[i].IsActive())
                busOutputs_[i] = buses_[i].Process();
            else
                busOutputs_[i] = {0.0f, 0.0f};
        }
    }

    StereoSample GetBusOutput(int busIndex) const {
        if (busIndex < 0 || busIndex >= kMaxEffectBuses)
            return {0.0f, 0.0f};
        return busOutputs_[busIndex];
    }

    StereoSample MixReturns() const {
        StereoSample sum = {0.0f, 0.0f};
        for (const auto& out : busOutputs_) {
            sum.left += out.left;
            sum.right += out.right;
        }
        return sum;
    }

    EffectBus& GetBus(int index) { return buses_[index]; }

  private:
    EffectBus buses_[kMaxEffectBuses];
    StereoSample busOutputs_[kMaxEffectBuses] = {};
};

} // namespace helm_audio
