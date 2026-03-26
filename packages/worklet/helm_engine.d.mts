interface HelmModule {
	SynthBinding: new () => SynthBinding;
	HEAPF32: Float32Array;
	HEAPU8: Uint8Array;
	_malloc(size: number): number;
	_free(ptr: number): void;
}

interface SynthBinding {
	init(sampleRate: number, numTracks: number): void;
	destroy(): void;
	process(): number;
	getRight(): number;
	receiveMessage(dataPtr: number, length: number): void;
}

declare function createHelmModule(): Promise<HelmModule>;
export default createHelmModule;
