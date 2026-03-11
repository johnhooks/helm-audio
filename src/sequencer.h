#pragma once

#include <array>
#include <cstdint>
#include <optional>
#include <variant>
#include <vector>

namespace helm_audio {

static constexpr int kNumTracks = 16;
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
    int8_t microTiming = 0;  // tick offset from grid position (-6 to +5)
    bool oneshot = false;
};

/// A single track in a pattern. Each track has its own step count
/// (polymetric — like Elektron sequencers).
struct Track {
    std::vector<Step> steps;
};

/// A pattern: 16 tracks, each with independent step counts.
/// Tracks shorter than `length` cycle within the pattern.
struct Pattern {
    std::array<Track, kNumTracks> tracks;
    int length = 16;  // pattern length in steps (sixteenth notes)
    bool loop = true;
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

} // namespace helm_audio
