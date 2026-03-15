#pragma once

#include <cassert>
#include <cstdint>
#include <optional>
#include <variant>
#include <vector>

namespace helm_audio {

static constexpr int kPPQ = 24;          // pulses (ticks) per quarter note
static constexpr int kTicksPerStep = 6;  // 24 PPQ / 4 steps per beat = 6 ticks per sixteenth note

// -- Parameter locks (discriminated union) ------------------------------------

/// Each lock type overrides a single voice config field for one step.
struct LockRatio { float value; };
struct LockIndex { float value; };
struct LockFilterFreq { float value; };
struct LockFilterRes { float value; };
struct LockAttack { float value; };
struct LockDecay { float value; };
struct LockSustain { float value; };
struct LockRelease { float value; };

using ParamLock = std::variant<
    LockRatio, LockIndex, LockFilterFreq, LockFilterRes,
    LockAttack, LockDecay, LockSustain, LockRelease>;

// -- Trigger types (discriminated union via std::variant) ---------------------

struct NoteOn {
    uint8_t note = 0;
    uint8_t velocity = 127;
};

struct NoteOff {};
struct FadeOut {};

/// A trigger is one of the above, or std::monostate for "no trigger."
using Trigger = std::variant<std::monostate, NoteOn, NoteOff, FadeOut>;

// -- Pattern grid -------------------------------------------------------------

/// A single step on a track.
///
/// Dispatch order per step:
///   1. Patch — load a new patch into the voice (if present)
///   2. Trig — NoteOn, NoteOff, FadeOut (if present)
///   3. ParamLocks — per-field overrides (if any)
///
/// Any combination is valid:
/// - Patch + NoteOn: load a patch and trigger in one step
/// - NoteOn + locks: trigger with parameter overrides
/// - Locks alone: modify a sustaining voice's parameters on this beat
/// - Empty: track state unchanged (sticky)
struct Step {
    Trigger trig{};
    std::vector<ParamLock> locks;
    std::optional<uint8_t> patchIndex{};
    int8_t microTiming = 0;  // tick offset from grid position (-5 to +5)
    bool oneshot = false;
};

/// A single track in a pattern. Each track has its own step count
/// (polymetric — like Elektron sequencers).
struct Track {
    std::vector<Step> steps;
};

/// A pattern with a variable number of tracks and independent step counts.
/// The track count must match the sequencer instance's track count.
struct Pattern {
    std::vector<Track> tracks;
    int length = 16;  // pattern length in steps (sixteenth notes)
};

// -- Listener interface -------------------------------------------------------

class SequencerListener {
public:
    virtual ~SequencerListener() = default;
    virtual void onNoteOn(uint8_t track, uint8_t note, uint8_t velocity) = 0;
    virtual void onNoteOff(uint8_t track) = 0;
    virtual void onFadeOut(uint8_t track) = 0;
    virtual void onLoadPatch(uint8_t track, uint8_t patchIndex) = 0;
    virtual void onParamLock(uint8_t track, const ParamLock& lock) = 0;
};

// -- Sequencer ----------------------------------------------------------------

class Sequencer {
public:
    void Init(SequencerListener* listener, Pattern* pattern);
    void SetPendingPattern(Pattern* pattern);
    void Advance(int numTicks);

    int GetTick() const { return tick_; }

private:
    void DispatchStep(uint8_t trackIndex, const Step& step);
    const Step* PeekNextStep(int trackIndex, int cursor, int stepCount);
    void CheckLoopBoundary();

    SequencerListener* listener_ = nullptr;
    Pattern* pattern_ = nullptr;
    Pattern* pendingPattern_ = nullptr;

    int tick_ = 0;  // current tick within the pattern

    struct TrackState {
        int cursor = 0;      // current step index
        int loopCount = 0;   // number of times this track has wrapped
    };
    std::vector<TrackState> trackStates_;
};

} // namespace helm_audio
