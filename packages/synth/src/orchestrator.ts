/**
 * Main-thread audio coordinator.
 *
 * Creates an AudioContext, 8 fm4 voice worklets, and a sequencer worker.
 * Routes sequencer output to voices via transferred MessagePorts.
 * All voice audio routes through an AnalyserNode to the destination.
 *
 * Effect bus nodes are not yet implemented — send lanes are unconnected.
 */

import { encodeVoicePatch, encodeVoiceNoteOn, encodeVoiceNoteOff } from "@helm-audio/protocol";
import type { fm4, PatternData } from "@helm-audio/types";
import { createVoiceNode, connectSequencerPort } from "@helm-audio/voice";
import type { InitMessage, ControlMessage, ReportMessage } from "@helm-audio/sequencer";

const NUM_TRACKS = 8;

export interface OrchestratorOptions {
	voiceProcessorUrl: string;
	workerUrl: string;
}

type StepReportCallback = (step: number) => void;

export class Orchestrator {
	readonly context: AudioContext;
	readonly analyser: AnalyserNode;
	#voices: AudioWorkletNode[];
	#worker: Worker;
	#controlPort: MessagePort;
	#stepReportCb: StepReportCallback | null = null;

	private constructor(
		context: AudioContext,
		analyser: AnalyserNode,
		voices: AudioWorkletNode[],
		worker: Worker,
		controlPort: MessagePort,
	) {
		this.context = context;
		this.analyser = analyser;
		this.#voices = voices;
		this.#worker = worker;
		this.#controlPort = controlPort;

		this.#controlPort.onmessage = (e: MessageEvent<ReportMessage>) => {
			const msg = e.data;
			if (msg.type === "stepReport") {
				this.#stepReportCb?.(msg.step);
			}
		};
	}

	static async create(options: OrchestratorOptions): Promise<Orchestrator> {
		const ctx = new AudioContext();
		const analyser = ctx.createAnalyser();
		analyser.connect(ctx.destination);

		// Create 8 voice worklet nodes
		const voices: AudioWorkletNode[] = [];
		for (let i = 0; i < NUM_TRACKS; i++) {
			const node = await createVoiceNode(ctx, {
				processorUrl: options.voiceProcessorUrl,
			});
			// Connect dry output (output 0) to analyser
			node.connect(analyser, 0);
			voices.push(node);
		}

		// Create per-track message channels for sequencer → voice communication
		const workerVoicePorts: MessagePort[] = [];
		for (let i = 0; i < NUM_TRACKS; i++) {
			const channel = new MessageChannel();
			workerVoicePorts.push(channel.port1);
			connectSequencerPort(voices[i], channel.port2);
		}

		// Create control channel for main ↔ worker communication
		const controlChannel = new MessageChannel();

		// Boot sequencer worker
		const worker = new Worker(options.workerUrl, { type: "module" });
		const initMsg: InitMessage = {
			type: "init",
			controlPort: controlChannel.port2,
			voicePorts: workerVoicePorts,
			fxPorts: [],
		};
		worker.postMessage(initMsg, [controlChannel.port2, ...workerVoicePorts]);

		return new Orchestrator(ctx, analyser, voices, worker, controlChannel.port1);
	}

	// --- Transport ---

	play(): void {
		this.#sendControl({ type: "transport", command: "play" });
	}

	stop(): void {
		this.#sendControl({ type: "transport", command: "stop" });
	}

	restart(): void {
		this.#sendControl({ type: "transport", command: "restart" });
	}

	// --- Data ---

	loadPatchBank(patches: fm4.Patch[]): void {
		this.#sendControl({ type: "setPatchBank", patches });
	}

	loadPattern(pattern: PatternData): void {
		this.#sendControl({ type: "loadPatternImmediate", pattern });
	}

	setTempo(bpm: number): void {
		this.#sendControl({ type: "setTempo", bpm });
	}

	// --- Live playing (keyjazz, bypasses sequencer) ---

	noteOn(track: number, note: number, velocity: number): void {
		if (track < 0 || track >= NUM_TRACKS) return;
		const buf = encodeVoiceNoteOn(note, velocity);
		this.#voices[track].port.postMessage(buf, [buf]);
	}

	noteOff(track: number): void {
		if (track < 0 || track >= NUM_TRACKS) return;
		const buf = encodeVoiceNoteOff();
		this.#voices[track].port.postMessage(buf, [buf]);
	}

	/** Load a patch into a specific voice (live, bypasses patch bank). */
	loadVoicePatch(track: number, patch: fm4.Patch): void {
		if (track < 0 || track >= NUM_TRACKS) return;
		const buf = encodeVoicePatch(patch);
		this.#voices[track].port.postMessage(buf, [buf]);
	}

	// --- Reporting ---

	onStepReport(cb: StepReportCallback): void {
		this.#stepReportCb = cb;
	}

	// --- Internal ---

	#sendControl(msg: ControlMessage): void {
		this.#controlPort.postMessage(msg);
	}
}
