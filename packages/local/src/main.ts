import { createHelmNode, send } from "@helm-audio/worklet";
import {
	encodePatchBank,
	encodeTrigger,
	TrigType,
	LfoWaveform,
	type Patch,
	type OperatorPatch,
	type LfoConfig,
} from "@helm-audio/protocol";

let node: AudioWorkletNode | null = null;
let ctx: AudioContext | null = null;

const status = document.getElementById("status");

function setStatus(msg: string) {
	if (status) status.textContent = msg;
}

const defaultOp: OperatorPatch = {
	ratio: 1.0,
	detune: 0,
	level: 1.0,
	feedback: 0,
	attack: 0.01,
	decay: 0.1,
	sustain: 1.0,
	release: 0.3,
};

const defaultLfo: LfoConfig = {
	rate: 1.0,
	waveform: LfoWaveform.Sine,
	routes: [],
};

const patch: Patch = {
	operators: [{ ...defaultOp }, { ...defaultOp, ratio: 2.0, level: 0.8, decay: 0.2, sustain: 0.4 }],
	index: 1.5,
	filterFreq: 4000,
	filterRes: 0.2,
	sends: [0, 0, 0, 0],
	lfos: [defaultLfo, defaultLfo],
	attack: 0.01,
	decay: 0.3,
	sustain: 0.6,
	release: 0.5,
};

async function init() {
	if (ctx) return;

	setStatus("Initializing...");

	try {
		ctx = new AudioContext();

		node = await createHelmNode(ctx, {
			processorUrl: "/processor.js",
		});

		node.connect(ctx.destination);

		send(node, encodePatchBank([patch]));

		setStatus(`Engine ready. Sample rate: ${String(ctx.sampleRate)} Hz. Click a note.`);
	} catch (err: unknown) {
		setStatus(`Error: ${String(err)}`);
		console.error(err);
	}
}

document.getElementById("start")?.addEventListener("click", () => {
	void init();
});

// Note buttons — mousedown triggers, mouseup releases
for (const btn of document.querySelectorAll<HTMLButtonElement>(".note")) {
	const note = parseInt(btn.dataset.note ?? "60", 10);

	btn.addEventListener("mousedown", () => {
		if (!node) return;
		send(
			node,
			encodeTrigger({
				track: 0,
				patchIndex: 0,
				trig: { type: TrigType.NoteOn, note, velocity: 100 },
			}),
		);
		btn.classList.add("active");
	});

	btn.addEventListener("mouseup", () => {
		if (!node) return;
		send(
			node,
			encodeTrigger({
				track: 0,
				trig: { type: TrigType.NoteOff },
			}),
		);
		btn.classList.remove("active");
	});

	btn.addEventListener("mouseleave", () => {
		if (!node) return;
		send(
			node,
			encodeTrigger({
				track: 0,
				trig: { type: TrigType.NoteOff },
			}),
		);
		btn.classList.remove("active");
	});
}

// Release button
document.getElementById("release")?.addEventListener("click", () => {
	if (!node) return;
	send(
		node,
		encodeTrigger({
			track: 0,
			trig: { type: TrigType.NoteOff },
		}),
	);
	for (const btn of document.querySelectorAll<HTMLButtonElement>(".note")) {
		btn.classList.remove("active");
	}
});
