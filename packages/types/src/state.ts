import type { BusSetup, PatternData, Step } from "./audio.ts";
import type { Patch } from "./fm4.ts";

// --- Pages ---

export enum Page {
	Pattern = 0,
	Sequence = 1,
	Instrument = 2,
	Table = 3,
	Mixer = 4,
}

// --- Cursor ---

export enum StepField {
	Note = 0,
	Velocity = 1,
	Patch = 2,
	Lock = 3,
}

export interface Cursor {
	/** Step index (pattern), parameter row (other pages). */
	row: number;
	/** Track index (pattern), left/right column (other pages). */
	col: number;
	/** Sub-field within a cell on the pattern page. */
	field: StepField;
}

// --- Selection ---

export interface Selection {
	startRow: number;
	startCol: number;
	endRow: number;
	endCol: number;
}

// --- Edit mask ---

export interface EditMask {
	note: boolean;
	velocity: boolean;
	patch: boolean;
	locks: boolean;
}

// --- Clipboard ---

export interface ClipboardData {
	/** Number of tracks in the copied block. */
	tracks: number;
	/** Number of rows in the copied block. */
	rows: number;
	/** Step data, indexed [track][row]. Null = empty cell. */
	steps: (Step | null)[][];
}

// --- Undo ---

export interface UndoEntry {
	patternIndex: number;
	trackIndex: number;
	stepIndex: number;
	before: Step | null;
	after: Step | null;
}

export interface UndoGroup {
	entries: UndoEntry[];
}

// --- Chain ---

export interface ChainEntry {
	patternIndex: number;
}

// --- Tracker state ---

export interface TrackerState {
	// Navigation
	page: Page;
	cursor: Cursor;
	/** First visible row in the pattern view (scroll offset). */
	scrollRow: number;

	// Transport
	playing: boolean;
	tempo: number;
	/** Current step from engine state report. */
	playbackStep: number;
	/** Active pattern index from engine state report. */
	activePatternIndex: number;
	/** Scroll follows playback position. */
	follow: boolean;

	// Editing
	editMode: boolean;
	octave: number;
	stepSize: number;
	currentPatchIndex: number;
	editMask: EditMask;

	// Pattern bank (64 slots)
	patterns: (PatternData | null)[];
	currentBank: number;

	// Patch bank
	patches: Patch[];
	patchNames: string[];

	// Effect buses
	buses: BusSetup;

	// Chain / arrangement
	chain: ChainEntry[];
	chainLoop: boolean;
	chainPosition: number;
	queuedPatternIndex: number | null;

	// Selection
	selection: Selection | null;

	// Clipboard
	clipboard: ClipboardData | null;

	// Undo
	undoStack: UndoGroup[];
	redoStack: UndoGroup[];
}
