/**
 * AudioWorkletProcessor for the Helm engine.
 * Bundled by tsup into a single file with the WASM module inlined.
 */

import createHelmModule from "../../../build/wasm/helm_engine.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let module: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let engine: any = null;

class HelmProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this.port.onmessage = (e) => this.handleMessage(e.data);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	handleMessage(msg: any) {
		switch (msg.type) {
			case "init":
				this.initEngine(msg);
				break;
			case "noteOn":
				engine?.noteOn(msg.track, msg.note, msg.velocity);
				break;
			case "noteOff":
				engine?.noteOff(msg.track);
				break;
			case "setTempo":
				engine?.setTempo(msg.bpm);
				break;
			case "play":
				engine?.play();
				break;
			case "stop":
				engine?.stop();
				break;
			case "configurePatch":
				engine?.configurePatch(
					msg.patchIndex,
					msg.index,
					msg.filterFreq,
					msg.filterRes,
					msg.attack,
					msg.decay,
					msg.sustain,
					msg.release,
				);
				break;
			case "loadPatch":
				engine?.loadPatch(msg.track, msg.patchIndex);
				break;
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async initEngine(msg: any) {
		try {
			module = await createHelmModule();
			engine = new module.SynthBinding();
			engine.init(msg.sampleRate, msg.numTracks ?? 8);
			this.port.postMessage({ type: "ready" });
		} catch (err) {
			this.port.postMessage({
				type: "error",
				message: String(err),
			});
		}
	}

	process(
		_inputs: Float32Array[][],
		outputs: Float32Array[][],
		_parameters: Record<string, Float32Array>,
	): boolean {
		if (!engine || !module) {
			return true;
		}

		const leftPtr = engine.process();
		const rightPtr = engine.getRight();

		// Read HEAPF32 fresh each call — it changes if WASM memory grows
		const heap = module.HEAPF32 as Float32Array;
		const leftOffset = leftPtr / 4;
		const rightOffset = rightPtr / 4;

		const output = outputs[0];
		if (output[0])
			output[0].set(heap.subarray(leftOffset, leftOffset + 128));
		if (output[1])
			output[1].set(heap.subarray(rightOffset, rightOffset + 128));

		return true;
	}
}

registerProcessor("helm-processor", HelmProcessor);
