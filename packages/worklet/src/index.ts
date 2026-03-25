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

	node.port.postMessage({
		type: "init",
		sampleRate: context.sampleRate,
		numTracks: options.numTracks ?? 8,
	});

	await new Promise<void>((resolve, reject) => {
		node.port.onmessage = (e) => {
			if (e.data.type === "ready") resolve();
			if (e.data.type === "error") reject(new Error(e.data.message));
		};
	});

	return node;
}
