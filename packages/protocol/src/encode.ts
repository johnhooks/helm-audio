import { Builder, u8, i8, f32 } from "@bitmachina/binary";
import type { fm4 } from "@helm-audio/types";
import {
	type BusSetup,
	type EffectConfig,
	EffectType,
	type LfoConfig,
	MessageType,
	type OperatorPatch,
	type Patch,
	type PatternData,
	type Step,
	TransportCommand,
	TrigType,
	type TriggerMessage,
	VoiceMessageType,
} from "./types.ts";

// --- Flags -------------------------------------------------------------------

const HAS_TRIG = 0x01;
const HAS_LOCKS = 0x02;
const HAS_PATCH_INDEX = 0x04;
const ONESHOT = 0x08;

// --- Helpers -----------------------------------------------------------------

function writeOperator(b: Builder, op: OperatorPatch): void {
	b.write(f32, op.ratio);
	b.write(f32, op.detune);
	b.write(f32, op.level);
	b.write(f32, op.feedback);
	b.write(f32, op.attack);
	b.write(f32, op.decay);
	b.write(f32, op.sustain);
	b.write(f32, op.release);
}

function writeLfo(b: Builder, lfo: LfoConfig): void {
	b.write(f32, lfo.rate);
	b.write(u8, lfo.waveform);
	b.write(u8, lfo.routes.length);
	for (const route of lfo.routes) {
		b.write(u8, route.target);
		b.write(f32, route.depth);
	}
}

function writeEffect(b: Builder, effect: EffectConfig): void {
	b.write(u8, effect.type);
	switch (effect.type) {
		case EffectType.Delay:
			b.write(f32, effect.time);
			b.write(f32, effect.feedback);
			b.write(f32, effect.mix);
			break;
		case EffectType.Reverb:
			b.write(f32, effect.feedback);
			b.write(f32, effect.lpFreq);
			break;
		case EffectType.Overdrive:
			b.write(f32, effect.drive);
			break;
		case EffectType.Chorus:
			b.write(f32, effect.rate);
			b.write(f32, effect.depth);
			b.write(f32, effect.feedback);
			b.write(f32, effect.delay);
			break;
	}
}

// --- Encoders ----------------------------------------------------------------

export function encodeInit(sampleRate: number, numTracks: number): ArrayBuffer {
	const b = new Builder();
	b.write(u8, MessageType.Init);
	b.write(f32, sampleRate);
	b.write(u8, numTracks);
	return b.toTransferable();
}

export function encodePatchBank(patches: Patch[]): ArrayBuffer {
	const b = new Builder();
	b.write(u8, MessageType.PatchBank);
	b.write(u8, patches.length);

	for (const patch of patches) {
		writeOperator(b, patch.operators[0]);
		writeOperator(b, patch.operators[1]);

		b.write(f32, patch.index);
		b.write(f32, patch.filterFreq);
		b.write(f32, patch.filterRes);
		b.write(f32, patch.sends[0]);
		b.write(f32, patch.sends[1]);
		b.write(f32, patch.sends[2]);
		b.write(f32, patch.sends[3]);

		b.write(f32, patch.attack);
		b.write(f32, patch.decay);
		b.write(f32, patch.sustain);
		b.write(f32, patch.release);

		writeLfo(b, patch.lfos[0]);
		writeLfo(b, patch.lfos[1]);
	}

	return b.toTransferable();
}

export function encodePattern(pattern: PatternData): ArrayBuffer {
	const b = new Builder();
	b.write(u8, MessageType.Pattern);
	b.write(u8, pattern.tracks.length);
	b.write(u8, pattern.length);

	for (const track of pattern.tracks) {
		b.write(u8, track.stepCount);
		b.write(u8, track.events.length);

		for (const event of track.events) {
			b.write(u8, event.stepIndex);
			b.write(u8, buildStepFlags(event));
			b.write(i8, event.microTiming ?? 0);

			if (event.patchIndex != null) {
				b.write(u8, event.patchIndex);
			}

			if (event.trig) {
				b.write(u8, event.trig.type);
				if (event.trig.type === TrigType.NoteOn) {
					b.write(u8, event.trig.note);
					b.write(u8, event.trig.velocity);
				}
			}

			if (event.locks && event.locks.length > 0) {
				b.write(u8, event.locks.length);
				for (const lock of event.locks) {
					b.write(u8, lock.param);
					b.write(f32, lock.value);
				}
			}
		}
	}

	return b.toTransferable();
}

export function encodeBusConfig(buses: BusSetup): ArrayBuffer {
	const b = new Builder();
	b.write(u8, MessageType.BusConfig);

	for (const bus of buses) {
		b.write(u8, bus.slots.length);
		for (const slot of bus.slots) {
			writeEffect(b, slot);
		}
	}

	return b.toTransferable();
}

