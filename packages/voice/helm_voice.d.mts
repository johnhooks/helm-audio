interface HelmVoiceModule {
	VoiceBinding: new () => VoiceBinding;
	HEAPF32: Float32Array;
	_malloc(size: number): number;
	_free(ptr: number): void;
}

interface VoiceBinding {
	init(sampleRate: number): void;
	noteOn(note: number, velocity: number): void;
	noteOff(): void;
	fadeOut(): void;
	configureOperator(
		idx: number, ratio: number, detune: number, level: number,
		feedback: number, attack: number, decay: number,
		sustain: number, release: number,
	): void;
	configureFilter(freq: number, res: number): void;
	configureEnvelope(a: number, d: number, s: number, r: number): void;
	setIndex(value: number): void;
	setSends(s0: number, s1: number, s2: number, s3: number): void;
	configureLfo(idx: number, rate: number, waveform: number): void;
	clearLfoRoutes(lfoIdx: number): void;
	addLfoRoute(lfoIdx: number, target: number, depth: number): void;
	applyPatch(): void;
	setParam(paramId: number, value: number): void;
	processBlock(): number;
	getSendBuffer(idx: number): number;
	getState(): number;
}

declare function createHelmVoiceModule(): Promise<HelmVoiceModule>;
export default createHelmVoiceModule;
