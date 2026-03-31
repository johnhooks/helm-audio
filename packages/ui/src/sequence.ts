import {
	TrigType,
	StepField,
	type TrackerState,
	type Action,
	type NoteOnTrig,
	type Trig,
	type Step,
} from "@helm-audio/types";
import type { Element } from "./element.ts";
import { chromeElements } from "./chrome.ts";
import { C } from "./palette.ts";
import { scancodeToNote } from "./keys.ts";
import { scancodeToHex, type HexEntry } from "./hex-input.ts";

const GRID_ROW = 3;
const NUM_STEPS = 16;
// Column offsets within a track group
const NOTE_COL = 2;
const VEL_COL = 6;
const PATCH_COL = 9;
const FX1_COL = 12;
const FX2_COL = 19;
const FX3_COL = 26;

const NOTE_NAMES = ["C-", "C#", "D-", "D#", "E-", "F-", "F#", "G-", "G#", "A-", "A#", "B-"];

function noteName(midi: number): string {
	const oct = Math.floor(midi / 12) - 1;
	const name = NOTE_NAMES[midi % 12];
	return `${name}${String(oct)}`;
}

function hexByte(n: number): string {
	return n.toString(16).toUpperCase().padStart(2, "0");
}

function hexNibble(n: number): string {
	return n.toString(16).toUpperCase();
}

function isNoteOn(trig: Trig): trig is NoteOnTrig {
	return trig.type === TrigType.NoteOn;
}

/**
 * Build the sequence view element tree.
 *
 * Layout:
 *   Row 0: SEQ nn
 *   Row 2: Column headers (N V I FX1 FX2 FX3)
 *   Rows 3-18: 16 step rows with fields
 */