export function encodeTransport(command: TransportCommand): ArrayBuffer {
	const b = new Builder();
	b.write(u8, MessageType.Transport);
	b.write(u8, command);
	return b.toTransferable();
}

export function encodeTempo(bpm: number): ArrayBuffer {
	const b = new Builder();
	b.write(u8, MessageType.Tempo);
	b.write(f32, bpm);
	return b.toTransferable();
}

export function encodeTrigger(msg: TriggerMessage): ArrayBuffer {
	const b = new Builder();
	b.write(u8, MessageType.Trigger);
	b.write(u8, msg.track);
	b.write(u8, msg.patchIndex != null ? 0x01 : 0x00);
	b.write(u8, msg.trig.type);

	if (msg.patchIndex != null) {
		b.write(u8, msg.patchIndex);
	}

	if (msg.trig.type === TrigType.NoteOn) {
		b.write(u8, msg.trig.note);
		b.write(u8, msg.trig.velocity);
	}

	return b.toTransferable();
}

// --- FM4 voice encoders ------------------------------------------------------

export function encodeVoiceInit(sampleRate: number): ArrayBuffer {
	const b = new Builder();
	b.write(u8, VoiceMessageType.Init);
	b.write(f32, sampleRate);
	return b.toTransferable();
}

export function encodeVoicePatch(patch: fm4.Patch): ArrayBuffer {
	const b = new Builder();
	b.write(u8, VoiceMessageType.LoadPatch);

	for (const op of patch.operators) {
		b.write(f32, op.ratio);
		b.write(f32, op.detune);
		b.write(f32, op.level);
	}

	b.write(u8, patch.algorithm);
	b.write(f32, patch.index);
	b.write(f32, patch.feedback);

	// Envelope A
	b.write(f32, patch.envA.attack);
	b.write(f32, patch.envA.decay);
	b.write(f32, patch.envA.sustain);
	b.write(f32, patch.envA.release);

	// Envelope B
	b.write(f32, patch.envB.attack);
	b.write(f32, patch.envB.decay);
	b.write(f32, patch.envB.sustain);
	b.write(f32, patch.envB.release);

	// Amplitude envelope
	b.write(f32, patch.ampEnv.attack);
	b.write(f32, patch.ampEnv.decay);
	b.write(f32, patch.ampEnv.sustain);
	b.write(f32, patch.ampEnv.release);

	// Filter
	b.write(f32, patch.filterFreq);
	b.write(f32, patch.filterRes);

	// Sends
	for (const send of patch.sends) {
		b.write(f32, send);
	}

	// LFOs
	for (const lfo of patch.lfos) {
		b.write(f32, lfo.rate);
		b.write(u8, lfo.waveform);
		b.write(u8, lfo.routes.length);
		for (const route of lfo.routes) {
			b.write(u8, route.target);
			b.write(f32, route.depth);
		}
	}

	return b.toTransferable();
}

import type { Trig } from "@helm-audio/types";

export interface VoiceTrig {
	trig?: Trig;
	locks?: Array<{ param: number; value: number }>;
}

export function encodeVoiceTrig(msg: VoiceTrig): ArrayBuffer {
	const b = new Builder();
	b.write(u8, VoiceMessageType.Trig);

	let flags = 0;
	if (msg.trig) flags |= HAS_TRIG;
	if (msg.locks && msg.locks.length > 0) flags |= HAS_LOCKS;
	b.write(u8, flags);

	if (msg.trig) {
		b.write(u8, msg.trig.type);
		if (msg.trig.type === TrigType.NoteOn) {
			b.write(u8, msg.trig.note);
			b.write(u8, msg.trig.velocity);
		}
	}

	if (msg.locks && msg.locks.length > 0) {
		b.write(u8, msg.locks.length);
		for (const lock of msg.locks) {
			b.write(u8, lock.param);
			b.write(f32, lock.value);
		}
	}

	return b.toTransferable();
}

export function encodeVoiceNoteOn(note: number, velocity: number): ArrayBuffer {
	const b = new Builder();
	b.write(u8, VoiceMessageType.NoteOn);
	b.write(u8, note);
	b.write(u8, velocity);
	return b.toTransferable();
}

export function encodeVoiceNoteOff(): ArrayBuffer {
	const b = new Builder();
	b.write(u8, VoiceMessageType.NoteOff);
	return b.toTransferable();
}

export function encodeVoiceFadeOut(): ArrayBuffer {
	const b = new Builder();
	b.write(u8, VoiceMessageType.FadeOut);
	return b.toTransferable();
}

// --- Internal ----------------------------------------------------------------

function buildStepFlags(step: Step): number {
	let flags = 0;
	if (step.trig) flags |= HAS_TRIG;
	if (step.locks && step.locks.length > 0) flags |= HAS_LOCKS;
	if (step.patchIndex != null) flags |= HAS_PATCH_INDEX;
	if (step.oneshot) flags |= ONESHOT;
	return flags;
}
