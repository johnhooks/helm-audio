import { LfoWaveform, type BusSetup } from "@helm-audio/protocol";
import type { fm4 } from "@helm-audio/types";
import {
	DEFAULT_OCTAVE,
	DEFAULT_PATTERN_LENGTH,
	DEFAULT_STEP_COUNT,
	DEFAULT_STEP_SIZE,
	DEFAULT_TEMPO,
	MAX_PATTERNS,
} from "./constants.ts";
import { Page, StepField, type TrackerState } from "./types.ts";

// --- Default patch helper ---

const DEFAULT_LFO: fm4.LfoConfig = {
	rate: 1.0,
	waveform: LfoWaveform.Sine,
	routes: [],
};

function patch(
	name: string,
	p: Partial<fm4.Patch> & { operators: fm4.Patch["operators"] },
): { name: string; patch: fm4.Patch } {
	return {
		name,
		patch: {
			algorithm: 4,
			index: 1.0,
			feedback: 0.0,
			envA: { attack: 0.01, decay: 0.1, sustain: 1.0, release: 0.3 },
			envB: { attack: 0.01, decay: 0.1, sustain: 1.0, release: 0.3 },
			ampEnv: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 },
			filterFreq: 8000,
			filterRes: 0,
			sends: [0, 0, 0, 0],
			lfos: [{ ...DEFAULT_LFO }, { ...DEFAULT_LFO }],
			...p,
		},
	};
}

// --- 8 default patches ---

const DEFAULTS = [
	patch("bass", {
		operators: [
			{ ratio: 1.0, detune: 0, level: 0.9 },
			{ ratio: 1.0, detune: 0, level: 0.8 },
			{ ratio: 1.0, detune: 0, level: 0.5 },
			{ ratio: 1.0, detune: 0, level: 0.7 },
		],
		algorithm: 0,
		index: 1.2,
		envA: { attack: 0.001, decay: 0.2, sustain: 0.0, release: 0.1 },
		envB: { attack: 0.001, decay: 0.15, sustain: 0.0, release: 0.1 },
		ampEnv: { attack: 0.001, decay: 0.3, sustain: 0.0, release: 0.15 },
		filterFreq: 2000,
	}),
	patch("keys", {
		operators: [
			{ ratio: 1.0, detune: 0, level: 0.8 },
			{ ratio: 1.0, detune: 0, level: 0.7 },
			{ ratio: 3.0, detune: 0, level: 0.4 },
			{ ratio: 1.0, detune: 0, level: 0.7 },
		],
		algorithm: 4,
		index: 1.8,
		envA: { attack: 0.001, decay: 0.5, sustain: 0.0, release: 0.2 },
		envB: { attack: 0.001, decay: 0.3, sustain: 0.0, release: 0.2 },
		ampEnv: { attack: 0.001, decay: 0.6, sustain: 0.0, release: 0.3 },
	}),
	patch("pad", {
		operators: [
			{ ratio: 1.0, detune: 0, level: 0.6 },
			{ ratio: 1.0, detune: 0, level: 0.5 },
			{ ratio: 2.0, detune: 1.5, level: 0.4 },
			{ ratio: 3.0, detune: -0.8, level: 0.3 },
		],
		algorithm: 5,
		index: 0.8,
		feedback: 0.1,
		envA: { attack: 0.8, decay: 2.0, sustain: 0.3, release: 3.0 },
		envB: { attack: 0.5, decay: 1.0, sustain: 0.0, release: 2.0 },
		ampEnv: { attack: 1.0, decay: 1.0, sustain: 0.6, release: 3.0 },
		filterFreq: 3000,
		filterRes: 0.15,
	}),
	patch("lead", {
		operators: [
			{ ratio: 1.0, detune: 0, level: 0.9 },
			{ ratio: 1.0, detune: 0, level: 0.8 },
			{ ratio: 2.0, detune: 0, level: 0.6 },
			{ ratio: 1.0, detune: 0, level: 0.7 },
		],
		algorithm: 3,
		index: 2.5,
		feedback: 0.2,
		envA: { attack: 0.001, decay: 0.4, sustain: 0.2, release: 0.2 },
		envB: { attack: 0.001, decay: 0.3, sustain: 0.1, release: 0.2 },
		ampEnv: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.3 },
	}),
	patch("bell", {
		operators: [
			{ ratio: 1.0, detune: 0, level: 0.7 },
			{ ratio: 1.0, detune: 0, level: 0.6 },
			{ ratio: 3.5, detune: 0, level: 0.5 },
			{ ratio: 1.0, detune: 0, level: 0.5 },
		],
		algorithm: 4,
		index: 2.0,
		envA: { attack: 0.001, decay: 1.5, sustain: 0.0, release: 2.0 },
		envB: { attack: 0.001, decay: 0.8, sustain: 0.0, release: 1.5 },
		ampEnv: { attack: 0.001, decay: 0.3, sustain: 0.0, release: 3.0 },
		filterFreq: 6000,
	}),
	patch("perc", {
		operators: [
			{ ratio: 1.0, detune: 0, level: 1.0 },
			{ ratio: 1.0, detune: 0, level: 0.8 },
			{ ratio: 1.41, detune: 0, level: 0.7 },
			{ ratio: 1.0, detune: 0, level: 0.6 },
		],
		algorithm: 0,
		index: 3.0,
		feedback: 0.3,
		envA: { attack: 0.001, decay: 0.05, sustain: 0.0, release: 0.05 },
		envB: { attack: 0.001, decay: 0.03, sustain: 0.0, release: 0.03 },
		ampEnv: { attack: 0.001, decay: 0.1, sustain: 0.0, release: 0.1 },
		filterFreq: 5000,
	}),
	patch("string", {
		operators: [
			{ ratio: 1.0, detune: 0, level: 0.7 },
			{ ratio: 1.0, detune: 0.3, level: 0.6 },
			{ ratio: 1.0, detune: 0, level: 0.5 },
			{ ratio: 1.0, detune: -0.3, level: 0.5 },
		],
		algorithm: 6,
		index: 0.6,
		envA: { attack: 0.3, decay: 0.5, sustain: 0.4, release: 0.5 },
		envB: { attack: 0.2, decay: 0.3, sustain: 0.0, release: 0.3 },
		ampEnv: { attack: 0.2, decay: 0.3, sustain: 0.7, release: 0.5 },
		filterFreq: 4000,
		filterRes: 0.1,
	}),
	patch("sub", {
		operators: [
			{ ratio: 1.0, detune: 0, level: 1.0 },
			{ ratio: 1.0, detune: 0, level: 0.8 },
			{ ratio: 1.0, detune: 0, level: 0.0 },
			{ ratio: 1.0, detune: 0, level: 0.0 },
		],
		algorithm: 7,
		index: 0.0,
		ampEnv: { attack: 0.01, decay: 0.1, sustain: 0.9, release: 0.3 },
		filterFreq: 1000,
	}),
];

