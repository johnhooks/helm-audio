import { Renderer, DisplayList, FONT_SMALL } from "@helm-audio/display";

// --- Palette ---

const C = {
	bg: [10, 10, 10] as const,
	bgMinor: [17, 17, 17] as const,
	bgMajor: [26, 26, 26] as const,
	cursorRow: [26, 42, 26] as const,
	playbackRow: [42, 26, 26] as const,
	textDim: [85, 85, 85] as const,
	textNormal: [136, 136, 136] as const,
	textBright: [204, 204, 204] as const,
	textHighlight: [255, 255, 255] as const,
	note: [102, 204, 170] as const,
	velocity: [204, 136, 102] as const,
	patch: [136, 136, 204] as const,
	lock: [204, 204, 102] as const,
	accent: [102, 204, 102] as const,
};

// --- Grid setup ---

const COLUMNS = 60;
const ROWS = 32;

const canvas = document.getElementById("display") as HTMLCanvasElement;
const renderer = new Renderer({
	canvas,
	columns: COLUMNS,
	rows: ROWS,
	font: FONT_SMALL,
	fontUrl: "/font-small.png",
	background: [10, 10, 10],
});

const display = new DisplayList(COLUMNS, ROWS);

// --- Demo pattern data ---

interface DemoStep {
	note?: string;
	vel?: string;
	patch?: string;
}

const TRACK_NAMES = ["kick", "bass", "hat", "pad"];
const PATTERN_LENGTH = 16;
const VISIBLE_ROWS = 24;

const tracks: DemoStep[][] = [
	// kick
	[
		{ note: "C-2", vel: "7F", patch: "V00" },
		{},
		{},
		{},
		{ note: "C-2", vel: "64", patch: "V00" },
		{},
		{},
		{},
		{ note: "C-2", vel: "7F", patch: "V00" },
		{},
		{},
		{},
		{ note: "C-2", vel: "64", patch: "V00" },
		{},
		{},
		{},
	],
	// bass
	[
		{ note: "E-1", vel: "60", patch: "V01" },
		{},
		{},
		{},
		{},
		{},
		{ note: "G-1", vel: "60", patch: "V01" },
		{},
		{},
		{},
		{ note: "E-1", vel: "60", patch: "V01" },
		{},
		{},
		{},
		{},
		{},
	],
	// hat
	[
		{},
		{},
		{ note: "F#5", vel: "40", patch: "V02" },
		{},
		{},
		{},
		{ note: "F#5", vel: "60", patch: "V02" },
		{},
		{},
		{},
		{ note: "F#5", vel: "40", patch: "V02" },
		{},
		{},
		{},
		{ note: "F#5", vel: "50", patch: "V02" },
		{},
	],
	// pad
	[
		{ note: "C-4", vel: "50", patch: "V03" },
		{},
		{},
		{},
		{},
		{},
		{},
		{},
		{ note: "E-4", vel: "50", patch: "V03" },
		{},
		{},
		{},
		{},
		{},
		{},
		{},
	],
];

// --- Draw functions ---

function drawTransport(
	row: number,
	playing: boolean,
	bpm: number,
	pattern: number,
	octave: number,
) {
	const icon = playing ? ">" : "#";
	const [ir, ig, ib] = playing ? C.accent : C.textDim;
	display.drawText(1, row, icon, ir, ig, ib);

	display.drawText(3, row, `${bpm.toFixed(1)} BPM`, ...C.textNormal);
	display.drawText(16, row, `Pat ${String(pattern).padStart(2, "0")}`, ...C.textNormal);
	display.drawText(33, row, `Oct ${String(octave)}`, ...C.textNormal);
	display.drawText(41, row, "EDIT", ...C.textBright);
}

function drawTrackHeaders(row: number) {
	display.drawText(0, row, " ST ", ...C.textDim);
	for (let t = 0; t < TRACK_NAMES.length; t++) {
		const col = 5 + t * 9;
		const name = TRACK_NAMES[t].padEnd(8).slice(0, 8);
		display.drawText(col, row, name, ...C.textNormal);
	}
}

