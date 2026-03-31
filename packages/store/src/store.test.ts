import { describe, it, expect } from "vitest";
import { TrackerStore, createInitialState } from "./index.ts";
import { Page, StepField } from "@helm-audio/types";
import { TrigType } from "@helm-audio/protocol";

function makeStore(numTracks = 8): TrackerStore {
	return new TrackerStore(createInitialState(numTracks));
}

// --- dispatch routing ---

describe("dispatch", () => {
	it("routes setPage", () => {
		const store = makeStore();
		store.dispatch({ type: "setPage", page: Page.Pattern });
		expect(store.state.page).toBe(Page.Pattern);
	});

	it("routes toggleEditMode", () => {
		const store = makeStore();
		const before = store.state.editMode;
		store.dispatch({ type: "toggleEditMode" });
		expect(store.state.editMode).toBe(!before);
	});
});

// --- cursor ---

describe("cursor", () => {
	it("setCursor updates all fields", () => {
		const store = makeStore();
		store.dispatch({ type: "setCursor", row: 5, col: 3, field: StepField.Velocity });
		expect(store.state.cursor).toEqual({ row: 5, col: 3, field: StepField.Velocity });
	});

	it("moveCursor clamps to pattern bounds", () => {
		const store = makeStore();
		store.dispatch({ type: "moveCursor", dRow: -1, dCol: 0, dField: 0 });
		expect(store.state.cursor.row).toBe(0);

		store.dispatch({ type: "moveCursor", dRow: 100, dCol: 0, dField: 0 });
		expect(store.state.cursor.row).toBe(15); // DEFAULT_PATTERN_LENGTH - 1
	});

	it("moveCursor clamps col to track count", () => {
		const store = makeStore();
		store.dispatch({ type: "moveCursor", dRow: 0, dCol: -1, dField: 0 });
		expect(store.state.cursor.col).toBe(0);

		store.dispatch({ type: "moveCursor", dRow: 0, dCol: 100, dField: 0 });
		expect(store.state.cursor.col).toBe(7); // 8 tracks, 0-indexed
	});

	it("moveCursor clamps field to StepField range", () => {
		const store = makeStore();
		store.dispatch({ type: "moveCursor", dRow: 0, dCol: 0, dField: -1 });
		expect(store.state.cursor.field).toBe(StepField.Note);

		store.dispatch({ type: "moveCursor", dRow: 0, dCol: 0, dField: 100 });
		expect(store.state.cursor.field).toBe(StepField.Lock);
	});
});

// --- note entry ---

describe("enterNote", () => {
	it("inserts a step at the cursor position", () => {
		const store = makeStore();
		store.dispatch({ type: "enterNote", note: 60 });

		const step = store.getStepAt(0, 0);
		expect(step).not.toBeNull();
		expect(step?.trig?.type).toBe(TrigType.NoteOn);
		if (step?.trig?.type === TrigType.NoteOn) {
			expect(step.trig.note).toBe(60);
			expect(step.trig.velocity).toBe(0x7f);
		}
	});

	it("advances cursor by stepSize", () => {
		const store = makeStore();
		expect(store.state.stepSize).toBe(1);

		store.dispatch({ type: "enterNote", note: 60 });
		expect(store.state.cursor.row).toBe(1);

		store.dispatch({ type: "enterNote", note: 64 });
		expect(store.state.cursor.row).toBe(2);
	});

	it("does not advance cursor past pattern end", () => {
		const store = makeStore();
		store.state.cursor.row = 15; // last row
		store.dispatch({ type: "enterNote", note: 60 });
		expect(store.state.cursor.row).toBe(15);
	});

	it("does not advance cursor when stepSize is 0", () => {
		const store = makeStore();
		store.dispatch({ type: "setStepSize", size: 0 });
		store.dispatch({ type: "enterNote", note: 60 });
		expect(store.state.cursor.row).toBe(0);
	});

	it("respects stepSize > 1", () => {
		const store = makeStore();
		store.dispatch({ type: "setStepSize", size: 4 });
		store.dispatch({ type: "enterNote", note: 60 });
		expect(store.state.cursor.row).toBe(4);
	});

	it("overwrites an existing step", () => {
		const store = makeStore();
		store.dispatch({ type: "enterNote", note: 60 });

		// Go back and overwrite
		store.dispatch({ type: "setCursor", row: 0, col: 0, field: StepField.Note });
		store.dispatch({ type: "enterNote", note: 72 });

		const step = store.getStepAt(0, 0);
		if (step?.trig?.type === TrigType.NoteOn) {
			expect(step.trig.note).toBe(72);
		}
	});

	it("does not stamp patchIndex on the step", () => {
		const store = makeStore();
		store.dispatch({ type: "enterNote", note: 60 });

		const step = store.getStepAt(0, 0);
		expect(step).not.toBeNull();
		expect(step?.patchIndex).toBeUndefined();
	});

	it("writes to the correct track based on cursor.col", () => {
		const store = makeStore();
		store.dispatch({ type: "setCursor", row: 0, col: 3, field: StepField.Note });
		store.dispatch({ type: "enterNote", note: 60 });

		expect(store.getStepAt(3, 0)).not.toBeNull();
		expect(store.getStepAt(0, 0)).toBeNull();
	});
});

