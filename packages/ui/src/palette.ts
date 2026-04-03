import type { RGB } from "./element.ts";

export const C = {
	// Backgrounds
	bg: [10, 10, 10] as RGB,
	bgMinor: [17, 17, 17] as RGB,
	bgMajor: [26, 26, 26] as RGB,
	cursorRow: [26, 42, 26] as RGB,
	playbackRow: [42, 26, 26] as RGB,

	// Text
	disabled: [50, 50, 50] as RGB,
	textDim: [85, 85, 85] as RGB,
	textNormal: [136, 136, 136] as RGB,
	textBright: [204, 204, 204] as RGB,
	textHighlight: [255, 255, 255] as RGB,

	// Semantic
	title: [255, 50, 100] as RGB,
	label: [255, 50, 100] as RGB,
	note: [102, 204, 170] as RGB,
	velocity: [204, 136, 102] as RGB,
	patch: [136, 136, 204] as RGB,
	lock: [204, 204, 102] as RGB,
	accent: [102, 204, 102] as RGB,
	value: [102, 170, 204] as RGB,

	// Page indicator
	pageActive: [255, 255, 255] as RGB,
	pageInactive: [85, 85, 85] as RGB,
};
