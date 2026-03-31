// Re-export all domain types from @helm-audio/types
export {
	type OperatorPatch,
	LfoWaveform,
	ParamId,
	type ModRouting,
	type LfoConfig,
	type Patch,
	TrigType,
	type ParamLock,
	type NoteOnTrig,
	type NoteOffTrig,
	type FadeOutTrig,
	type Trig,
	type Step,
	type Track,
	type PatternData,
	EffectType,
	type DelayConfig,
	type ReverbConfig,
	type OverdriveConfig,
	type ChorusConfig,
	type EffectConfig,
	type BusConfig,
	type BusSetup,
} from "@helm-audio/types";

// --- Protocol-specific types (wire format) -----------------------------------

export enum MessageType {
	Init = 0x00,
	PatchBank = 0x01,
	Pattern = 0x02,
	BusConfig = 0x03,
	Transport = 0x04,
	Tempo = 0x05,
	Trigger = 0x06,
	StateReport = 0x07,
}

export enum TransportCommand {
	Stop = 0,
	Play = 1,
	Restart = 2,
}

import type { Trig } from "@helm-audio/types";

export interface TriggerMessage {
	track: number;
	trig: Trig;
	patchIndex?: number;
}

// --- FM4 voice worklet protocol ------------------------------------------

export enum VoiceMessageType {
	Init = 0x00,
	LoadPatch = 0x01,
	Trig = 0x02,
	NoteOn = 0x03,
	NoteOff = 0x04,
	FadeOut = 0x05,
}