function drawPatternGrid(startRow: number, cursorRow: number, playbackRow: number) {
	for (let r = 0; r < VISIBLE_ROWS; r++) {
		const patRow = r % PATTERN_LENGTH;
		const screenRow = startRow + r;

		// Row background
		const isCursor = patRow === cursorRow;
		const isPlayback = patRow === playbackRow;
		const isMajor = patRow % 4 === 0;

		if (isPlayback) {
			display.addRect(0, screenRow, COLUMNS, 1, ...C.playbackRow);
		} else if (isCursor) {
			display.addRect(0, screenRow, COLUMNS, 1, ...C.cursorRow);
		} else if (isMajor) {
			display.addRect(0, screenRow, COLUMNS, 1, ...C.bgMajor);
		} else if (patRow % 2 === 0) {
			display.addRect(0, screenRow, COLUMNS, 1, ...C.bgMinor);
		}

		// Row number
		const [rr, rg, rb] = isPlayback ? C.textBright : isMajor ? C.textNormal : C.textDim;
		display.drawText(0, screenRow, String(patRow).padStart(3, "0"), rr, rg, rb);
		display.drawText(3, screenRow, "|", ...C.textDim);

		// Track columns
		for (let t = 0; t < tracks.length; t++) {
			const col = 5 + t * 9;
			const step = tracks[t][patRow];

			if (step.note) {
				display.drawText(col, screenRow, step.note, ...C.note);
			} else {
				display.drawText(col, screenRow, "---", ...C.textDim);
			}

			if (step.vel) {
				display.drawText(col + 4, screenRow, step.vel, ...C.velocity);
			} else {
				display.drawText(col + 4, screenRow, "--", ...C.textDim);
			}

			if (step.patch) {
				display.drawText(col + 7, screenRow, step.patch[1], ...C.patch);
			} else {
				display.drawText(col + 7, screenRow, "-", ...C.textDim);
			}
		}
	}
}

function drawStatusBar(row: number) {
	display.drawText(1, row, "Ch 0  Row 00  Pos 0", ...C.textDim);
	display.drawText(45, row, "helm-audio", ...C.textDim);
}

// --- Render loop ---

let playbackRow = 0;
let lastStepTime = 0;
let dirty = true;
let animating = false; // true while any animation is in progress
const BPM = 120;
const MS_PER_STEP = 60_000 / BPM / 4;

// Animations are time-limited effects that keep the display redrawing.
// When an animation starts, set animatingUntil to the end time.
// The frame loop keeps rendering until all animations expire.
let animatingUntil = 0;

function startAnimation(durationMs: number, now: number) {
	animatingUntil = Math.max(animatingUntil, now + durationMs);
	animating = true;
}

renderer.resize();
window.addEventListener("resize", () => {
	renderer.resize();
	dirty = true;
});

// Any keyboard input marks the display dirty.
// The tracker state layer (not yet built) will handle the actual mutations.
document.addEventListener("keydown", () => {
	dirty = true;
});

function frame(now: number) {
	requestAnimationFrame(frame);

	// Advance playback row
	if (now - lastStepTime >= MS_PER_STEP) {
		playbackRow = (playbackRow + 1) % PATTERN_LENGTH;
		lastStepTime = now;
		dirty = true;
		startAnimation(50, now); // playback row sweep
	}

	// Check if animations have expired
	if (animating && now >= animatingUntil) {
		animating = false;
		dirty = true; // one final frame to settle
	}

	if (!dirty && !animating) return;
	dirty = false;

	display.clear();

	drawTransport(0, true, BPM, 0, 4);
	display.addRect(0, 1, COLUMNS, 1, ...C.bgMajor);
	drawTrackHeaders(2);
	display.addRect(0, 3, COLUMNS, 1, ...C.bgMajor);
	drawPatternGrid(4, 0, playbackRow);
	display.addRect(0, 29, COLUMNS, 1, ...C.bgMajor);
	drawStatusBar(30);

	renderer.draw(display);
}

requestAnimationFrame(frame);
