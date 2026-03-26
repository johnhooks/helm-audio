import { encodeInit } from "@helm-audio/protocol";

export interface HelmNodeOptions {
	processorUrl: string;
	numTracks?: number;
}

export async function createHelmNode(
	context: AudioContext,
	options: HelmNodeOptions,
): Promise<AudioWorkletNode> {
	await context.audioWorklet.addModule(options.processorUrl);

	const node = new AudioWorkletNode(context, "helm-processor", {
		numberOfInputs: 0,
		numberOfOutputs: 1,
		outputChannelCount: [2],
	});

	const initBuf = encodeInit(context.sampleRate, options.numTracks ?? 8);
	node.port.postMessage(initBuf, [initBuf]);

	await new Promise<void>((resolve, reject) => {
		node.port.onmessage = (e) => {
			const msg = e.data as { type: string; message?: string };
			if (msg.type === "ready") resolve();
			if (msg.type === "error") reject(new Error(msg.message ?? "unknown error"));
		};
	});

	return node;
}

/** Send a binary protocol message to the engine. Zero-copy transfer. */
export function send(node: AudioWorkletNode, buf: ArrayBuffer): void {
	node.port.postMessage(buf, [buf]);
}
