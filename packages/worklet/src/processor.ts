/**
 * AudioWorkletProcessor for the Helm engine.
 * Bundled by Rollup into a single file with the WASM module inlined.
 *
 * All messages are raw ArrayBuffers sent via port.postMessage(buf, [buf])
 * for zero-copy transfer. The message type byte is at offset 0, matching
 * @helm-audio/protocol's MessageType enum.
 */

import createHelmModule from "../../../build/wasm/helm_engine.mjs";

type HelmModule = Awaited<ReturnType<typeof createHelmModule>>;
type SynthBinding = InstanceType<HelmModule["SynthBinding"]>;

let module: HelmModule | null = null;
let engine: SynthBinding | null = null;

// MessageType.Init = 0x00
const MSG_INIT = 0x00;

class HelmProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this.port.onmessage = (e) => {
			this.handleMessage(e.data as ArrayBuffer);
		};
	}

	handleMessage(msg: ArrayBuffer) {
		if (!(msg instanceof ArrayBuffer) || msg.byteLength === 0) return;

		const view = new DataView(msg);
		const type = view.getUint8(0);

		if (type === MSG_INIT) {
			void this.initEngine(view);
			return;
		}

		// All other messages go to the C++ protocol decoder
		if (!engine || !module) return;
		const ptr = module._malloc(msg.byteLength);
		const heap = new Uint8Array(module.HEAPU8.buffer, ptr, msg.byteLength);
		heap.set(new Uint8Array(msg));
		engine.receiveMessage(ptr, msg.byteLength);
		module._free(ptr);
	}

	// Init wire format: [type: u8] [sampleRate: f32 LE] [numTracks: u8]
	async initEngine(view: DataView) {
		try {
			const sampleRate = view.getFloat32(1, true);
			const numTracks = view.getUint8(5);

			module = await createHelmModule();
			engine = new module.SynthBinding();
			engine.init(sampleRate, numTracks);
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
		const heap = module.HEAPF32;
		const leftOffset = leftPtr / 4;
		const rightOffset = rightPtr / 4;

		const output = outputs[0];
		if (output[0]) output[0].set(heap.subarray(leftOffset, leftOffset + 128));
		if (output[1]) output[1].set(heap.subarray(rightOffset, rightOffset + 128));

		return true;
	}
}

registerProcessor("helm-processor", HelmProcessor);