export function buildSequenceView(
	state: TrackerState,
	emit: (a: Action) => void,
	setPath: (p: string[]) => void,
	hexEntry?: HexEntry,
): Element {
	const fields = ["note", "vel", "patch", "fx1", "fx2", "fx3"];
	const fieldCols = [NOTE_COL, VEL_COL, PATCH_COL, FX1_COL, FX2_COL, FX3_COL];
	const fieldWidths = [3, 2, 2, 5, 5, 5];
	// Map field array index to StepField enum for cursor sync
	const fieldToStepField: Record<number, StepField> = {
		0: StepField.Note,
		1: StepField.Velocity,
		2: StepField.Patch,
		3: StepField.Lock, // fx1 — closest mapping for now
	};

	const pattern = state.patterns[state.activePatternIndex] ?? null;

	// --- Step field elements ---
	const stepChildren: Element[] = [];

	for (let r = 0; r < NUM_STEPS; r++) {
		for (let f = 0; f < fields.length; f++) {
			const row = r;
			const fieldName = fields[f];
			const fxField = f >= 3;

			stepChildren.push({
				id: `${hexNibble(row)}-${fieldName}`,
				col: fieldCols[f],
				row: GRID_ROW + r,
				width: fieldWidths[f],
				height: 1,
				enabled: !fxField,
				draw: (display, focused) => {
					const trackIdx = state.cursor.col;
					const track = pattern?.tracks[trackIdx];
					const step = track?.events.find((e) => e.stepIndex === row);
					const trig = step?.trig;

					let text: string;
					let color = focused ? C.textHighlight : fxField ? C.disabled : C.textDim;

					switch (fieldName) {
						case "note":
							if (trig && isNoteOn(trig)) {
								text = noteName(trig.note);
								color = focused ? C.textHighlight : C.note;
							} else {
								text = "---";
							}
							break;
						case "vel":
							if (trig && isNoteOn(trig)) {
								text = hexByte(trig.velocity);
								color = focused ? C.textHighlight : C.velocity;
							} else {
								text = "--";
							}
							break;
						case "patch":
							text = "--";
							break;
						case "fx1":
						case "fx2":
						case "fx3":
							text = "---00";
							color = C.disabled;
							break;
						default:
							text = "";
					}

					display.drawText(fieldCols[f], GRID_ROW + row, text, ...color);
				},
			});
		}
	}

	// --- Grid with arrow navigation ---
	const grid: Element = {
		id: "grid",
		col: 0,
		row: GRID_ROW,
		width: 32,
		height: NUM_STEPS,
		enabled: true,
		children: stepChildren,
		onKey: (key, path) => {
			const cellId = path[path.length - 1];
			const match = cellId.match(/^([0-9A-F])-(\w+)$/);
			if (!match) return false;

			const r = parseInt(match[1], 16);
			const fieldName = match[2];
			const fIdx = fields.indexOf(fieldName);
			if (fIdx === -1) return false;

			let newR = r;
			let newF = fIdx;

			// --- Navigation ---
			switch (key) {
				case "ArrowUp":
					newR = Math.max(0, r - 1);
					break;
				case "ArrowDown":
					newR = Math.min(NUM_STEPS - 1, r + 1);
					break;
				case "ArrowLeft": {
					let next = fIdx - 1;
					while (next >= 0 && next >= 3) next--;
					if (next >= 0) newF = next;
					break;
				}
				case "ArrowRight": {
					let next = fIdx + 1;
					while (next < fields.length && next >= 3) next = fields.length;
					if (next < fields.length) newF = next;
					break;
				}
				default: {
					if (!state.editMode) return false;

					// --- Note entry (note field only) ---
					if (fieldName === "note") {
						const note = scancodeToNote(key, state.octave);
						if (note !== null) {
							emit({ type: "enterNote", note });
							const newRow = state.cursor.row;
							setPath(["sequence", "grid", `${hexNibble(newRow)}-note`]);
							return true;
						}
					}

					// --- Hex entry (vel, patch fields) ---
					if (hexEntry && (fieldName === "vel" || fieldName === "patch")) {
						const digit = scancodeToHex(key);
						if (digit !== null) {
							const { value, complete } = hexEntry.feed(digit);
							const trackIdx = state.cursor.col;
							const existing = pattern?.tracks[trackIdx]?.events.find((e) => e.stepIndex === r);

							if (fieldName === "vel" && existing?.trig?.type === TrigType.NoteOn) {
								const clamped = Math.min(value, 0x7f);
								const step: Step = {
									...existing,
									trig: { ...existing.trig, velocity: clamped },
								};
								emit({
									type: "setStep",
									patternIndex: state.activePatternIndex,
									trackIndex: trackIdx,
									stepIndex: r,
									step,
								});
							}

							if (complete) {
								const newRow = Math.min(r + state.stepSize, NUM_STEPS - 1);
								setPath(["sequence", "grid", `${hexNibble(newRow)}-${fieldName}`]);
								emit({
									type: "setCursor",
									row: newRow,
									col: state.cursor.col,
									field: fieldToStepField[fIdx] ?? StepField.Note,
								});
							}
							return true;
						}
					}

					// --- Delete (any field) ---
					if (key === "Delete") {
						emit({ type: "deleteStep" });
						return true;
					}

					return false;
				}
			}

			const newId = `${hexNibble(newR)}-${fields[newF]}`;
			if (newId !== cellId) {
				setPath(["sequence", "grid", newId]);
				emit({
					type: "setCursor",
					row: newR,
					col: state.cursor.col,
					field: fieldToStepField[newF] ?? StepField.Note,
				});
			}
			return true;
		},
		draw: () => {},
	};

	// --- Title ---
	const titleEl: Element = {
		id: "title",
		col: 0,
		row: 0,
		width: 12,
		height: 1,
		enabled: false,
		draw: (display) => {
			const idx = hexByte(state.activePatternIndex);
			display.drawText(0, 0, `SEQ ${idx}`, ...C.title);
		},
	};

	// --- Column headers ---
	const headersEl: Element = {
		id: "headers",
		col: 0,
		row: 2,
		width: 32,
		height: 1,
		enabled: false,
		draw: (display) => {
			display.drawText(NOTE_COL, 2, "N", ...C.label);
			display.drawText(VEL_COL, 2, "V", ...C.label);
			display.drawText(PATCH_COL, 2, "P", ...C.label);
			display.drawText(FX1_COL, 2, "FX1", ...C.disabled);
			display.drawText(FX2_COL, 2, "FX2", ...C.disabled);
			display.drawText(FX3_COL, 2, "FX3", ...C.disabled);
		},
	};

	// --- Row labels ---
	const rowLabelsEl: Element = {
		id: "row-labels",
		col: 0,
		row: GRID_ROW,
		width: 1,
		height: NUM_STEPS,
		enabled: false,
		draw: (display) => {
			for (let r = 0; r < NUM_STEPS; r++) {
				const isMajor = r % 4 === 0;
				const color = isMajor ? C.textNormal : C.textDim;
				display.drawText(0, GRID_ROW + r, hexByte(r), ...color);
			}
		},
	};

	// --- Row backgrounds ---
	const rowBgEl: Element = {
		id: "row-bg",
		col: 0,
		row: GRID_ROW,
		width: 60,
		height: NUM_STEPS,
		enabled: false,
		draw: (display) => {
			for (let r = 0; r < NUM_STEPS; r++) {
				const isPlayback = state.playing && r === state.playbackStep;
				const isMajor = r % 4 === 0;
				if (isPlayback) {
					display.addRect(0, GRID_ROW + r, 60, 1, ...C.playbackRow);
				} else if (isMajor) {
					display.addRect(0, GRID_ROW + r, 60, 1, ...C.bgMajor);
				}
			}
		},
	};

	return {
		id: "sequence",
		col: 0,
		row: 0,
		width: 60,
		height: 25,
		enabled: true,
		children: [rowBgEl, titleEl, headersEl, rowLabelsEl, grid, ...chromeElements(state)],
		draw: () => {},
	};
}
