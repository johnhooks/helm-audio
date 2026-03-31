/**
 * JS port of test_sequencer.cpp.
 *
 * Validates the same behavior as the C++ sequencer:
 * - Step firing at correct ticks
 * - Dispatch order (patch -> trig+locks)
 * - Oneshot vs repeating
 * - Polymetric tracks
 * - Pattern queuing and swap
 * - Micro-timing (positive, negative, overlapping, same-tick)
 * - Peek across pattern swap boundary
 */

import { describe, it, expect } from "vitest";
import {
	TrigType,
	ParamId,
	type Trig,
	type Step,
	type PatternData,
	type ParamLock,
} from "@helm-audio/types";
import { Sequencer, type SequencerListener } from "./sequencer.ts";

// --- Mock listener ---

interface Event {
	type: "loadPatch" | "trig";
	track: number;
	trig?: Trig;
	locks?: ParamLock[];
	patchIndex?: number;
}

class MockListener implements SequencerListener {
	events: Event[] = [];

	onLoadPatch(track: number, patchIndex: number): void {
		this.events.push({ type: "loadPatch", track, patchIndex });
	}

	onTrig(track: number, trig: Trig | undefined, locks: ParamLock[] | undefined): void {
		this.events.push({ type: "trig", track, trig, locks });
	}

	clear(): void {
		this.events = [];
	}

	/** Assert that a trig event at the given index is a NoteOn with the expected note. */
	expectNoteOn(index: number, note: number): void {
		const event = this.events[index];
		expect(event.type).toBe("trig");
		expect(event.trig?.type).toBe(TrigType.NoteOn);
		if (event.trig?.type === TrigType.NoteOn) {
			expect(event.trig.note).toBe(note);
		}
	}

	/** Assert that a trig event at the given index has the expected lock. */
	expectLock(eventIndex: number, lockIndex: number, param: ParamId, value: number): void {
		const event = this.events[eventIndex];
		expect(event.type).toBe("trig");
		const lock = event.locks?.[lockIndex];
		if (!lock) throw new Error(`expected lock at index ${String(lockIndex)}`);
		expect(lock.param).toBe(param);
		expect(lock.value).toBe(value);
	}
}

// --- Helpers ---

