#include <doctest/doctest.h>
#include "sequencer.h"

using namespace helm_audio;

// -- Mock listener ------------------------------------------------------------

struct Event {
    enum Type { kNoteOn, kNoteOff, kFadeOut, kLoadPatch, kParamLock };
    Type type;
    uint8_t track;
    uint8_t note;
    uint8_t velocity;
    uint8_t patchIndex;
    ParamLock lock{LockRatio{0.0f}};
};

class MockListener : public SequencerListener {
public:
    std::vector<Event> events;

    void onNoteOn(uint8_t track, uint8_t note, uint8_t velocity) override {
        events.push_back({Event::kNoteOn, track, note, velocity, 0, {}});
    }
    void onNoteOff(uint8_t track) override {
        events.push_back({Event::kNoteOff, track, 0, 0, 0, {}});
    }
    void onFadeOut(uint8_t track) override {
        events.push_back({Event::kFadeOut, track, 0, 0, 0, {}});
    }
    void onLoadPatch(uint8_t track, uint8_t patchIndex) override {
        events.push_back({Event::kLoadPatch, track, 0, 0, patchIndex, {}});
    }
    void onParamLock(uint8_t track, const ParamLock& lock) override {
        events.push_back({Event::kParamLock, track, 0, 0, 0, lock});
    }

    void clear() { events.clear(); }
};

// -- Helpers ------------------------------------------------------------------

// Build a 1-track pattern with steps on track 0.
static Pattern makePattern(std::vector<Step> steps, int length = 16) {
    Pattern p;
    p.length = length;
    p.tracks.resize(1);
    p.tracks[0].steps = std::move(steps);
    return p;
}

// Advance tick-by-tick, collecting events per tick.
static std::vector<std::vector<Event>> advanceAndCollect(
    Sequencer& seq, MockListener& listener, int numTicks) {
    std::vector<std::vector<Event>> result;
    for (int i = 0; i < numTicks; ++i) {
        listener.clear();
        seq.Advance(1);
        result.push_back(listener.events);
    }
    return result;
}

// -- Tests --------------------------------------------------------------------

TEST_CASE("Step through a pattern and verify trigs fire at correct steps") {
    // 4-step pattern: NoteOn on steps 0 and 2, empty on 1 and 3.
    std::vector<Step> steps(4);
    steps[0].trig = NoteOn{60, 100};
    steps[2].trig = NoteOn{64, 80};

    Pattern pattern = makePattern(std::move(steps), 4);
    MockListener listener;
    Sequencer seq;
    seq.Init(&listener, &pattern);

    auto ticks = advanceAndCollect(seq, listener, 24); // 4 steps * 6 ticks

    // Step 0 fires at tick 0.
    REQUIRE(ticks[0].size() == 1);
    CHECK(ticks[0][0].type == Event::kNoteOn);
    CHECK(ticks[0][0].note == 60);

    // Ticks 1-5: silence.
    for (int i = 1; i < 6; ++i) {
        CHECK(ticks[i].empty());
    }

    // Step 1 fires at tick 6 — empty step, no events.
    CHECK(ticks[6].empty());

    // Step 2 fires at tick 12.
    REQUIRE(ticks[12].size() == 1);
    CHECK(ticks[12][0].type == Event::kNoteOn);
    CHECK(ticks[12][0].note == 64);

    // Step 3 fires at tick 18 — empty step, no events.
    CHECK(ticks[18].empty());
}

TEST_CASE("Dispatch order: patch load fires before trig on the same step") {
    std::vector<Step> steps(1);
    steps[0].patchIndex = 5;
    steps[0].trig = NoteOn{60, 100};
    steps[0].locks.push_back(LockRatio{2.0f});

    Pattern pattern = makePattern(std::move(steps), 1);
    MockListener listener;
    Sequencer seq;
    seq.Init(&listener, &pattern);

    seq.Advance(1);

    REQUIRE(listener.events.size() == 3);
    CHECK(listener.events[0].type == Event::kLoadPatch);
    CHECK(listener.events[0].patchIndex == 5);
    CHECK(listener.events[1].type == Event::kNoteOn);
    CHECK(listener.events[2].type == Event::kParamLock);
}

TEST_CASE("Loop: repeating trigs fire again, oneshot trigs don't") {
    std::vector<Step> steps(2);
    steps[0].trig = NoteOn{60, 100};
    steps[0].oneshot = true;
    steps[1].trig = NoteOn{64, 100};

    Pattern pattern = makePattern(std::move(steps), 2);
    MockListener listener;
    Sequencer seq;
    seq.Init(&listener, &pattern);

    // First loop: both fire.
    auto ticks = advanceAndCollect(seq, listener, 12); // 2 steps * 6 ticks
    REQUIRE(ticks[0].size() == 1);
    CHECK(ticks[0][0].note == 60);
    REQUIRE(ticks[6].size() == 1);
    CHECK(ticks[6][0].note == 64);

    // Second loop: only step 1 fires (step 0 is oneshot).
    ticks = advanceAndCollect(seq, listener, 12);
    CHECK(ticks[0].empty());          // oneshot skipped
    REQUIRE(ticks[6].size() == 1);
    CHECK(ticks[6][0].note == 64);    // repeating fires
}

