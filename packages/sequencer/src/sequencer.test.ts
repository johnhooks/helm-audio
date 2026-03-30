/**
 * JS port of test_sequencer.cpp.
 *
 * Validates the same behavior as the C++ sequencer:
 * - Step firing at correct ticks
 * - Dispatch order (patch -> trig -> locks)
 * - Oneshot vs repeating
 * - Polymetric tracks
 * - Pattern queuing and swap
 * - Micro-timing (positive, negative, overlapping, same-tick)
 * - Peek across pattern swap boundary
 */

import { describe, it, expect } from "vitest";
import { TrigType, ParamId, type Step, type PatternData, type ParamLock } from "@helm-audio/types";
import { Sequencer, TICKS_PER_STEP, type SequencerListener } from "./sequencer.ts";

// --- Mock listener ---

interface Event {
	type: "noteOn" | "noteOff" | "fadeOut" | "loadPatch" | "paramLock";
	track: number;
	note: number;
	velocity: number;
	patchIndex: number;
	lock: ParamLock | null;
}

class MockListener implements SequencerListener {
	events: Event[] = [];

	onNoteOn(track: number, note: number, velocity: number): void {
		this.events.push({ type: "noteOn", track, note, velocity, patchIndex: 0, lock: null });
	}
	onNoteOff(track: number): void {
		this.events.push({ type: "noteOff", track, note: 0, velocity: 0, patchIndex: 0, lock: null });
	}
	onFadeOut(track: number): void {
		this.events.push({ type: "fadeOut", track, note: 0, velocity: 0, patchIndex: 0, lock: null });
	}
	onLoadPatch(track: number, patchIndex: number): void {
		this.events.push({ type: "loadPatch", track, note: 0, velocity: 0, patchIndex, lock: null });
	}
	onParamLock(track: number, lock: ParamLock): void {
		this.events.push({ type: "paramLock", track, note: 0, velocity: 0, patchIndex: 0, lock });
	}

	clear(): void {
		this.events = [];
	}
}

// --- Helpers ---

/** Build a 1-track pattern from sparse steps. */
function makePattern(steps: Step[], length: number): PatternData {
	return {
		length,
		tracks: [{
			stepCount: length,
			events: steps,
		}],
	};
}

/** Advance tick-by-tick, collecting events per tick. */
function advanceAndCollect(seq: Sequencer, listener: MockListener, numTicks: number): Event[][] {
	const result: Event[][] = [];
	for (let i = 0; i < numTicks; i++) {
		listener.clear();
		seq.advance(1);
		result.push([...listener.events]);
	}
	return result;
}

// --- Tests ---

