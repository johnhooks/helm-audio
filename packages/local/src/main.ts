import { Renderer, DisplayList, FONT_SMALL } from "@helm-audio/display";
import { TrackerStore, createInitialState } from "@helm-audio/store";
import { Tracker } from "@helm-audio/ui";

// --- Grid setup ---

const COLUMNS = 60;
const ROWS = 25;

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

// --- Store + UI ---

const store = new TrackerStore(createInitialState(8));
const ui = new Tracker(store);

// --- Input ---

document.addEventListener("keydown", (e) => {
	if (ui.handleKeyDown(e)) {
		e.preventDefault();
	}
});

// --- Render loop ---

renderer.resize();
window.addEventListener("resize", () => {
	renderer.resize();
	ui.dirty = true;
});

function frame(_now: number) {
	requestAnimationFrame(frame);
	if (!ui.dirty) return;
	ui.draw(display);
	renderer.draw(display);
}

requestAnimationFrame(frame);