TEST_CASE("Polymetric tracks cycle correctly") {
    Pattern pattern;
    pattern.length = 16; // 96 ticks
    pattern.tracks.resize(2);

    // Track 0: 3 steps (cycle = 18 ticks).
    pattern.tracks[0].steps.resize(3);
    pattern.tracks[0].steps[0].trig = NoteOn{60, 100};
    pattern.tracks[0].steps[1].trig = NoteOn{62, 100};
    pattern.tracks[0].steps[2].trig = NoteOn{64, 100};

    // Track 1: 2 steps (cycle = 12 ticks).
    pattern.tracks[1].steps.resize(2);
    pattern.tracks[1].steps[0].trig = NoteOn{48, 100};
    pattern.tracks[1].steps[1].trig = NoteOn{50, 100};

    MockListener listener;
    Sequencer seq;
    seq.Init(&listener, &pattern);

    auto ticks = advanceAndCollect(seq, listener, 96);

    // Both tracks fire every 6 ticks (one step = 6 ticks).
    // Track 0: 3-step cycle. Notes: 60, 62, 64, 60, 62, 64, ...
    // Track 1: 2-step cycle. Notes: 48, 50, 48, 50, 48, 50, ...
    //
    // Tick 0:  track 0 = 60, track 1 = 48  (2 events)
    // Tick 6:  track 0 = 62, track 1 = 50  (2 events)
    // Tick 12: track 0 = 64, track 1 = 48  (2 events)
    // Tick 18: track 0 = 60, track 1 = 50  (2 events)
    // Tick 24: track 0 = 62, track 1 = 48  (2 events)
    // Tick 30: track 0 = 64, track 1 = 50  (2 events)
    // The combination doesn't repeat until tick 36 (LCM of 18 and 12).

    // Verify all ticks with events have exactly 2.
    for (int t = 0; t < 36; t += 6) {
        REQUIRE(ticks[t].size() == 2);
    }

    // Verify the polymetric phasing — track 0 note sequence.
    CHECK(ticks[0][0].note == 60);
    CHECK(ticks[6][0].note == 62);
    CHECK(ticks[12][0].note == 64);
    CHECK(ticks[18][0].note == 60); // wrapped
    CHECK(ticks[24][0].note == 62);
    CHECK(ticks[30][0].note == 64);

    // Track 1 note sequence.
    CHECK(ticks[0][1].note == 48);
    CHECK(ticks[6][1].note == 50);
    CHECK(ticks[12][1].note == 48); // wrapped
    CHECK(ticks[18][1].note == 50);
    CHECK(ticks[24][1].note == 48); // wrapped
    CHECK(ticks[30][1].note == 50);
}

TEST_CASE("Queue a pending pattern, swap happens at boundary") {
    std::vector<Step> steps1(1);
    steps1[0].trig = NoteOn{60, 100};
    Pattern pattern1 = makePattern(std::move(steps1), 2);

    std::vector<Step> steps2(1);
    steps2[0].trig = NoteOn{72, 100};
    Pattern pattern2 = makePattern(std::move(steps2), 2);

    MockListener listener;
    Sequencer seq;
    seq.Init(&listener, &pattern1);

    // Queue pattern2 mid-loop.
    seq.Advance(3);
    seq.SetPendingPattern(&pattern2);

    // Finish the current loop (2 steps = 12 ticks, already advanced 3).
    listener.clear();
    auto ticks = advanceAndCollect(seq, listener, 9);
    // Step 1 at tick 6 — empty, no events.

    // Now we should be in pattern2. Advance to hear its first step.
    listener.clear();
    seq.Advance(1); // tick 0 of new pattern
    REQUIRE(listener.events.size() == 1);
    CHECK(listener.events[0].note == 72);
}

TEST_CASE("Empty pattern loops silently") {
    Pattern pattern;
    pattern.tracks.resize(1); // 1 track, no steps
    MockListener listener;
    Sequencer seq;
    seq.Init(&listener, &pattern);

    seq.Advance(96); // full 16-step pattern
    CHECK(listener.events.empty());

    // Should still be running, no crash.
    seq.Advance(96);
    CHECK(listener.events.empty());
}

