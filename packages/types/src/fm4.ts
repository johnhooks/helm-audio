import type { LfoWaveform } from "./audio.ts";

export interface OperatorPatch {
	ratio: number;
	detune: number;
	level: number;
}

export enum ParamId {
	FilterFreq = 0,
	Index = 1,
	Pitch = 2,
	Send0 = 3,
	Send1 = 4,
	Send2 = 5,
	Send3 = 6,
	Algorithm = 7,
	Feedback = 8,
	FilterRes = 9,
	AmpAttack = 10,
	AmpDecay = 11,
	AmpSustain = 12,
	AmpRelease = 13,
	EnvAAttack = 14,
	EnvADecay = 15,
	EnvASustain = 16,
	EnvARelease = 17,
	EnvBAttack = 18,
	EnvBDecay = 19,
	EnvBSustain = 20,
	EnvBRelease = 21,
	RatioA = 22,
	RatioB = 23,
	RatioC = 24,
	RatioD = 25,
	DetuneA = 26,
	DetuneB = 27,
	DetuneC = 28,
	DetuneD = 29,
	LevelA = 30,
	LevelB = 31,
	LevelC = 32,
	LevelD = 33,
}

export interface ModRouting {
	target: ParamId;
	depth: number;
}

export interface LfoConfig {
	rate: number;
	waveform: LfoWaveform;
	routes: ModRouting[];
}

export interface Envelope {
	attack: number;
	decay: number;
	sustain: number;
	release: number;
}

export interface Patch {
	operators: [OperatorPatch, OperatorPatch, OperatorPatch, OperatorPatch];
	algorithm: number;
	index: number;
	feedback: number;
	envA: Envelope;
	envB: Envelope;
	ampEnv: Envelope;
	filterFreq: number;
	filterRes: number;
	sends: [number, number, number, number];
	lfos: [LfoConfig, LfoConfig];
}
