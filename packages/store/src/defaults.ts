import {
	LfoWaveform,
	type BusSetup,
	type LfoConfig,
	type OperatorPatch,
	type Patch,
} from "@helm-audio/protocol";
import {
	DEFAULT_OCTAVE,
	DEFAULT_PATTERN_LENGTH,
	DEFAULT_STEP_COUNT,
	DEFAULT_STEP_SIZE,
	DEFAULT_TEMPO,
	MAX_PATTERNS,
} from "./constants.ts";
import { Page, StepField, type TrackerState } from "./types.ts";

// --- Default structures ---

export const DEFAULT_OPERATOR: OperatorPatch = {
	ratio: 1.0,
	detune: 0,
	level: 1.0,
	feedback: 0,
	attack: 0.01,
	decay: 0.1,
	sustain: 1.0,
	release: 0.3,
};

export const DEFAULT_LFO: LfoConfig = {
	rate: 1.0,
	waveform: LfoWaveform.Sine,
	routes: [],
};

export const DEFAULT_PATCH: Patch = {
	operators: [{ ...DEFAULT_OPERATOR }, { ...DEFAULT_OPERATOR }],
	index: 1.0,
	filterFreq: 8000,
	filterRes: 0,
	sends: [0, 0, 0, 0],
	lfos: [{ ...DEFAULT_LFO }, { ...DEFAULT_LFO }],
	attack: 0.01,
	decay: 0.1,
	sustain: 0.7,
	release: 0.3,
};

export const DEFAULT_BUSES: BusSetup = [{ slots: [] }, { slots: [] }, { slots: [] }, { slots: [] }];

// --- Initial state ---

export function createInitialState(numTracks = 4): TrackerState {
	// Create one empty pattern at slot 0
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

		patches: [{ ...DEFAULT_PATCH }],
		patchNames: ["init"],

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
