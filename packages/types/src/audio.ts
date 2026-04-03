// --- Patch -------------------------------------------------------------------

export interface OperatorPatch {
	ratio: number;
	detune: number;
	level: number;
	feedback: number;
	attack: number;
	decay: number;
	sustain: number;
	release: number;
}

export enum LfoWaveform {
	Sine = 0,
	Triangle = 1,
	Saw = 2,
	Square = 3,
}

export enum ParamId {
	FilterFreq = 0,
	Index = 1,
	Pitch = 2,
	Send0 = 3,
	Send1 = 4,
	Send2 = 5,
	Send3 = 6,
	Ratio = 7,
	FilterRes = 8,
	Attack = 9,
	Decay = 10,
	Sustain = 11,
	Release = 12,
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

export interface Patch {
	operators: [OperatorPatch, OperatorPatch];
	index: number;
	filterFreq: number;
	filterRes: number;
	sends: [number, number, number, number];
	lfos: [LfoConfig, LfoConfig];
	attack: number;
	decay: number;
	sustain: number;
	release: number;
}

// --- Pattern -----------------------------------------------------------------

export enum TrigType {
	NoteOn = 1,
	NoteOff = 2,
	FadeOut = 3,
}

export interface ParamLock {
	param: ParamId;
	value: number;
}

export interface NoteOnTrig {
	type: TrigType.NoteOn;
	note: number;
	velocity: number;
}

export interface NoteOffTrig {
	type: TrigType.NoteOff;
}

export interface FadeOutTrig {
	type: TrigType.FadeOut;
}

export type Trig = NoteOnTrig | NoteOffTrig | FadeOutTrig;

export interface Step {
	stepIndex: number;
	microTiming?: number;
	oneshot?: boolean;
	patchIndex?: number;
	trig?: Trig;
	locks?: ParamLock[];
	/*
	 * Note duration in ticks. undefined = infinite (no auto note-off).
	 */
	length?: number;
}

export interface Track {
	stepCount: number;
	events: Step[];
}

export interface PatternData {
	length: number;
	tracks: Track[];
}

// --- Effects -----------------------------------------------------------------

export enum EffectType {
	Delay = 0,
	Reverb = 1,
	Overdrive = 2,
	Chorus = 3,
}

export interface DelayConfig {
	type: EffectType.Delay;
	time: number;
	feedback: number;
	mix: number;
}

export interface ReverbConfig {
	type: EffectType.Reverb;
	feedback: number;
	lpFreq: number;
}

export interface OverdriveConfig {
	type: EffectType.Overdrive;
	drive: number;
}

export interface ChorusConfig {
	type: EffectType.Chorus;
	rate: number;
	depth: number;
	feedback: number;
	delay: number;
}

export type EffectConfig = DelayConfig | ReverbConfig | OverdriveConfig | ChorusConfig;

export interface BusConfig {
	slots: EffectConfig[];
}

export type BusSetup = [BusConfig, BusConfig, BusConfig, BusConfig];
