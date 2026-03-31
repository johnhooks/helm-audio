/**
 * AudioWorkletProcessor for a single FM4 voice.
 *
 * All messages are raw ArrayBuffers sent via port.postMessage(buf, [buf])
 * for zero-copy transfer. The message type byte is at offset 0, matching
 * @helm-audio/protocol's VoiceMessageType enum.
 *
 * Outputs:
 *   0: dry mono (1ch)
 *   1-4: dry × send level per-sample (1ch each)
 */

import createHelmVoiceModule from "../../../build/wasm/helm_voice.mjs";

type HelmVoiceModule = Awaited<ReturnType<typeof createHelmVoiceModule>>;
type VoiceBinding = InstanceType<HelmVoiceModule["VoiceBinding"]>;

const BLOCK_SIZE = 128;
const NUM_SENDS = 4;

// VoiceMessageType.Init = 0x00
const MSG_INIT = 0x00;

class VoiceProcessor extends AudioWorkletProcessor {
	#voice: VoiceBinding | null = null;
	#module: HelmVoiceModule | null = null;

	constructor() {
		super();
		this.port.onmessage = (e: MessageEvent) => {
			this.#handlePortMessage(e);
		};
	}

	#handlePortMessage(e: MessageEvent): void {
		// JSON messages: port transfer for sequencer worker connection
		if (!(e.data instanceof ArrayBuffer)) {
			const msg = e.data as { type: string; port?: MessagePort };
			if (msg.type === "connectPort" && msg.port) {
				msg.port.onmessage = (ev: MessageEvent) => {
					this.#handleBinary(ev.data as ArrayBuffer);
				};
			}
			return;
		}
		this.#handleBinary(e.data);
	}

	#handleBinary(msg: ArrayBuffer): void {
		if (msg.byteLength === 0) return;

		const view = new DataView(msg);
		const type = view.getUint8(0);

		if (type === MSG_INIT) {
			void this.#init(view);
			return;
		}

		// All other messages go to the C++ protocol decoder
		if (!this.#voice || !this.#module) return;
		const ptr = this.#module._malloc(msg.byteLength);
		const heap = new Uint8Array(this.#module.HEAPU8.buffer, ptr, msg.byteLength);
		heap.set(new Uint8Array(msg));
		this.#voice.receiveMessage(ptr, msg.byteLength);
		this.#module._free(ptr);
	}

	// Init wire format: [type: u8] [sampleRate: f32 LE]
	async #init(view: DataView): Promise<void> {
		try {
			const sampleRate = view.getFloat32(1, true);

			this.#module = await createHelmVoiceModule();
			this.#voice = new this.#module.VoiceBinding();
			this.#voice.init(sampleRate);
			this.port.postMessage({ type: "ready" });
		} catch (err) {
			this.port.postMessage({ type: "error", message: String(err) });
		}
	}

	process(
		_inputs: Float32Array[][],
		outputs: Float32Array[][],
		_parameters: Record<string, Float32Array>,
	): boolean {
		if (!this.#voice || !this.#module) return true;

		const outPtr = this.#voice.processBlock();
		const heap = this.#module.HEAPF32;
		const offset = outPtr / 4;

		// Output 0: dry mono
		const dryOut = outputs[0][0];
		dryOut.set(heap.subarray(offset, offset + BLOCK_SIZE));

		// Outputs 1-4: dry × per-sample send level
		for (let s = 0; s < NUM_SENDS; s++) {
			const sendOut = outputs[s + 1][0];
			const sendPtr = this.#voice.getSendBuffer(s);
			const sendOffset = sendPtr / 4;
			for (let i = 0; i < BLOCK_SIZE; i++) {
				sendOut[i] = heap[offset + i] * heap[sendOffset + i];
			}
		}

		return true;
	}
}

registerProcessor("helm-voice", VoiceProcessor);
