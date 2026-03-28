import type { Patch, Step, BusSetup } from "./audio.ts";
import type { Page, StepField } from "./state.ts";

// --- UI actions ---

export type Action =
	// Navigation
	| { type: "setPage"; page: Page }
	| { type: "moveCursor"; dRow: number; dCol: number; dField: number }
	| { type: "setCursor"; row: number; col: number; field: StepField }

	// Transport
	| { type: "play" }
	| { type: "stop" }
	| { type: "togglePlay" }
	| { type: "restart" }
	| { type: "setTempo"; bpm: number }

	// Note entry
	| { type: "enterNote"; note: number }
	| { type: "noteOff"; track: number }
	| { type: "deleteStep" }

	// Step editing
	| { type: "setStep"; patternIndex: number; trackIndex: number; stepIndex: number; step: Step }
	| { type: "clearStep"; patternIndex: number; trackIndex: number; stepIndex: number }

	// Editing mode
	| { type: "toggleEditMode" }
	| { type: "setOctave"; octave: number }
	| { type: "setStepSize"; size: number }
	| { type: "setCurrentPatchIndex"; index: number }

	// Pattern management
	| { type: "setActivePattern"; index: number }
	| { type: "setCurrentBank"; bank: number }

	// Patch management
	| { type: "setPatch"; index: number; patch: Patch }
	| { type: "setPatchName"; index: number; name: string }

	// Effects
	| { type: "setBuses"; buses: BusSetup }

	// Undo
	| { type: "undo" }
	| { type: "redo" };
