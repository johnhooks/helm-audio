/**
 * JS port of the C++ sequencer.
 *
 * Caller-driven, clock-agnostic. The caller advances tick-by-tick
 * via advance(). The sequencer steps through the pattern grid and
 * dispatches events through a listener interface.
 *
 * Same algorithm as the C++ version:
 * - Per-track independent cursors (polymetric)
 * - Cursor + peek micro-timing model
 * - Dispatch order: patchLoad -> trig -> paramLocks
 * - Oneshot tracking via loopCount
 * - Pattern queuing with swap at loop boundary
 */

import { assert } from "@helm-audio/lib";
import { type Trig, type PatternData, type Step, type ParamLock } from "@helm-audio/types";

/** Ticks per quarter note. */
export const PPQ = 24;

/** Ticks per sixteenth-note step. */
export const TICKS_PER_STEP = PPQ / 4; // 6

export interface SequencerListener {
	onLoadPatch(track: number, patchIndex: number): void;
	onTrig(track: number, trig: Trig | undefined, locks: ParamLock[] | undefined): void;
}

interface TrackState {
	cursor: number;
	loopCount: number;
}

export class Sequencer {
	#pattern: PatternData | null = null;
	#pendingPattern: PatternData | null = null;
	#listener: SequencerListener;
	#trackStates: TrackState[] = [];
	#tick = 0;

	constructor(listener: SequencerListener) {
		this.#listener = listener;
	}

	getPattern(): PatternData | null {
		return this.#pattern;
	}

	getTick(): number {
		return this.#tick;
	}

	/** Current step index (tick / TICKS_PER_STEP, wraps with pattern). */
	getStep(): number {
		return Math.floor(this.#tick / TICKS_PER_STEP);
	}

	getTrackCursor(trackIndex: number): number {
		return this.#trackStates[trackIndex]?.cursor ?? 0;
	}

	/** Load a pattern immediately (used for initial load). */
	loadPattern(pattern: PatternData): void {
		this.#pattern = pattern;
		this.#pendingPattern = null;
		this.#tick = 0;
		this.#resetTrackStates();
	}

	/** Queue a pattern to swap at the next loop boundary. */
	setPendingPattern(pattern: PatternData): void {
		this.#pendingPattern = pattern;
	}

	/** Advance the sequencer by numTicks. */
	advance(numTicks: number): void {
		if (!this.#pattern) return;

		for (let t = 0; t < numTicks; t++) {
			this.#processTick();
			this.#tick++;
			this.#checkLoopBoundary();
		}
	}

	#processTick(): void {
		const pattern = assert(this.#pattern, "no pattern loaded");

		for (let i = 0; i < pattern.tracks.length; i++) {
			const track = pattern.tracks[i];
			if (track.events.length === 0 && track.stepCount === 0) continue;

			const state = this.#trackStates[i];
			const stepCount = track.stepCount;
			const trackCycleTicks = stepCount * TICKS_PER_STEP;
			const trackTick = this.#tick % trackCycleTicks;
			const grid = state.cursor * TICKS_PER_STEP;

			// 1. Current step — fires on positive/zero micro-timing
			const current = findStep(track.events, state.cursor);
			if (current) {
				const offset = current.microTiming ?? 0;
				if (offset >= 0 && trackTick === grid + offset) {
					if (!(current.oneshot && state.loopCount > 0)) {
						this.#dispatchStep(i, current);
					}
				}
			}

			// 2. Peek next step — fires early on negative micro-timing
			const next = this.#peekNextStep(i, state.cursor, stepCount);
			if (next) {
				const nextOffset = next.microTiming ?? 0;
				if (nextOffset < 0) {
					const peekFireTime = grid + TICKS_PER_STEP + nextOffset;
					if (trackTick === peekFireTime) {
						if (!(next.oneshot && state.loopCount > 0)) {
							this.#dispatchStep(i, next);
						}
					}
				}
			}

			// 3. Advance cursor at next grid boundary
			if (trackTick === grid + TICKS_PER_STEP - 1) {
				state.cursor++;
				if (state.cursor >= stepCount) {
					state.cursor = 0;
					state.loopCount++;
				}
			}
		}
	}

	#peekNextStep(trackIndex: number, cursor: number, stepCount: number): Step | null {
		const pattern = assert(this.#pattern, "no pattern loaded");
		const nextCursor = cursor + 1;

		// Normal: next step in same track
		if (nextCursor < stepCount) {
			return findStep(pattern.tracks[trackIndex].events, nextCursor);
		}

		// At pattern boundary: peek into pending pattern if queued
		if (this.#pendingPattern !== null) {
			if (trackIndex < this.#pendingPattern.tracks.length) {
				const pendingTrack = this.#pendingPattern.tracks[trackIndex];
				if (pendingTrack.events.length > 0) {
					return findStep(pendingTrack.events, 0);
				}
			}
			return null;
		}

		// Same pattern looping: wrap to step 0
		return findStep(pattern.tracks[trackIndex].events, 0);
	}

	#dispatchStep(trackIndex: number, step: Step): void {
		if (step.patchIndex !== undefined) {
			this.#listener.onLoadPatch(trackIndex, step.patchIndex);
		}
		this.#listener.onTrig(trackIndex, step.trig, step.locks);
	}

	#checkLoopBoundary(): void {
		if (!this.#pattern) return;

		const patternTicks = this.#pattern.length * TICKS_PER_STEP;

		if (this.#tick >= patternTicks) {
			if (this.#pendingPattern !== null) {
				// Swap: full state reset
				this.#pattern = this.#pendingPattern;
				this.#pendingPattern = null;
				this.#resetTrackStates();
			} else {
				// Loop: reset cursors, preserve loopCount
				for (const state of this.#trackStates) {
					state.cursor = 0;
				}
			}
			this.#tick = 0;
		}
	}

	#resetTrackStates(): void {
		this.#trackStates = this.#pattern
			? this.#pattern.tracks.map(() => ({ cursor: 0, loopCount: 0 }))
			: [];
	}
}

/** Find a step by stepIndex in a sparse events array. */
function findStep(events: Step[], stepIndex: number): Step | null {
	for (const step of events) {
		if (step.stepIndex === stepIndex) return step;
	}
	return null;
}
