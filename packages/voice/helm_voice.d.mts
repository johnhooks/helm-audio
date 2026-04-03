interface HelmVoiceModule {
	VoiceBinding: new () => VoiceBinding;
	HEAPF32: Float32Array;
	HEAPU8: Uint8Array;
	_malloc(size: number): number;
	_free(ptr: number): void;
}

interface VoiceBinding {
	init(sampleRate: number): void;
	receiveMessage(dataPtr: number, length: number): void;
	processBlock(): number;
	getSendBuffer(idx: number): number;
	getState(): number;
}

declare function createHelmVoiceModule(): Promise<HelmVoiceModule>;
export default createHelmVoiceModule;
