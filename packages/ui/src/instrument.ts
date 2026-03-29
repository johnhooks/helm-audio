import type { TrackerState, Action } from "@helm-audio/types";
import type { Element } from "./element.ts";
import { chromeElements } from "./chrome.ts";
import { C } from "./palette.ts";

const HEADER_ROW = 2;
const PARAMS_ROW = 6;
const MIXER_COL = 30;

function fmtFloat(n: number, decimals = 2): string {
	return n.toFixed(decimals);
}

function hexByte(n: number): string {
	return Math.round(n * 255).toString(16).toUpperCase().padStart(2, "0");
}

/**
 * Build the instrument view element tree.
 *
 * Layout:
 *   Row 0: INST. nn
 *   Row 2-4: Header (TYPE, NAME, TRANSP/TBL/TIC/EQ)
 *   Row 6-7: ALGO + operator waveforms
 *   Row 8-11: RATIO, LEV/FB, MOD slots
 *   Row 13-19: MOD1-4 + mixer column (AMP/LIM/PAN/DRY/MFX/DEL/REV)
 *   Row 16-18: FILTER/CUTOFF/RES
 */
export function buildInstrumentView(state: TrackerState, emit: (a: Action) => void, setPath: (p: string[]) => void): Element {
	const getPatch = () => state.patches[state.currentPatchIndex] ?? state.patches[0];

	// --- Header fields ---
	const headerFields: Element[] = [
		{
			id: "type",
			col: 8, row: HEADER_ROW, width: 8, height: 1,
			enabled: true,
			draw: (display, focused) => {
				const color = focused ? C.textHighlight : C.value;
				display.drawText(8, HEADER_ROW, "FMSYNTH", ...color);
			},
		},
		{
			id: "name",
			col: 8, row: HEADER_ROW + 1, width: 14, height: 1,
			enabled: true,
			draw: (display, focused) => {
				const name = state.patchNames[state.currentPatchIndex] ?? "init";
				const padded = name.padEnd(14, "-");
				const color = focused ? C.textHighlight : C.textDim;
				display.drawText(8, HEADER_ROW + 1, padded, ...color);
			},
		},
	];

	const header: Element = {
		id: "header",
		col: 0, row: HEADER_ROW, width: 44, height: 3,
		enabled: true,
		children: headerFields,
		onKey: (key, path) => {
			const currentId = path[path.length - 1];
			const ids = headerFields.filter(f => f.enabled).map(f => f.id);
			const idx = ids.indexOf(currentId);
			if (idx === -1) return false;

			switch (key) {
				case "ArrowUp": {
					const next = idx - 1;
					if (next >= 0) setPath(["instrument", "header", ids[next]]);
					return true;
				}
				case "ArrowDown": {
					const next = idx + 1;
					if (next < ids.length) {
						setPath(["instrument", "header", ids[next]]);
					} else {
						setPath(["instrument", "params", "algo"]);
					}
					return true;
				}
				default: return false;
			}
		},
		draw: () => {},
	};

	// --- FM parameters ---
	const paramFields: Element[] = [
		{
			id: "algo",
			col: 8, row: PARAMS_ROW, width: 14, height: 1,
			enabled: true,
			draw: (display, focused) => {
				const color = focused ? C.textHighlight : C.value;
				display.drawText(8, PARAMS_ROW, "00 A>B", ...color);
			},
		},
	];

	// Operator params: wave, ratio, lev/fb
	for (let op = 0; op < 2; op++) {
		const baseCol = 8 + op * 7;

		paramFields.push({
			id: `op${String(op)}-ratio`,
			col: baseCol, row: PARAMS_ROW + 2, width: 5, height: 1,
			enabled: true,
			draw: (display, focused) => {
				const patch = getPatch();
				const ratio = patch.operators[op].ratio;
				const color = focused ? C.textHighlight : C.value;
				display.drawText(baseCol, PARAMS_ROW + 2, fmtFloat(ratio), ...color);
			},
		});

		paramFields.push({
			id: `op${String(op)}-level`,
			col: baseCol, row: PARAMS_ROW + 3, width: 5, height: 1,
			enabled: true,
			draw: (display, focused) => {
				const patch = getPatch();
				const level = hexByte(patch.operators[op].level);
				const fb = hexByte(patch.operators[op].feedback);
				const color = focused ? C.textHighlight : C.value;
				display.drawText(baseCol, PARAMS_ROW + 3, `${level}/${fb}`, ...color);
			},
		});
	}

	// MOD slots (disabled)
	for (let m = 0; m < 2; m++) {
		paramFields.push({
			id: `mod${String(m + 1)}`,
			col: 8, row: PARAMS_ROW + 4 + m, width: 5, height: 1,
			enabled: false,
			draw: (display) => {
				const r = PARAMS_ROW + 4 + m;
					display.drawText(8, r, "-----  -----", ...C.disabled);
			},
		});
	}

	const params: Element = {
		id: "params",
		col: 0, row: PARAMS_ROW, width: 28, height: 8,
		enabled: true,
		children: paramFields,
		onKey: (key, path) => {
			const currentId = path[path.length - 1];
			const enabledIds = paramFields.filter(f => f.enabled).map(f => f.id);
			const idx = enabledIds.indexOf(currentId);
			if (idx === -1) return false;

			switch (key) {
				case "ArrowUp": {
					if (idx > 0) {
						setPath(["instrument", "params", enabledIds[idx - 1]]);
					} else {
						setPath(["instrument", "header", "name"]);
					}
					return true;
				}
				case "ArrowDown": {
					if (idx < enabledIds.length - 1) {
						setPath(["instrument", "params", enabledIds[idx + 1]]);
					} else {
						setPath(["instrument", "mixer", "filter"]);
					}
					return true;
				}
				default: return false;
			}
		},
		draw: () => {},
	};

	// --- Mixer column ---
	const mixerRows = [
		{ id: "amp", label: "AMP", row: 7 },
		{ id: "lim", label: "LIM", row: 8 },
		{ id: "pan", label: "PAN", row: 9 },
		{ id: "dry", label: "DRY", row: 10 },
		{ id: "mfx", label: "MFX", row: 11 },
		{ id: "del", label: "DEL", row: 12 },
		{ id: "rev", label: "REV", row: 13 },
	];

	const mixerFields: Element[] = [];
	const filterRows = [
		{ id: "filter", label: "FILTER", row: 16 },
		{ id: "cutoff", label: "CUTOFF", row: 17 },
		{ id: "res", label: "RES", row: 18 },
	];

	for (const mr of mixerRows) {
		mixerFields.push({
			id: mr.id,
			col: MIXER_COL + 4, row: mr.row, width: 7, height: 1,
			enabled: false,
			draw: (display) => {
				let val = "00";
				if (mr.id === "lim") val = "00CLIP";
				if (mr.id === "pan") val = "80";
				if (mr.id === "dry") val = "C0";
				display.drawText(MIXER_COL + 4, mr.row, val, ...C.disabled);
			},
		});
	}

	for (const fr of filterRows) {
		mixerFields.push({
			id: fr.id,
			col: 8, row: fr.row, width: 10, height: 1,
			enabled: true,
			draw: (display, focused) => {
				const patch = getPatch();
				let val: string;
				const color = focused ? C.textHighlight : C.value;
				switch (fr.id) {
					case "filter": val = "00 OFF"; break;
					case "cutoff": val = hexByte(patch.filterFreq / 20000); break;
					case "res": val = hexByte(patch.filterRes); break;
					default: val = "00";
				}
				display.drawText(8, fr.row, val, ...color);
			},
		});
	}

	const mixer: Element = {
		id: "mixer",
		col: MIXER_COL, row: 7, width: 16, height: 12,
		enabled: true,
		children: mixerFields,
		onKey: (key, path) => {
			const currentId = path[path.length - 1];
			const enabledIds = mixerFields.filter(f => f.enabled).map(f => f.id);
			const idx = enabledIds.indexOf(currentId);
			if (idx === -1) return false;

			switch (key) {
				case "ArrowUp": {
					if (idx > 0) {
						setPath(["instrument", "mixer", enabledIds[idx - 1]]);
					} else {
						const pEnabled = paramFields.filter(f => f.enabled);
						setPath(["instrument", "params", pEnabled[pEnabled.length - 1].id]);
					}
					return true;
				}
				case "ArrowDown": {
					if (idx < enabledIds.length - 1) {
						setPath(["instrument", "mixer", enabledIds[idx + 1]]);
					}
					return true;
				}
				default: return false;
			}
		},
		draw: () => {},
	};

	// --- Title ---
	const titleEl: Element = {
		id: "title",
		col: 0, row: 0, width: 10, height: 1,
		enabled: false,
		draw: (display) => {
			const idx = state.currentPatchIndex.toString(16).toUpperCase().padStart(2, "0");
			display.drawText(0, 0, `INST. ${idx}`, ...C.title);
		},
	};

	// --- Static labels ---
	const labelsEl: Element = {
		id: "labels",
		col: 0, row: 0, width: 44, height: 20,
		enabled: false,
		draw: (display) => {
			display.drawText(0, HEADER_ROW, "TYPE", ...C.label);
			display.drawText(24, HEADER_ROW, "LOAD SAVE", ...C.disabled);
			display.drawText(0, HEADER_ROW + 1, "NAME", ...C.label);
			display.drawText(0, HEADER_ROW + 2, "TRANSP.", ...C.label);
			display.drawText(8, HEADER_ROW + 2, "ON", ...C.value);
			display.drawText(14, HEADER_ROW + 2, "TBL. TIC", ...C.textDim);
			display.drawText(23, HEADER_ROW + 2, "01", ...C.value);
			display.drawText(28, HEADER_ROW + 2, "EQ --", ...C.textDim);

			display.drawText(0, PARAMS_ROW, "ALGO", ...C.label);
			display.drawText(8, PARAMS_ROW + 1, "A SIN  B SIN", ...C.textNormal);
			display.drawText(0, PARAMS_ROW + 2, "RATIO", ...C.label);
			display.drawText(0, PARAMS_ROW + 3, "LEV/FB", ...C.label);
			display.drawText(0, PARAMS_ROW + 4, "MOD", ...C.disabled);

			for (let m = 0; m < 4; m++) {
				display.drawText(0, 13 + m, `MOD${String(m + 1)}`, ...C.disabled);
				display.drawText(8, 13 + m, "00", ...C.disabled);
			}

			for (const mr of mixerRows) {
				display.drawText(MIXER_COL, mr.row, mr.label, ...C.disabled);
			}

			for (const fr of filterRows) {
				display.drawText(0, fr.row, fr.label, ...C.label);
			}

			display.drawText(MIXER_COL, 16, "MFX", ...C.disabled);
			display.drawText(MIXER_COL, 17, "DEL", ...C.disabled);
			display.drawText(MIXER_COL, 18, "REV", ...C.disabled);
		},
	};

	return {
		id: "instrument",
		col: 0, row: 0, width: 60, height: 25,
		enabled: true,
		children: [titleEl, labelsEl, header, params, mixer, ...chromeElements(state)],
		draw: () => {},
	};
}