/** Build a 1-track pattern from sparse steps. */
function makePattern(steps: Step[], length: number): PatternData {
	return {
		length,
		tracks: [
			{
				stepCount: length,
				events: steps,
			},
		],
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
		listener.events = ticks[0];
		listener.expectNoteOn(0, 60);

		// Ticks 1-5: silence
		for (let i = 1; i < 6; i++) {
			expect(ticks[i]).toHaveLength(0);
		}

		// Step 1 at tick 6: empty step, still dispatches trig event (no trig, no locks)
		// The sequencer always calls onTrig for every step that has an event entry

		// Step 2 fires at tick 12
		expect(ticks[12]).toHaveLength(1);
		listener.events = ticks[12];
		listener.expectNoteOn(0, 64);

		// Step 3 at tick 18: empty
		expect(ticks[18]).toHaveLength(0);
	});

	it("dispatches in order: patch load then trig+locks", () => {
		const steps: Step[] = [
			{
				stepIndex: 0,
				patchIndex: 5,
				trig: { type: TrigType.NoteOn, note: 60, velocity: 100 },
				locks: [{ param: ParamId.Ratio, value: 2.0 }],
			},
		];
		const pattern = makePattern(steps, 1);
		const listener = new MockListener();
		const seq = new Sequencer(listener);
		seq.loadPattern(pattern);

		seq.advance(1);

		// 2 events: loadPatch then trig (with locks bundled)
		expect(listener.events).toHaveLength(2);
		expect(listener.events[0].type).toBe("loadPatch");
		expect(listener.events[0].patchIndex).toBe(5);
		expect(listener.events[1].type).toBe("trig");
		expect(listener.events[1].trig?.type).toBe(TrigType.NoteOn);
		expect(listener.events[1].locks).toHaveLength(1);
		listener.expectLock(1, 0, ParamId.Ratio, 2.0);
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
		expect(ticks[0][0].trig?.type).toBe(TrigType.NoteOn);
		if (ticks[0][0].trig?.type === TrigType.NoteOn) {
			expect(ticks[0][0].trig.note).toBe(60);
		}
		expect(ticks[6]).toHaveLength(1);
		if (ticks[6][0].trig?.type === TrigType.NoteOn) {
			expect(ticks[6][0].trig.note).toBe(64);
		}

		// Second loop: only step 1 fires
		ticks = advanceAndCollect(seq, listener, 12);
		expect(ticks[0]).toHaveLength(0); // oneshot skipped
		expect(ticks[6]).toHaveLength(1);
		if (ticks[6][0].trig?.type === TrigType.NoteOn) {
			expect(ticks[6][0].trig.note).toBe(64);
		}
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

		// Helper to get note from a trig event
		const noteOf = (e: Event): number => {
			if (e.trig?.type === TrigType.NoteOn) return e.trig.note;
			throw new Error("expected NoteOn");
		};

		// Track 0: 3-step cycle
		expect(noteOf(ticks[0][0])).toBe(60);
		expect(noteOf(ticks[6][0])).toBe(62);
		expect(noteOf(ticks[12][0])).toBe(64);
		expect(noteOf(ticks[18][0])).toBe(60); // wrapped
		expect(noteOf(ticks[24][0])).toBe(62);
		expect(noteOf(ticks[30][0])).toBe(64);

		// Track 1: 2-step cycle
		expect(noteOf(ticks[0][1])).toBe(48);
		expect(noteOf(ticks[6][1])).toBe(50);
		expect(noteOf(ticks[12][1])).toBe(48); // wrapped
		expect(noteOf(ticks[18][1])).toBe(50);
		expect(noteOf(ticks[24][1])).toBe(48); // wrapped
		expect(noteOf(ticks[30][1])).toBe(50);
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
		expect(listener.events[0].trig?.type).toBe(TrigType.NoteOn);
		if (listener.events[0].trig?.type === TrigType.NoteOn) {
			expect(listener.events[0].trig.note).toBe(72);
		}
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

	it("dispatches trig with multiple param locks bundled", () => {
		const steps: Step[] = [
			{
				stepIndex: 0,
				trig: { type: TrigType.NoteOn, note: 60, velocity: 100 },
				locks: [
					{ param: ParamId.Ratio, value: 2.0 },
					{ param: ParamId.FilterFreq, value: 4000.0 },
					{ param: ParamId.Release, value: 0.5 },
				],
			},
		];
		const pattern = makePattern(steps, 1);
		const listener = new MockListener();
		const seq = new Sequencer(listener);
		seq.loadPattern(pattern);

		seq.advance(1);

		// Single trig event with trig + 3 locks
		expect(listener.events).toHaveLength(1);
		expect(listener.events[0].type).toBe("trig");
		expect(listener.events[0].trig?.type).toBe(TrigType.NoteOn);
		expect(listener.events[0].locks).toHaveLength(3);
		listener.expectLock(0, 0, ParamId.Ratio, 2.0);
		listener.expectLock(0, 1, ParamId.FilterFreq, 4000.0);
		listener.expectLock(0, 2, ParamId.Release, 0.5);
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

		const noteOf = (e: Event): number => {
			if (e.trig?.type === TrigType.NoteOn) return e.trig.note;
			throw new Error("expected NoteOn");
		};

		// Step 0 at tick 0
		expect(ticks[0]).toHaveLength(1);
		expect(noteOf(ticks[0][0])).toBe(60);

		// Step 1 at tick 9 (grid 6 + offset 3)
		expect(ticks[9]).toHaveLength(1);
		expect(noteOf(ticks[9][0])).toBe(62);

		// Step 2 at tick 10 (peeked: grid 6 + 6 + (-2) = 10)
		expect(ticks[10]).toHaveLength(1);
		expect(noteOf(ticks[10][0])).toBe(64);
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

		const noteOf = (e: Event): number => {
			if (e.trig?.type === TrigType.NoteOn) return e.trig.note;
			throw new Error("expected NoteOn");
		};

		// Step 1 peeked at tick 1 (grid 0 + 6 + (-5) = 1)
		expect(ticks[1]).toHaveLength(1);
		expect(noteOf(ticks[1][0])).toBe(64);

		// Step 0 at tick 5 (grid 0 + 5)
		expect(ticks[5]).toHaveLength(1);
		expect(noteOf(ticks[5][0])).toBe(60);
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

		const noteOf = (e: Event): number => {
			if (e.trig?.type === TrigType.NoteOn) return e.trig.note;
			throw new Error("expected NoteOn");
		};

		// Both fire at tick 3. Current first, then peek.
		expect(ticks[3]).toHaveLength(2);
		expect(noteOf(ticks[3][0])).toBe(60);
		expect(noteOf(ticks[3][1])).toBe(64);
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

		const noteOf = (e: Event): number => {
			if (e.trig?.type === TrigType.NoteOn) return e.trig.note;
			throw new Error("expected NoteOn");
		};

		// First loop: step 0 doesn't fire (no previous step to peek from)
		let ticks = advanceAndCollect(seq, listener, 12);
		expect(ticks[6]).toHaveLength(1);
		expect(noteOf(ticks[6][0])).toBe(64);

		// Second loop: step 0 peeked by step 1, fires at tick 9
		ticks = advanceAndCollect(seq, listener, 12);
		expect(ticks[9]).toHaveLength(1);
		expect(noteOf(ticks[9][0])).toBe(60);
		expect(ticks[6]).toHaveLength(1);
		expect(noteOf(ticks[6][0])).toBe(64);
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

		const noteOf = (e: Event): number => {
			if (e.trig?.type === TrigType.NoteOn) return e.trig.note;
			throw new Error("expected NoteOn");
		};

		// Step 0 of pattern1 at tick 0
		expect(ticks[0]).toHaveLength(1);
		expect(noteOf(ticks[0][0])).toBe(60);

		// Step 0 of pattern2 peeked at tick 3 (0 + 6 + (-3))
		expect(ticks[3]).toHaveLength(1);
		expect(noteOf(ticks[3][0])).toBe(72);
	});

	it("pattern swap with different track count", () => {
		const pattern1: PatternData = {
			length: 1,
			tracks: [
				{
					stepCount: 1,
					events: [{ stepIndex: 0, trig: { type: TrigType.NoteOn, note: 60, velocity: 100 } }],
				},
				{
					stepCount: 1,
					events: [{ stepIndex: 0, trig: { type: TrigType.NoteOn, note: 48, velocity: 100 } }],
				},
			],
		};
		const pattern2: PatternData = {
			length: 1,
			tracks: [
				{
					stepCount: 1,
					events: [
						{
							stepIndex: 0,
							trig: { type: TrigType.NoteOn, note: 72, velocity: 100 },
							microTiming: -2,
						},
					],
				},
			],
		};
		const listener = new MockListener();
		const seq = new Sequencer(listener);
		seq.loadPattern(pattern1);
		seq.setPendingPattern(pattern2);

		const ticks = advanceAndCollect(seq, listener, 6);

		const noteOf = (e: Event): number => {
			if (e.trig?.type === TrigType.NoteOn) return e.trig.note;
			throw new Error("expected NoteOn");
		};

		// Both tracks fire at tick 0
		expect(ticks[0]).toHaveLength(2);

		// Pattern 2 step 0 peeked on track 0 at tick 4 (0 + 6 + (-2))
		expect(ticks[4]).toHaveLength(1);
		expect(noteOf(ticks[4][0])).toBe(72);
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

		expect(ticks[0]).toHaveLength(1); // step 0: tick 0
		expect(ticks[9]).toHaveLength(1); // step 1: tick 6+3 = 9
		expect(ticks[12]).toHaveLength(1); // step 2: tick 12
		expect(ticks[21]).toHaveLength(1); // step 3: tick 18+3 = 21
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

		const noteOf = (e: Event): number => {
			if (e.trig?.type === TrigType.NoteOn) return e.trig.note;
			throw new Error("expected NoteOn");
		};

		expect(ticks[0]).toHaveLength(1);
		expect(noteOf(ticks[0][0])).toBe(60);
		expect(ticks[6]).toHaveLength(1);
		expect(noteOf(ticks[6][0])).toBe(64);
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

		expect(ticks[0][0].trig?.type).toBe(TrigType.NoteOn);
		expect(ticks[6][0].trig?.type).toBe(TrigType.NoteOff);
		expect(ticks[12][0].trig?.type).toBe(TrigType.FadeOut);
	});
});
