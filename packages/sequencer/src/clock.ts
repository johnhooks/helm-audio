/**
 * Lookahead clock for the sequencer worker.
 *
 * Runs a setInterval loop that converts elapsed wall-clock time
 * into sequencer ticks. Calls the tick callback for each tick
 * that should have elapsed since the last interval.
 *
 * Uses performance.now() for timing. Accumulates fractional ticks
 * to preserve timing precision across intervals (same approach
 * as the C++ synth's tickAccum_).
 */

import { PPQ } from "./sequencer.ts";

export interface ClockOptions {
	/** Called for each tick that elapses. */
	onTick: () => void;
	/** Called once per scheduler interval after all ticks are processed. */
	onStep?: (elapsedTicks: number) => void;
	/** Scheduler interval in ms. Default 5. */
	intervalMs?: number;
}

export class Clock {
	#bpm = 120;
	#tickAccum = 0;
	#lastTime = 0;
	#timerId: ReturnType<typeof setInterval> | null = null;
	#onTick: () => void;
	#onStep?: (elapsedTicks: number) => void;
	#intervalMs: number;

	constructor(options: ClockOptions) {
		this.#onTick = options.onTick;
		this.#onStep = options.onStep;
		this.#intervalMs = options.intervalMs ?? 5;
	}

	setBpm(bpm: number): void {
		this.#bpm = bpm;
	}

	getBpm(): number {
		return this.#bpm;
	}

	start(): void {
		if (this.#timerId !== null) return;
		this.#tickAccum = 0;
		this.#lastTime = performance.now();
		this.#timerId = setInterval(this.#process, this.#intervalMs);
	}

	stop(): void {
		if (this.#timerId !== null) {
			clearInterval(this.#timerId);
			this.#timerId = null;
		}
		this.#tickAccum = 0;
	}

	isRunning(): boolean {
		return this.#timerId !== null;
	}

	#process = (): void => {
		const now = performance.now();
		const elapsedMs = now - this.#lastTime;
		this.#lastTime = now;

		// Convert elapsed time to ticks
		// ticks/sec = (bpm / 60) * PPQ
		const ticksPerMs = (this.#bpm / 60_000) * PPQ;
		this.#tickAccum += elapsedMs * ticksPerMs;

		// Process whole ticks
		let ticksProcessed = 0;
		while (this.#tickAccum >= 1) {
			this.#onTick();
			this.#tickAccum -= 1;
			ticksProcessed++;
		}

		if (ticksProcessed > 0 && this.#onStep) {
			this.#onStep(ticksProcessed);
		}
	};
}
