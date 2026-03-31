import type { DisplayList } from "@helm-audio/display";
import { Page, type TrackerState } from "@helm-audio/types";
import type { Element } from "./element.ts";
import { C } from "./palette.ts";

// Right panel starts at this column.
const R = 48;

// --- Shared chrome elements ---

/** Transport display: T>BPM */
export function drawTransport(display: DisplayList, state: TrackerState, row: number): void {
	const icon = state.playing ? ">" : "#";
	const [ir, ig, ib] = state.playing ? C.accent : C.textDim;
	display.drawText(R, row, `T`, ...C.label);
	display.drawText(R + 1, row, icon, ir, ig, ib);
	display.drawText(R + 2, row, String(state.tempo), ...C.textNormal);
}

/** Track activity indicators: 1: --- through 8: --- */
export function drawTrackActivity(
	display: DisplayList,
	_state: TrackerState,
	startRow: number,
): void {
	for (let t = 0; t < 8; t++) {
		display.drawText(R, startRow + t, `${String(t + 1)}:`, ...C.textDim);
		display.drawText(R + 2, startRow + t, ` ---`, ...C.textDim);
	}
}

/** Page minimap: P S I (Pattern, Sequence, Instrument). */
export function drawPageIndicator(display: DisplayList, state: TrackerState, row: number): void {
	const pages: { label: string; page: Page }[] = [
		{ label: "P", page: Page.Pattern },
		{ label: "S", page: Page.Sequence },
		{ label: "I", page: Page.Instrument },
	];

	for (let i = 0; i < pages.length; i++) {
		const active = pages[i].page === state.page;
		const color = active ? C.pageActive : C.pageInactive;
		display.drawText(R + i, row, pages[i].label, ...color);
	}
}

/** Edit mode and octave display: E:ON O:4 */
export function drawEditStatus(display: DisplayList, state: TrackerState, row: number): void {
	const editColor = state.editMode ? C.accent : C.textDim;
	display.drawText(R, row, "E:", ...C.label);
	display.drawText(R + 2, row, state.editMode ? "ON" : "--", ...editColor);
	display.drawText(R + 5, row, "O:", ...C.label);
	display.drawText(R + 7, row, String(state.octave), ...C.textNormal);
}

/** Keyboard visual placeholder. */
export function drawKeyboard(display: DisplayList, row: number): void {
	display.drawText(R, row, `|||||||||`, ...C.textDim);
}

/**
 * Draw all shared chrome elements into the display.
 * Call this from every view's root draw function.
 */
/** Keybind hints at the bottom of the screen. */
export function drawHints(display: DisplayList, row: number): void {
	display.drawText(0, row, "F5", ...C.accent);
	display.drawText(2, row, "play ", ...C.textDim);
	display.drawText(7, row, "F6", ...C.accent);
	display.drawText(9, row, "stop ", ...C.textDim);
	display.drawText(14, row, "F7", ...C.accent);
	display.drawText(16, row, "restart ", ...C.textDim);
	display.drawText(24, row, "SPC", ...C.accent);
	display.drawText(27, row, "edit ", ...C.textDim);
	display.drawText(32, row, "S-<>", ...C.accent);
	display.drawText(36, row, "page", ...C.textDim);
}

export function drawChrome(display: DisplayList, state: TrackerState): void {
	drawTransport(display, state, 2);
	drawTrackActivity(display, state, 4);
	drawKeyboard(display, 14);
	drawPageIndicator(display, state, 17);
	drawHints(display, 24);
}

/**
 * Create chrome elements as an Element subtree.
 * These are non-focusable — drawn as part of the view but not navigable.
 */
export function chromeElements(state: TrackerState): Element[] {
	return [
		{
			id: "transport",
			col: R,
			row: 2,
			width: 12,
			height: 1,
			enabled: false,
			draw: (display) => {
				drawTransport(display, state, 2);
			},
		},
		{
			id: "track-activity",
			col: R,
			row: 4,
			width: 12,
			height: 8,
			enabled: false,
			draw: (display) => {
				drawTrackActivity(display, state, 4);
			},
		},
		{
			id: "edit-status",
			col: R,
			row: 13,
			width: 12,
			height: 1,
			enabled: false,
			draw: (display) => {
				drawEditStatus(display, state, 13);
			},
		},
		{
			id: "keyboard",
			col: R,
			row: 14,
			width: 12,
			height: 1,
			enabled: false,
			draw: (display) => {
				drawKeyboard(display, 14);
			},
		},
		{
			id: "page-indicator",
			col: R,
			row: 17,
			width: 3,
			height: 1,
			enabled: false,
			draw: (display) => {
				drawPageIndicator(display, state, 17);
			},
		},
		{
			id: "hints",
			col: 0,
			row: 24,
			width: 40,
			height: 1,
			enabled: false,
			draw: (display) => {
				drawHints(display, 24);
			},
		},
	];
}
