import type { TrackerState, Action } from "@helm-audio/types";
import type { Element } from "./element.ts";
import { chromeElements } from "./chrome.ts";
import { C } from "./palette.ts";
import { scancodeToHex, type HexEntry } from "./hex-input.ts";

const GRID_ROW = 3; // first data row on screen
const NUM_ROWS = 16;
const NUM_TRACKS = 8;

function hexRow(n: number): string {
	return n.toString(16).toUpperCase().padStart(2, "0");
}

/**
 * Build the pattern view element tree.
 *
 * Layout:
 *   Row 0: PATTERN title
 *   Row 2: Track headers (1-8) + transport (chrome)
 *   Rows 3-18: 16 rows x 8 track chain grid
 *   Right panel: track activity, keyboard, PSI (chrome)
 */
export function buildPatternView(
	state: TrackerState,
	emit: (a: Action) => void,
	setPath: (p: string[]) => void,
	hexEntry?: HexEntry,
): Element {
	// --- Grid cell elements ---
	const gridChildren: Element[] = [];

	for (let r = 0; r < NUM_ROWS; r++) {
		for (let t = 0; t < NUM_TRACKS; t++) {
			const row = r;
			const track = t;
			gridChildren.push({
				id: `${hexRow(row)}-${String(track)}`,
				col: 3 + t * 3,
				row: GRID_ROW + r,
				width: 2,
				height: 1,
				enabled: true,
				draw: (display, focused) => {
					const idx = row * NUM_TRACKS + track;
					const entry = idx < state.chain.length ? state.chain[idx] : null;
					const hasValue = entry !== null && entry.patternIndex >= 0;
					const val = hasValue ? hexRow(entry.patternIndex) : "--";
					const color = focused ? C.textHighlight : hasValue ? C.textNormal : C.disabled;
					display.drawText(3 + track * 3, GRID_ROW + row, val, ...color);
				},
			});
		}
	}

	// --- Grid container with arrow navigation ---
	const grid: Element = {
		id: "grid",
		col: 0,
		row: GRID_ROW,
		width: 27,
		height: NUM_ROWS,
		enabled: true,
		children: gridChildren,
		onKey: (key, path) => {
			const cellId = path[path.length - 1];
			const match = cellId.match(/^([0-9A-F]{2})-(\d)$/);
			if (!match) return false;

			const r = parseInt(match[1], 16);
			const t = parseInt(match[2], 10);
			let newR = r;
			let newT = t;

			switch (key) {
				case "ArrowUp":
					newR = Math.max(0, r - 1);
					break;
				case "ArrowDown":
					newR = Math.min(NUM_ROWS - 1, r + 1);
					break;
				case "ArrowLeft":
					newT = Math.max(0, t - 1);
					break;
				case "ArrowRight":
					newT = Math.min(NUM_TRACKS - 1, t + 1);
					break;
				default: {
					if (!state.editMode) return false;

					// --- Hex entry (clamped to 0x0F) ---
					if (hexEntry) {
						const digit = scancodeToHex(key);
						if (digit !== null) {
							const { value, complete } = hexEntry.feed(digit);
							const clamped = Math.min(value, 0x0f);
							emit({ type: "setChainEntry", row: r, track: t, patternIndex: clamped });
							if (complete) {
								const nextR = Math.min(r + 1, NUM_ROWS - 1);
								setPath(["pattern", "grid", `${hexRow(nextR)}-${String(t)}`]);
							}
							return true;
						}
					}

					// --- Delete ---
					if (key === "Delete") {
						emit({ type: "clearChainEntry", row: r, track: t });
						return true;
					}

					return false;
				}
			}

			const newId = `${hexRow(newR)}-${String(newT)}`;
			if (newId !== cellId) {
				setPath(["pattern", "grid", newId]);
			}
			return true;
		},
		draw: () => {},
	};

	// --- Title and row labels (non-focusable) ---
	const titleEl: Element = {
		id: "title",
		col: 0,
		row: 0,
		width: 7,
		height: 1,
		enabled: false,
		draw: (display) => {
			display.drawText(0, 0, "PATTERN", ...C.title);
		},
	};

	const headersEl: Element = {
		id: "headers",
		col: 0,
		row: 2,
		width: 27,
		height: 1,
		enabled: false,
		draw: (display) => {
			for (let t = 0; t < NUM_TRACKS; t++) {
				display.drawText(3 + t * 3, 2, String(t + 1), ...C.label);
			}
		},
	};

	const rowLabelsEl: Element = {
		id: "row-labels",
		col: 0,
		row: GRID_ROW,
		width: 2,
		height: NUM_ROWS,
		enabled: false,
		draw: (display) => {
			for (let r = 0; r < NUM_ROWS; r++) {
				display.drawText(0, GRID_ROW + r, hexRow(r), ...C.textDim);
			}
		},
	};

	return {
		id: "pattern",
		col: 0,
		row: 0,
		width: 60,
		height: 25,
		enabled: true,
		children: [titleEl, headersEl, rowLabelsEl, grid, ...chromeElements(state)],
		draw: () => {},
	};
}