TEST_CASE("Multiple param locks on a single step") {
    std::vector<Step> steps(1);
    steps[0].trig = NoteOn{60, 100};
    steps[0].locks.push_back(LockRatio{2.0f});
    steps[0].locks.push_back(LockFilterFreq{4000.0f});
    steps[0].locks.push_back(LockRelease{0.5f});

    Pattern pattern = makePattern(std::move(steps), 1);
    MockListener listener;
    Sequencer seq;
    seq.Init(&listener, &pattern);

    seq.Advance(1);

    // NoteOn + 3 param locks = 4 events.
    REQUIRE(listener.events.size() == 4);
    CHECK(listener.events[0].type == Event::kNoteOn);
    CHECK(listener.events[1].type == Event::kParamLock);
    CHECK(listener.events[2].type == Event::kParamLock);
    CHECK(listener.events[3].type == Event::kParamLock);

    // Verify lock values.
    CHECK(std::get<LockRatio>(listener.events[1].lock).value == 2.0f);
    CHECK(std::get<LockFilterFreq>(listener.events[2].lock).value == 4000.0f);
    CHECK(std::get<LockRelease>(listener.events[3].lock).value == 0.5f);
}

TEST_CASE("Micro-timing: positive offset fires late, negative fires early") {
    std::vector<Step> steps(3);
    steps[0].trig = NoteOn{60, 100};
    steps[0].microTiming = 0;   // fires at tick 0
    steps[1].trig = NoteOn{62, 100};
    steps[1].microTiming = 3;   // fires at tick 6+3 = 9
    steps[2].trig = NoteOn{64, 100};
    steps[2].microTiming = -2;  // fires at tick 12-2 = 10

    Pattern pattern = makePattern(std::move(steps), 3);
    MockListener listener;
    Sequencer seq;
    seq.Init(&listener, &pattern);

    auto ticks = advanceAndCollect(seq, listener, 18);

    // Step 0 at tick 0.
    REQUIRE(ticks[0].size() == 1);
    CHECK(ticks[0][0].note == 60);

    // Step 1 at tick 9 (grid 6 + offset 3).
    REQUIRE(ticks[9].size() == 1);
    CHECK(ticks[9][0].note == 62);

    // Step 2 at tick 10 (grid 12 - offset 2).
    REQUIRE(ticks[10].size() == 1);
    CHECK(ticks[10][0].note == 64);
}

TEST_CASE("Micro-timing clamping: conflicting offsets clamp correctly") {
    // Step 0 at +5, step 1 at -5. Both want near tick 5 and tick 1.
    // Step 0 fires at tick 5. Step 1 would fire at tick 6-5=1, but that's
    // before step 0's fire tick (5). Clamped to tick 6 (lastFireTick + 1).
    std::vector<Step> steps(2);
    steps[0].trig = NoteOn{60, 100};
    steps[0].microTiming = 5;
    steps[1].trig = NoteOn{64, 100};
    steps[1].microTiming = -5;

    Pattern pattern = makePattern(std::move(steps), 2);
    MockListener listener;
    Sequencer seq;
    seq.Init(&listener, &pattern);

    auto ticks = advanceAndCollect(seq, listener, 12);

    // Step 0 fires at tick 5.
    REQUIRE(ticks[5].size() == 1);
    CHECK(ticks[5][0].note == 60);

    // Step 1 clamped to tick 6 (not tick 1).
    REQUIRE(ticks[6].size() == 1);
    CHECK(ticks[6][0].note == 64);

    // Nothing at tick 1.
    CHECK(ticks[1].empty());
}

TEST_CASE("Swing: every even step offset by +3 ticks") {
    // 4 steps: 0 on grid, 1 late, 2 on grid, 3 late.
    std::vector<Step> steps(4);
    for (int i = 0; i < 4; ++i) {
        steps[i].trig = NoteOn{static_cast<uint8_t>(60 + i), 100};
        steps[i].microTiming = (i % 2 == 1) ? 3 : 0;
    }

    Pattern pattern = makePattern(std::move(steps), 4);
    MockListener listener;
    Sequencer seq;
    seq.Init(&listener, &pattern);

    auto ticks = advanceAndCollect(seq, listener, 24);

    CHECK(!ticks[0].empty());   // step 0: tick 0
    CHECK(!ticks[9].empty());   // step 1: tick 6+3 = 9
    CHECK(!ticks[12].empty());  // step 2: tick 12
    CHECK(!ticks[21].empty());  // step 3: tick 18+3 = 21
}

TEST_CASE("Single-track sequencer works") {
    std::vector<Step> steps(2);
    steps[0].trig = NoteOn{60, 100};
    steps[1].trig = NoteOn{64, 100};

    Pattern pattern = makePattern(std::move(steps), 2);
    MockListener listener;
    Sequencer seq;
    seq.Init(&listener, &pattern);

    auto ticks = advanceAndCollect(seq, listener, 12);

    REQUIRE(ticks[0].size() == 1);
    CHECK(ticks[0][0].note == 60);
    REQUIRE(ticks[6].size() == 1);
    CHECK(ticks[6][0].note == 64);
}