export const DEFAULT_BUSES: BusSetup = [{ slots: [] }, { slots: [] }, { slots: [] }, { slots: [] }];

// --- Initial state ---

export function createInitialState(numTracks = 8): TrackerState {
	const patterns: (null | { length: number; tracks: { stepCount: number; events: [] }[] })[] =
		new Array<null>(MAX_PATTERNS).fill(null);
	patterns[0] = {
		length: DEFAULT_PATTERN_LENGTH,
		tracks: Array.from({ length: numTracks }, () => ({
			stepCount: DEFAULT_STEP_COUNT,
			events: [],
		})),
	};

	return {
		page: Page.Sequence,
		cursor: { row: 0, col: 0, field: StepField.Note },
		scrollRow: 0,

		playing: false,
		tempo: DEFAULT_TEMPO,
		playbackStep: 0,
		activePatternIndex: 0,
		follow: true,

		editMode: true,
		octave: DEFAULT_OCTAVE,
		stepSize: DEFAULT_STEP_SIZE,
		currentPatchIndex: 0,
		editMask: { note: true, velocity: true, patch: true, locks: true },

		patterns,
		currentBank: 0,

		patches: DEFAULTS.map((d) => ({ ...d.patch })),
		patchNames: DEFAULTS.map((d) => d.name),

		buses: DEFAULT_BUSES,

		chain: [],
		chainLoop: true,
		chainPosition: 0,
		queuedPatternIndex: null,

		selection: null,
		clipboard: null,
		undoStack: [],
		redoStack: [],
	};
}
