/**
 * AudioWorkletProcessor for a single FM voice.
 *
 * Receives plain JS objects via MessagePort (not binary protocol).
 * Two message sources, both using the same VoiceMessage format:
 *   - Main thread (node.port): live keyjazz, UI patch editing
 *   - Sequencer worker (transferred port): pattern playback
 *
 * Outputs:
 *   0: dry mono (1ch)
 *   1-4: dry × send level per-sample (1ch each)
 */

import type { Patch } from "@helm-audio/types";
import createHelmVoiceModule from "../../../build/wasm/helm_voice.mjs";

type HelmVoiceModule = Awaited<ReturnType<typeof createHelmVoiceModule>>;
type VoiceBinding = InstanceType<HelmVoiceModule["VoiceBinding"]>;

const BLOCK_SIZE = 128;
const NUM_SENDS = 4;

interface VoiceMessage {
	type: string;
	[key: string]: unknown;
}

class VoiceProcessor extends AudioWorkletProcessor {
	#voice: VoiceBinding | null = null;
	#module: HelmVoiceModule | null = null;

	constructor() {
		super();
		this.port.onmessage = (e: MessageEvent) => {
			this.#handleMessage(e.data as VoiceMessage);
		};
	}

	#handleMessage(msg: VoiceMessage): void {
		switch (msg.type) {
			case "init":
				void this.#init(msg.sampleRate as number);
				break;
			case "connectSequencer": {
				const port = msg.port as MessagePort;
				port.onmessage = (e: MessageEvent) => {
					this.#handleVoiceMessage(e.data as VoiceMessage);
				};
				break;
			}
			default:
				this.#handleVoiceMessage(msg);
		}
	}

	#handleVoiceMessage(msg: VoiceMessage): void {
		if (!this.#voice) return;
		switch (msg.type) {
			case "noteOn":
				this.#voice.noteOn(msg.note as number, msg.velocity as number);
				break;
			case "noteOff":
				this.#voice.noteOff();
				break;
			case "fadeOut":
				this.#voice.fadeOut();
				break;
			case "loadPatch":
				this.#loadPatch(msg.patch as Patch);
				break;
			case "paramLock":
				this.#voice.setParam(msg.param as number, msg.value as number);
				break;
		}
	}

	#loadPatch(patch: Patch): void {
		const v = this.#voice!;
		for (let i = 0; i < 2; i++) {
			const op = patch.operators[i];
			v.configureOperator(
				i, op.ratio, op.detune, op.level, op.feedback,
				op.attack, op.decay, op.sustain, op.release,
			);
		}
		v.configureFilter(patch.filterFreq, patch.filterRes);
		v.configureEnvelope(patch.attack, patch.decay, patch.sustain, patch.release);
		v.setIndex(patch.index);
		v.setSends(patch.sends[0], patch.sends[1], patch.sends[2], patch.sends[3]);
		for (let i = 0; i < 2; i++) {
			const lfo = patch.lfos[i];
			v.configureLfo(i, lfo.rate, lfo.waveform);
			v.clearLfoRoutes(i);
			for (const route of lfo.routes) {
				v.addLfoRoute(i, route.target, route.depth);
			}
		}
		v.applyPatch();
	}

	async #init(sampleRate: number): Promise<void> {
		try {
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
		const dryOut = outputs[0]?.[0];
		if (dryOut) {
			dryOut.set(heap.subarray(offset, offset + BLOCK_SIZE));
		}

		// Outputs 1-4: dry × per-sample send level
		for (let s = 0; s < NUM_SENDS; s++) {
			const sendOut = outputs[s + 1]?.[0];
			if (!sendOut) continue;
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
