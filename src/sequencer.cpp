#include "sequencer.h"

#include <algorithm>
#include <cassert>

namespace helm_audio {

void Sequencer::Init(SequencerListener* listener, Pattern* pattern) {
    assert(listener != nullptr);
    assert(pattern != nullptr);
    listener_ = listener;
    pattern_ = pattern;
    pendingPattern_ = nullptr;
    tick_ = 0;
    trackStates_ = {};
}

void Sequencer::SetPendingPattern(Pattern* pattern) {
    assert(pattern != nullptr);
    pendingPattern_ = pattern;
}

// Micro-timing design
// --------------------
// Micro-timing nudges a step's fire time relative to its grid position. The
// offset is in ticks (range -6 to +5, i.e. within one step of 6 ticks).
//
// The sequencer cursor always advances in step order: step 0, then 1, then 2,
// etc. Micro-timing cannot reorder steps. If a step's micro-timed fire time
// falls before the tick when the previous step actually fired, the offset is
// clamped — the step fires immediately (on the current tick) instead of in the
// past. This means:
//
//   - Steps never fire out of order within a track.
//   - No collisions: each step fires on exactly one tick.
//   - No while-loops or wrapping tricks needed in the dispatch logic.
//
// Musically, a clamped offset means two steps were too close together for both
// offsets to fully apply. The difference is at most a few ticks (sub-
// millisecond at typical BPMs) — inaudible in practice. The encoder can avoid
// this entirely by not placing conflicting offsets on adjacent steps, but the
// engine handles it gracefully either way.
//
// On the first step of a pattern (or after a loop/swap), there is no previous
// fire tick, so negative offsets on step 0 are clamped to the grid position
// (you can't go back before the pattern started).

void Sequencer::Advance(int numTicks) {
    for (int t = 0; t < numTicks; ++t) {
        for (int i = 0; i < kNumTracks; ++i) {
            const auto& track = pattern_->tracks[i];
            if (track.steps.empty()) {
                continue;
            }

            auto& state = trackStates_[i];
            int stepCount = static_cast<int>(track.steps.size());

            // The grid position for the current step.
            int gridTick = state.cursor * kTicksPerStep;

            // Apply micro-timing offset, then clamp: never fire before the
            // previous step's actual fire tick, and never before tick 0.
            int fireTime = gridTick + track.steps[state.cursor].microTiming;
            int earliest = std::max(0, state.lastFireTick + 1);
            fireTime = std::max(fireTime, earliest);

            if (tick_ == fireTime) {
                const auto& step = track.steps[state.cursor];

                if (step.oneshot && state.loopCount > 0) {
                    // Skip consumed oneshot, but still advance cursor.
                } else {
                    DispatchStep(static_cast<uint8_t>(i), step);
                }

                state.lastFireTick = tick_;
                state.cursor++;
                if (state.cursor >= stepCount) {
                    state.cursor = 0;
                    state.loopCount++;
                }
            }
        }

        tick_++;

        CheckLoopBoundary();
    }
}

void Sequencer::DispatchStep(uint8_t trackIndex, const Step& step) {
    // 1. Patch load
    if (step.patchIndex.has_value()) {
        listener_->onLoadPatch(trackIndex, step.patchIndex.value());
    }

    // 2. Trig
    std::visit([&](const auto& trig) {
        using T = std::decay_t<decltype(trig)>;
        if constexpr (std::is_same_v<T, NoteOn>) {
            listener_->onNoteOn(trackIndex, trig.note, trig.velocity);
        } else if constexpr (std::is_same_v<T, NoteOff>) {
            listener_->onNoteOff(trackIndex);
        } else if constexpr (std::is_same_v<T, FadeOut>) {
            listener_->onFadeOut(trackIndex);
        }
        // monostate: no trig, do nothing
    }, step.trig);

    // 3. Param locks
    for (const auto& lock : step.locks) {
        listener_->onParamLock(trackIndex, lock);
    }
}

void Sequencer::CheckLoopBoundary() {
    int patternTicks = pattern_->length * kTicksPerStep;

    if (tick_ >= patternTicks) {
        if (pendingPattern_ != nullptr) {
            pattern_ = pendingPattern_;
            pendingPattern_ = nullptr;
        }

        tick_ = 0;
        // Reset cursors and lastFireTick for the new cycle.
        // loopCount persists for oneshot tracking.
        for (auto& state : trackStates_) {
            state.cursor = 0;
            state.lastFireTick = -1;
        }
    }
}

} // namespace helm_audio
