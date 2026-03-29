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
export function drawTrackActivity(display: DisplayList, _state: TrackerState, startRow: number): void {
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

/** Keyboard visual placeholder. */
export function drawKeyboard(display: DisplayList, row: number): void {
	display.drawText(R, row, `|||||||||`, ...C.textDim);
}

/**
 * Draw all shared chrome elements into the display.
 * Call this from every view's root draw function.
 */
export function drawChrome(display: DisplayList, state: TrackerState): void {
	drawTransport(display, state, 2);
	drawTrackActivity(display, state, 4);
	drawKeyboard(display, 14);
	drawPageIndicator(display, state, 17);
}

/**
 * Create chrome elements as an Element subtree.
 * These are non-focusable — drawn as part of the view but not navigable.
 */
export function chromeElements(state: TrackerState): Element[] {
	return [
		{
			id: "transport",
			col: R, row: 2, width: 12, height: 1,
			enabled: false,
			draw: (display) => { drawTransport(display, state, 2); },
		},
		{
			id: "track-activity",
			col: R, row: 4, width: 12, height: 8,
			enabled: false,
			draw: (display) => { drawTrackActivity(display, state, 4); },
		},
		{
			id: "keyboard",
			col: R, row: 14, width: 12, height: 1,
			enabled: false,
			draw: (display) => { drawKeyboard(display, 14); },
		},
		{
			id: "page-indicator",
			col: R, row: 17, width: 3, height: 1,
			enabled: false,
			draw: (display) => { drawPageIndicator(display, state, 17); },
		},
	];
}
