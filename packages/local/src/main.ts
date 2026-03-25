import { createHelmNode } from "@helm-audio/worklet";

let node: AudioWorkletNode | null = null;
let ctx: AudioContext | null = null;

const status = document.getElementById("status")!;

function setStatus(msg: string) {
	status.textContent = msg;
}

document.getElementById("start")!.addEventListener("click", async () => {
	if (ctx) return;

	setStatus("Initializing...");

	try {
		ctx = new AudioContext();

		node = await createHelmNode(ctx, {
			processorUrl: "/processor.js",
		});

		node.connect(ctx.destination);

		// Configure a default patch: warm FM tone
		node.port.postMessage({
			type: "configurePatch",
			patchIndex: 0,
			index: 1.5,
			filterFreq: 4000,
			filterRes: 0.2,
			attack: 0.01,
			decay: 0.3,
			sustain: 0.6,
			release: 0.5,
		});

		// Load patch onto track 0
		node.port.postMessage({ type: "loadPatch", track: 0, patchIndex: 0 });

		setStatus(
			`Engine ready. Sample rate: ${ctx.sampleRate} Hz. Click a note.`,
		);
	} catch (err) {
		setStatus(`Error: ${err}`);
		console.error(err);
	}
});

// Note buttons — mousedown triggers, mouseup releases
for (const btn of document.querySelectorAll<HTMLButtonElement>(".note")) {
	const note = parseInt(btn.dataset.note!, 10);

	btn.addEventListener("mousedown", () => {
		if (!node) return;
		node.port.postMessage({ type: "noteOn", track: 0, note, velocity: 100 });
		btn.classList.add("active");
	});

	btn.addEventListener("mouseup", () => {
		if (!node) return;
		node.port.postMessage({ type: "noteOff", track: 0 });
		btn.classList.remove("active");
	});

	btn.addEventListener("mouseleave", () => {
		if (!node) return;
		node.port.postMessage({ type: "noteOff", track: 0 });
		btn.classList.remove("active");
	});
}

// Release button
document.getElementById("release")!.addEventListener("click", () => {
	if (!node) return;
	node.port.postMessage({ type: "noteOff", track: 0 });
	for (const btn of document.querySelectorAll<HTMLButtonElement>(".note")) {
		btn.classList.remove("active");
	}
});
