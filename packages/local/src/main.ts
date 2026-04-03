import { Renderer, DisplayList, FONT_SMALL } from "@helm-audio/display";
import {
	TrackerStore,
	createInitialState,
	OpfsStorage,
	extractProject,
	applyProject,
} from "@helm-audio/store";
import { Orchestrator } from "@helm-audio/synth";
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

// --- Storage ---

const storage = new OpfsStorage();

async function loadProject(): Promise<TrackerStore> {
	const project = await storage.load();
	const state = project ? applyProject(project) : createInitialState(8);
	return new TrackerStore(state);
}

// --- Boot ---

async function boot(): Promise<void> {
	const store = await loadProject();

	// Boot audio engine
	const orchestrator = await Orchestrator.create({
		voiceProcessorUrl: "/voice-processor.js",
		workerUrl: "/sequencer-worker.js",
	});
	store.connectOrchestrator(orchestrator);
	store.syncAll();

	// Resume AudioContext on first user interaction (browser policy)
	const resumeOnce = () => {
		if (orchestrator.context.state === "suspended") {
			void orchestrator.context.resume();
		}
		document.removeEventListener("keydown", resumeOnce);
		document.removeEventListener("mousedown", resumeOnce);
	};
	document.addEventListener("keydown", resumeOnce);
	document.addEventListener("mousedown", resumeOnce);

	const ui = new Tracker(store);

	// --- Auto-save (debounced) ---

	let saveTimer: ReturnType<typeof setTimeout> | null = null;

	ui.onAction = () => {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			void storage.save(extractProject(store.state));
		}, 1000);
	};

	// --- Input ---

	document.addEventListener("keydown", (e) => {
		if (ui.handleKeyDown(e)) {
			e.preventDefault();
		}
	});
	document.addEventListener("keyup", (e) => {
		if (ui.handleKeyUp(e)) {
			e.preventDefault();
		}
	});

	// --- Render loop ---

	renderer.onReady = () => {
		ui.dirty = true;
	};
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
}

void boot();
