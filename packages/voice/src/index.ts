import { encodeVoiceInit } from "@helm-audio/protocol";

export interface VoiceNodeOptions {
	processorUrl: string;
}

export async function createVoiceNode(
	context: AudioContext,
	options: VoiceNodeOptions,
): Promise<AudioWorkletNode> {
	await context.audioWorklet.addModule(options.processorUrl);

	const node = new AudioWorkletNode(context, "helm-voice", {
		numberOfInputs: 0,
		numberOfOutputs: 5,
		outputChannelCount: [1, 1, 1, 1, 1],
	});

	const initBuf = encodeVoiceInit(context.sampleRate);
	node.port.postMessage(initBuf, [initBuf]);

	await new Promise<void>((resolve, reject) => {
		node.port.onmessage = (e) => {
			const msg = e.data as { type: string; message?: string };
			if (msg.type === "ready") resolve();
			if (msg.type === "error") reject(new Error(msg.message ?? "unknown error"));
		};
	});

	node.port.onmessage = null;
	return node;
}

/** Transfer a MessagePort into the voice processor for sequencer communication. */
export function connectSequencerPort(node: AudioWorkletNode, port: MessagePort): void {
	node.port.postMessage({ type: "connectPort", port }, [port]);
}