describe("sequencer", () => {
	it("steps through a pattern and fires trigs at correct steps", () => {
		const steps: Step[] = [
			{ stepIndex: 0, trig: { type: TrigType.NoteOn, note: 60, velocity: 100 } },
			{ stepIndex: 2, trig: { type: TrigType.NoteOn, note: 64, velocity: 80 } },
		];
		const pattern = makePattern(steps, 4);
		const listener = new MockListener();
		const seq = new Sequencer(listener);
		seq.loadPattern(pattern);

		const ticks = advanceAndCollect(seq, listener, 24);

		// Step 0 fires at tick 0
		expect(ticks[0]).toHaveLength(1);
		expect(ticks[0][0].type).toBe("noteOn");
		expect(ticks[0][0].note).toBe(60);

		// Ticks 1-5: silence
		for (let i = 1; i < 6; i++) {
			expect(ticks[i]).toHaveLength(0);
		}

		// Step 1 at tick 6: empty, no events
		expect(ticks[6]).toHaveLength(0);

		// Step 2 fires at tick 12
		expect(ticks[12]).toHaveLength(1);
		expect(ticks[12][0].type).toBe("noteOn");
		expect(ticks[12][0].note).toBe(64);

		// Step 3 at tick 18: empty
		expect(ticks[18]).toHaveLength(0);
	});

	it("dispatches in order: patch load -> trig -> param locks", () => {
		const steps: Step[] = [{
			stepIndex: 0,
			patchIndex: 5,
			trig: { type: TrigType.NoteOn, note: 60, velocity: 100 },
			locks: [{ param: ParamId.Ratio, value: 2.0 }],
		}];
		const pattern = makePattern(steps, 1);
		const listener = new MockListener();
		const seq = new Sequencer(listener);
		seq.loadPattern(pattern);

		seq.advance(1);

		expect(listener.events).toHaveLength(3);
		expect(listener.events[0].type).toBe("loadPatch");
		expect(listener.events[0].patchIndex).toBe(5);
		expect(listener.events[1].type).toBe("noteOn");
		expect(listener.events[2].type).toBe("paramLock");
	});

	it("repeating trigs fire again, oneshot trigs do not", () => {
		const steps: Step[] = [
			{ stepIndex: 0, trig: { type: TrigType.NoteOn, note: 60, velocity: 100 }, oneshot: true },
			{ stepIndex: 1, trig: { type: TrigType.NoteOn, note: 64, velocity: 100 } },
		];
		const pattern = makePattern(steps, 2);
		const listener = new MockListener();
		const seq = new Sequencer(listener);
		seq.loadPattern(pattern);

		// First loop: both fire
		let ticks = advanceAndCollect(seq, listener, 12);
		expect(ticks[0]).toHaveLength(1);
		expect(ticks[0][0].note).toBe(60);
		expect(ticks[6]).toHaveLength(1);
		expect(ticks[6][0].note).toBe(64);

		// Second loop: only step 1 fires
		ticks = advanceAndCollect(seq, listener, 12);
		expect(ticks[0]).toHaveLength(0); // oneshot skipped
		expect(ticks[6]).toHaveLength(1);
		expect(ticks[6][0].note).toBe(64);
	});

	it("polymetric tracks cycle correctly", () => {
		const pattern: PatternData = {
			length: 16,
			tracks: [
				{
					stepCount: 3,
					events: [
						{ stepIndex: 0, trig: { type: TrigType.NoteOn, note: 60, velocity: 100 } },
						{ stepIndex: 1, trig: { type: TrigType.NoteOn, note: 62, velocity: 100 } },
						{ stepIndex: 2, trig: { type: TrigType.NoteOn, note: 64, velocity: 100 } },
					],
				},
				{
					stepCount: 2,
					events: [
						{ stepIndex: 0, trig: { type: TrigType.NoteOn, note: 48, velocity: 100 } },
						{ stepIndex: 1, trig: { type: TrigType.NoteOn, note: 50, velocity: 100 } },
					],
				},
			],
		};
		const listener = new MockListener();
		const seq = new Sequencer(listener);
		seq.loadPattern(pattern);

		const ticks = advanceAndCollect(seq, listener, 96);

		// All step boundaries have 2 events (one per track)
		for (let t = 0; t < 36; t += 6) {
			expect(ticks[t]).toHaveLength(2);
		}

		// Track 0: 3-step cycle
		expect(ticks[0][0].note).toBe(60);
		expect(ticks[6][0].note).toBe(62);
		expect(ticks[12][0].note).toBe(64);
		expect(ticks[18][0].note).toBe(60); // wrapped
		expect(ticks[24][0].note).toBe(62);
		expect(ticks[30][0].note).toBe(64);

		// Track 1: 2-step cycle
		expect(ticks[0][1].note).toBe(48);
		expect(ticks[6][1].note).toBe(50);
		expect(ticks[12][1].note).toBe(48); // wrapped
		expect(ticks[18][1].note).toBe(50);
		expect(ticks[24][1].note).toBe(48); // wrapped
		expect(ticks[30][1].note).toBe(50);
	});

	it("queues a pending pattern, swaps at boundary", () => {
		const pattern1 = makePattern(
			[{ stepIndex: 0, trig: { type: TrigType.NoteOn, note: 60, velocity: 100 } }],
			2,
		);
		const pattern2 = makePattern(
			[{ stepIndex: 0, trig: { type: TrigType.NoteOn, note: 72, velocity: 100 } }],
			2,
		);
		const listener = new MockListener();
		const seq = new Sequencer(listener);
		seq.loadPattern(pattern1);

		// Queue pattern2 mid-loop
		seq.advance(3);
		seq.setPendingPattern(pattern2);

		// Finish current loop (12 ticks total, already advanced 3)
		listener.clear();
		advanceAndCollect(seq, listener, 9);

		// Now in pattern2. Advance to hear first step.
		listener.clear();
		seq.advance(1);
		expect(listener.events).toHaveLength(1);
		expect(listener.events[0].note).toBe(72);
	});

	it("loops empty pattern silently", () => {
		const pattern: PatternData = {
			length: 16,
			tracks: [{ stepCount: 0, events: [] }],
		};
		const listener = new MockListener();
		const seq = new Sequencer(listener);
		seq.loadPattern(pattern);

		seq.advance(96);
		expect(listener.events).toHaveLength(0);

		seq.advance(96);
		expect(listener.events).toHaveLength(0);
	});

	it("dispatches multiple param locks on a single step", () => {
		const steps: Step[] = [{
			stepIndex: 0,
			trig: { type: TrigType.NoteOn, note: 60, velocity: 100 },
			locks: [
				{ param: ParamId.Ratio, value: 2.0 },
				{ param: ParamId.FilterFreq, value: 4000.0 },
				{ param: ParamId.Release, value: 0.5 },
			],
		}];
		const pattern = makePattern(steps, 1);
		const listener = new MockListener();
		const seq = new Sequencer(listener);
		seq.loadPattern(pattern);

		seq.advance(1);

		expect(listener.events).toHaveLength(4);
		expect(listener.events[0].type).toBe("noteOn");
		expect(listener.events[1].type).toBe("paramLock");
		expect(listener.events[2].type).toBe("paramLock");
		expect(listener.events[3].type).toBe("paramLock");

		expect(listener.events[1].lock!.param).toBe(ParamId.Ratio);
		expect(listener.events[1].lock!.value).toBe(2.0);
		expect(listener.events[2].lock!.param).toBe(ParamId.FilterFreq);
		expect(listener.events[2].lock!.value).toBe(4000.0);
		expect(listener.events[3].lock!.param).toBe(ParamId.Release);
		expect(listener.events[3].lock!.value).toBe(0.5);
	});

	it("micro-timing: positive offset fires late, negative fires early", () => {
		const steps: Step[] = [
			{ stepIndex: 0, trig: { type: TrigType.NoteOn, note: 60, velocity: 100 }, microTiming: 0 },
			{ stepIndex: 1, trig: { type: TrigType.NoteOn, note: 62, velocity: 100 }, microTiming: 3 },
			{ stepIndex: 2, trig: { type: TrigType.NoteOn, note: 64, velocity: 100 }, microTiming: -2 },
		];
		const pattern = makePattern(steps, 3);
		const listener = new MockListener();
		const seq = new Sequencer(listener);
		seq.loadPattern(pattern);

		const ticks = advanceAndCollect(seq, listener, 18);

		// Step 0 at tick 0
		expect(ticks[0]).toHaveLength(1);
		expect(ticks[0][0].note).toBe(60);

		// Step 1 at tick 9 (grid 6 + offset 3)
		expect(ticks[9]).toHaveLength(1);
		expect(ticks[9][0].note).toBe(62);

		// Step 2 at tick 10 (peeked: grid 6 + 6 + (-2) = 10)
		expect(ticks[10]).toHaveLength(1);
		expect(ticks[10][0].note).toBe(64);
	});

	it("overlapping offsets: current +5 and next -5 both fire", () => {
		const steps: Step[] = [
			{ stepIndex: 0, trig: { type: TrigType.NoteOn, note: 60, velocity: 100 }, microTiming: 5 },
			{ stepIndex: 1, trig: { type: TrigType.NoteOn, note: 64, velocity: 100 }, microTiming: -5 },
		];
		const pattern = makePattern(steps, 2);
		const listener = new MockListener();
		const seq = new Sequencer(listener);
		seq.loadPattern(pattern);

		const ticks = advanceAndCollect(seq, listener, 12);

		// Step 1 peeked at tick 1 (grid 0 + 6 + (-5) = 1)
		expect(ticks[1]).toHaveLength(1);
		expect(ticks[1][0].note).toBe(64);

		// Step 0 at tick 5 (grid 0 + 5)
		expect(ticks[5]).toHaveLength(1);
		expect(ticks[5][0].note).toBe(60);
	});

	it("same-tick dispatch: current fires before peek", () => {
		const steps: Step[] = [
			{ stepIndex: 0, trig: { type: TrigType.NoteOn, note: 60, velocity: 100 }, microTiming: 3 },
			{ stepIndex: 1, trig: { type: TrigType.NoteOn, note: 64, velocity: 100 }, microTiming: -3 },
		];
		const pattern = makePattern(steps, 2);
		const listener = new MockListener();
		const seq = new Sequencer(listener);
		seq.loadPattern(pattern);

		const ticks = advanceAndCollect(seq, listener, 12);

		// Both fire at tick 3. Current first, then peek.
		expect(ticks[3]).toHaveLength(2);
		expect(ticks[3][0].note).toBe(60);
		expect(ticks[3][1].note).toBe(64);
	});

	it("negative offset on step 0 skips first loop, fires on subsequent", () => {
		const steps: Step[] = [
			{ stepIndex: 0, trig: { type: TrigType.NoteOn, note: 60, velocity: 100 }, microTiming: -3 },
			{ stepIndex: 1, trig: { type: TrigType.NoteOn, note: 64, velocity: 100 }, microTiming: 0 },
		];
		const pattern = makePattern(steps, 2);
		const listener = new MockListener();
		const seq = new Sequencer(listener);
		seq.loadPattern(pattern);

		// First loop: step 0 doesn't fire (no previous step to peek from)
		let ticks = advanceAndCollect(seq, listener, 12);
		expect(ticks[6]).toHaveLength(1);
		expect(ticks[6][0].note).toBe(64);

		// Second loop: step 0 peeked by step 1, fires at tick 9
		ticks = advanceAndCollect(seq, listener, 12);
		expect(ticks[9]).toHaveLength(1);
		expect(ticks[9][0].note).toBe(60);
		expect(ticks[6]).toHaveLength(1);
		expect(ticks[6][0].note).toBe(64);
	});

	it("peeks across pattern swap boundary", () => {
		const pattern1 = makePattern(
			[{ stepIndex: 0, trig: { type: TrigType.NoteOn, note: 60, velocity: 100 } }],
			1,
		);
		const pattern2 = makePattern(
			[{ stepIndex: 0, trig: { type: TrigType.NoteOn, note: 72, velocity: 100 }, microTiming: -3 }],
			1,
		);
		const listener = new MockListener();
		const seq = new Sequencer(listener);
		seq.loadPattern(pattern1);
		seq.setPendingPattern(pattern2);

		const ticks = advanceAndCollect(seq, listener, 6);

		// Step 0 of pattern1 at tick 0
		expect(ticks[0]).toHaveLength(1);
		expect(ticks[0][0].note).toBe(60);

		// Step 0 of pattern2 peeked at tick 3 (0 + 6 + (-3))
		expect(ticks[3]).toHaveLength(1);
		expect(ticks[3][0].note).toBe(72);
	});

	it("pattern swap with different track count", () => {
		const pattern1: PatternData = {
			length: 1,
			tracks: [
				{ stepCount: 1, events: [{ stepIndex: 0, trig: { type: TrigType.NoteOn, note: 60, velocity: 100 } }] },
				{ stepCount: 1, events: [{ stepIndex: 0, trig: { type: TrigType.NoteOn, note: 48, velocity: 100 } }] },
			],
		};
		const pattern2: PatternData = {
			length: 1,
			tracks: [
				{ stepCount: 1, events: [{ stepIndex: 0, trig: { type: TrigType.NoteOn, note: 72, velocity: 100 }, microTiming: -2 }] },
			],
		};
		const listener = new MockListener();
		const seq = new Sequencer(listener);
		seq.loadPattern(pattern1);
		seq.setPendingPattern(pattern2);

		const ticks = advanceAndCollect(seq, listener, 6);

		// Both tracks fire at tick 0
		expect(ticks[0]).toHaveLength(2);

		// Pattern 2 step 0 peeked on track 0 at tick 4 (0 + 6 + (-2))
		expect(ticks[4]).toHaveLength(1);
		expect(ticks[4][0].note).toBe(72);
	});

	it("swing: odd steps offset by +3 ticks", () => {
		const steps: Step[] = [
			{ stepIndex: 0, trig: { type: TrigType.NoteOn, note: 60, velocity: 100 }, microTiming: 0 },
			{ stepIndex: 1, trig: { type: TrigType.NoteOn, note: 61, velocity: 100 }, microTiming: 3 },
			{ stepIndex: 2, trig: { type: TrigType.NoteOn, note: 62, velocity: 100 }, microTiming: 0 },
			{ stepIndex: 3, trig: { type: TrigType.NoteOn, note: 63, velocity: 100 }, microTiming: 3 },
		];
		const pattern = makePattern(steps, 4);
		const listener = new MockListener();
		const seq = new Sequencer(listener);
		seq.loadPattern(pattern);

		const ticks = advanceAndCollect(seq, listener, 24);

		expect(ticks[0]).toHaveLength(1);   // step 0: tick 0
		expect(ticks[9]).toHaveLength(1);   // step 1: tick 6+3 = 9
		expect(ticks[12]).toHaveLength(1);  // step 2: tick 12
		expect(ticks[21]).toHaveLength(1);  // step 3: tick 18+3 = 21
	});

	it("single-track pattern works", () => {
		const steps: Step[] = [
			{ stepIndex: 0, trig: { type: TrigType.NoteOn, note: 60, velocity: 100 } },
			{ stepIndex: 1, trig: { type: TrigType.NoteOn, note: 64, velocity: 100 } },
		];
		const pattern = makePattern(steps, 2);
		const listener = new MockListener();
		const seq = new Sequencer(listener);
		seq.loadPattern(pattern);

		const ticks = advanceAndCollect(seq, listener, 12);

		expect(ticks[0]).toHaveLength(1);
		expect(ticks[0][0].note).toBe(60);
		expect(ticks[6]).toHaveLength(1);
		expect(ticks[6][0].note).toBe(64);
	});

	it("noteOff and fadeOut trig types dispatch correctly", () => {
		const steps: Step[] = [
			{ stepIndex: 0, trig: { type: TrigType.NoteOn, note: 60, velocity: 100 } },
			{ stepIndex: 1, trig: { type: TrigType.NoteOff } },
			{ stepIndex: 2, trig: { type: TrigType.FadeOut } },
		];
		const pattern = makePattern(steps, 3);
		const listener = new MockListener();
		const seq = new Sequencer(listener);
		seq.loadPattern(pattern);

		const ticks = advanceAndCollect(seq, listener, 18);

		expect(ticks[0][0].type).toBe("noteOn");
		expect(ticks[6][0].type).toBe("noteOff");
		expect(ticks[12][0].type).toBe("fadeOut");
	});
});