// --- deleteStep ---

describe("deleteStep", () => {
	it("removes a step at the cursor position", () => {
		const store = makeStore();
		store.dispatch({ type: "enterNote", note: 60 });
		store.dispatch({ type: "setCursor", row: 0, col: 0, field: StepField.Note });

		expect(store.getStepAt(0, 0)).not.toBeNull();
		store.dispatch({ type: "deleteStep" });
		expect(store.getStepAt(0, 0)).toBeNull();
	});

	it("is a no-op on an empty step", () => {
		const store = makeStore();
		store.dispatch({ type: "deleteStep" }); // should not throw
		expect(store.getStepAt(0, 0)).toBeNull();
	});
});

// --- transport ---

describe("transport", () => {
	it("play sets playing to true", () => {
		const store = makeStore();
		store.dispatch({ type: "play" });
		expect(store.state.playing).toBe(true);
	});

	it("stop sets playing to false", () => {
		const store = makeStore();
		store.dispatch({ type: "play" });
		store.dispatch({ type: "stop" });
		expect(store.state.playing).toBe(false);
	});

	it("togglePlay toggles playing state", () => {
		const store = makeStore();
		expect(store.state.playing).toBe(false);
		store.dispatch({ type: "togglePlay" });
		expect(store.state.playing).toBe(true);
		store.dispatch({ type: "togglePlay" });
		expect(store.state.playing).toBe(false);
	});

	it("restart resets playbackStep and sets playing", () => {
		const store = makeStore();
		store.state.playbackStep = 8;
		store.dispatch({ type: "restart" });
		expect(store.state.playing).toBe(true);
		expect(store.state.playbackStep).toBe(0);
	});

	it("setTempo updates tempo", () => {
		const store = makeStore();
		store.dispatch({ type: "setTempo", bpm: 140 });
		expect(store.state.tempo).toBe(140);
	});
});

// --- editing mode ---

describe("editing mode", () => {
	it("toggleEditMode flips editMode", () => {
		const store = makeStore();
		expect(store.state.editMode).toBe(true);
		store.dispatch({ type: "toggleEditMode" });
		expect(store.state.editMode).toBe(false);
		store.dispatch({ type: "toggleEditMode" });
		expect(store.state.editMode).toBe(true);
	});

	it("setOctave updates octave", () => {
		const store = makeStore();
		store.dispatch({ type: "setOctave", octave: 6 });
		expect(store.state.octave).toBe(6);
	});

	it("setOctave clamps to 0-8", () => {
		const store = makeStore();
		store.dispatch({ type: "setOctave", octave: -1 });
		expect(store.state.octave).toBe(0);
		store.dispatch({ type: "setOctave", octave: 10 });
		expect(store.state.octave).toBe(8);
	});

	it("setStepSize updates stepSize", () => {
		const store = makeStore();
		store.dispatch({ type: "setStepSize", size: 4 });
		expect(store.state.stepSize).toBe(4);
	});

	it("setStepSize clamps to 0-16", () => {
		const store = makeStore();
		store.dispatch({ type: "setStepSize", size: -1 });
		expect(store.state.stepSize).toBe(0);
		store.dispatch({ type: "setStepSize", size: 20 });
		expect(store.state.stepSize).toBe(16);
	});
});

