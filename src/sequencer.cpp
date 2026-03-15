#include "sequencer.h"

#include <cassert>

namespace helm_audio {

void Sequencer::Init(SequencerListener* listener, Pattern* pattern) {
    assert(listener != nullptr);
    assert(pattern != nullptr);
    listener_ = listener;
    pattern_ = pattern;
    pendingPattern_ = nullptr;
    tick_ = 0;
    trackStates_.assign(pattern->tracks.size(), TrackState{});
}

void Sequencer::SetPendingPattern(Pattern* pattern) {
    assert(pattern != nullptr);
    pendingPattern_ = pattern;
}

// Micro-timing: cursor + peek model
// -----------------------------------
// The micro-timing range -5 to +5 maps exactly to one 6-tick window per
// cursor position. When the cursor sits on step N (grid = N * 6):
//
//   Current step (positive/zero offset): fires at grid + microTiming (0 to +5)
//   Peek step N+1 (negative offset):     fires at (grid + 6) + microTiming (-5 to -1)
//
// Both resolve to the same window [grid, grid + 5]. The cursor advances when
// the tick reaches grid + 6 (the next step's grid position).
//
// If both the current and peek fire on the same tick, both dispatch — current
// first, then peek. No clamping, no reordering. When the cursor advances, the
// peeked step becomes current but is marked as already fired so it doesn't
// dispatch again.
//
// At loop/swap boundaries, PeekNextStep wraps to step 0 of the same pattern
// or step 0 of the pending pattern. Negative offsets on step 0 fire at the
// tail of the previous cycle.

void Sequencer::Advance(int numTicks) {
    int numTracks = static_cast<int>(pattern_->tracks.size());

    for (int t = 0; t < numTicks; ++t) {
        for (int i = 0; i < numTracks; ++i) {
            const auto& track = pattern_->tracks[i];
            if (track.steps.empty()) {
                continue;
            }

            auto& state = trackStates_[i];
            int stepCount = static_cast<int>(track.steps.size());
            int trackCycleTicks = stepCount * kTicksPerStep;
            int trackTick = tick_ % trackCycleTicks;
            int grid = state.cursor * kTicksPerStep;

            // Current step — fires on positive/zero micro-timing offset.
            // Steps with negative offsets already fired as a peek from the
            // previous cursor position, so the >= 0 check naturally skips them.
            const auto& current = track.steps[state.cursor];
            if (current.microTiming >= 0 && trackTick == grid + current.microTiming) {
                if (!(current.oneshot && state.loopCount > 0)) {
                    DispatchStep(static_cast<uint8_t>(i), current);
                }
            }

            // Peek — next step fires early on negative micro-timing offset.
            const Step* next = PeekNextStep(i, state.cursor, stepCount);
            if (next && next->microTiming < 0) {
                int peekFireTime = grid + kTicksPerStep + next->microTiming;
                if (trackTick == peekFireTime) {
                    if (!(next->oneshot && state.loopCount > 0)) {
                        DispatchStep(static_cast<uint8_t>(i), *next);
                    }
                }
            }

            // Advance cursor at next grid boundary.
            if (trackTick == grid + kTicksPerStep - 1) {
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

const Step* Sequencer::PeekNextStep(int trackIndex, int cursor, int stepCount) {
    int nextCursor = cursor + 1;

    // Normal case: next step in same track.
    if (nextCursor < stepCount) {
        return &pattern_->tracks[trackIndex].steps[nextCursor];
    }

    // At the last step — peek wraps.
    // If a pending pattern is queued and we're near the pattern boundary,
    // peek into the pending pattern's step 0 (if the track exists).
    if (pendingPattern_ != nullptr) {
        if (trackIndex < static_cast<int>(pendingPattern_->tracks.size())) {
            const auto& pendingTrack = pendingPattern_->tracks[trackIndex];
            if (!pendingTrack.steps.empty()) {
                return &pendingTrack.steps[0];
            }
        }
        return nullptr;
    }

    // Same pattern looping — wrap to step 0.
    return &pattern_->tracks[trackIndex].steps[0];
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
        bool swapped = pendingPattern_ != nullptr;

        if (swapped) {
            pattern_ = pendingPattern_;
            pendingPattern_ = nullptr;
            trackStates_.assign(pattern_->tracks.size(), TrackState{});
        } else {
            for (auto& state : trackStates_) {
                state.cursor = 0;
            }
        }

        tick_ = 0;
    }
}

} // namespace helm_audio