// --- undo/redo ---

describe("undo/redo", () => {
	it("undo reverses a note entry", () => {
		const store = makeStore();
		store.dispatch({ type: "enterNote", note: 60 });
		expect(store.getStepAt(0, 0)).not.toBeNull();

		store.dispatch({ type: "undo" });
		expect(store.getStepAt(0, 0)).toBeNull();
	});

	it("redo restores an undone note entry", () => {
		const store = makeStore();
		store.dispatch({ type: "enterNote", note: 60 });
		store.dispatch({ type: "undo" });
		expect(store.getStepAt(0, 0)).toBeNull();

		store.dispatch({ type: "redo" });
		const step = store.getStepAt(0, 0);
		expect(step).not.toBeNull();
		if (step?.trig?.type === TrigType.NoteOn) {
			expect(step.trig.note).toBe(60);
		}
	});

	it("new edit clears redo stack", () => {
		const store = makeStore();
		store.dispatch({ type: "enterNote", note: 60 });
		store.dispatch({ type: "undo" });
		expect(store.state.redoStack.length).toBe(1);

		store.dispatch({ type: "enterNote", note: 72 });
		expect(store.state.redoStack.length).toBe(0);
	});

	it("undo is a no-op when stack is empty", () => {
		const store = makeStore();
		store.dispatch({ type: "undo" }); // should not throw
		expect(store.state.undoStack.length).toBe(0);
	});

	it("undo reverses a delete", () => {
		const store = makeStore();
		store.dispatch({ type: "enterNote", note: 60 });
		store.dispatch({ type: "setCursor", row: 0, col: 0, field: StepField.Note });
		store.dispatch({ type: "deleteStep" });
		expect(store.getStepAt(0, 0)).toBeNull();

		store.dispatch({ type: "undo" });
		expect(store.getStepAt(0, 0)).not.toBeNull();
	});
});

// --- pattern management ---

describe("pattern management", () => {
	it("setActivePattern switches pattern and resets cursor", () => {
		const store = makeStore();
		store.state.cursor.row = 8;
		store.dispatch({ type: "setActivePattern", index: 1 });
		expect(store.state.activePatternIndex).toBe(1);
		expect(store.state.cursor.row).toBe(0);
	});

	it("setChainEntry sets a chain cell", () => {
		const store = makeStore();
		store.dispatch({ type: "setChainEntry", row: 0, track: 2, patternIndex: 5 });
		expect(store.state.chain[2]).toEqual({ patternIndex: 5 });
	});

	it("setChainEntry grows the chain array", () => {
		const store = makeStore();
		expect(store.state.chain.length).toBe(0);
		store.dispatch({ type: "setChainEntry", row: 1, track: 3, patternIndex: 10 });
		// row 1, track 3 = index 11, so chain must be at least 12 entries
		expect(store.state.chain.length).toBe(12);
		expect(store.state.chain[11]).toEqual({ patternIndex: 10 });
	});

	it("clearChainEntry sets patternIndex to -1", () => {
		const store = makeStore();
		store.dispatch({ type: "setChainEntry", row: 0, track: 0, patternIndex: 3 });
		store.dispatch({ type: "clearChainEntry", row: 0, track: 0 });
		expect(store.state.chain[0]).toEqual({ patternIndex: -1 });
	});

	it("clearChainEntry is a no-op on empty chain", () => {
		const store = makeStore();
		store.dispatch({ type: "clearChainEntry", row: 0, track: 0 });
		expect(store.state.chain.length).toBe(0);
	});

	it("setCurrentBank clamps to 0-3", () => {
		const store = makeStore();
		store.dispatch({ type: "setCurrentBank", bank: 2 });
		expect(store.state.currentBank).toBe(2);
		store.dispatch({ type: "setCurrentBank", bank: 10 });
		expect(store.state.currentBank).toBe(3);
	});
});
