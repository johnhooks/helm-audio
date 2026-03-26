import { describe, expect, it } from "vitest";
import { Binary, u8, i8, f32 } from "@bitmachina/binary";
import {
	encodePatchBank,
	encodePattern,
	encodeBusConfig,
	encodeTransport,
	encodeTempo,
	encodeTrigger,
} from "./encode.ts";
import {
	EffectType,
	LfoWaveform,
	MessageType,
	ParamId,
	TransportCommand,
	TrigType,
} from "./types.ts";
import type { BusSetup, Patch, PatternData, TriggerMessage } from "./types.ts";

// --- Helpers -----------------------------------------------------------------

function reader(buffer: ArrayBuffer): Binary {
	return new Binary(buffer);
}

function makeDefaultOperator() {
	return {
		ratio: 1.0,
		detune: 0.0,
		level: 1.0,
		feedback: 0.0,
		attack: 0.01,
		decay: 0.1,
		sustain: 1.0,
		release: 0.3,
	};
}

function makeDefaultPatch(): Patch {
	return {
		operators: [makeDefaultOperator(), makeDefaultOperator()],
		index: 1.0,
		filterFreq: 8000.0,
		filterRes: 0.0,
		sends: [0, 0, 0, 0],
		lfos: [
			{ rate: 1.0, waveform: LfoWaveform.Sine, routes: [] },
			{ rate: 1.0, waveform: LfoWaveform.Sine, routes: [] },
		],
		attack: 0.01,
		decay: 0.1,
		sustain: 0.7,
		release: 0.3,
	};
}

// --- Tests -------------------------------------------------------------------

describe("encodePatchBank", () => {
	it("encodes message tag and patch count", () => {
		const patch = makeDefaultPatch();
		const buf = encodePatchBank([patch]);
		const r = reader(buf);

		expect(r.read(u8)).toBe(MessageType.PatchBank);
		expect(r.read(u8)).toBe(1);
	});

	it("encodes operator fields in order", () => {
		const patch = makeDefaultPatch();
		patch.operators[0].ratio = 2.0;
		patch.operators[0].detune = 1.5;
		patch.operators[0].level = 0.8;
		patch.operators[0].feedback = 0.3;

		const buf = encodePatchBank([patch]);
		const r = reader(buf);
		r.read(u8); // tag
		r.read(u8); // count

		// Carrier operator
		expect(r.read(f32)).toBeCloseTo(2.0);
		expect(r.read(f32)).toBeCloseTo(1.5);
		expect(r.read(f32)).toBeCloseTo(0.8);
		expect(r.read(f32)).toBeCloseTo(0.3);
	});

	it("encodes voice params after both operators", () => {
		const patch = makeDefaultPatch();
		patch.index = 3.5;
		patch.filterFreq = 2000.0;
		patch.filterRes = 0.6;
		patch.sends = [0.4, 0.5, 0.0, 0.1];

		const buf = encodePatchBank([patch]);
		const r = reader(buf);
		r.read(u8); // tag
		r.read(u8); // count

		// Skip 2 operators (8 f32 each = 16 f32 = 64 bytes)
		for (let i = 0; i < 16; i++) r.read(f32);

		expect(r.read(f32)).toBeCloseTo(3.5); // index
		expect(r.read(f32)).toBeCloseTo(2000.0); // filterFreq
		expect(r.read(f32)).toBeCloseTo(0.6); // filterRes
		expect(r.read(f32)).toBeCloseTo(0.4); // send0
		expect(r.read(f32)).toBeCloseTo(0.5); // send1
		expect(r.read(f32)).toBeCloseTo(0.0); // send2
		expect(r.read(f32)).toBeCloseTo(0.1); // send3
	});

	it("encodes amplitude envelope after sends", () => {
		const patch = makeDefaultPatch();
		patch.attack = 0.05;
		patch.decay = 0.2;
		patch.sustain = 0.6;
		patch.release = 1.0;

		const buf = encodePatchBank([patch]);
		const r = reader(buf);
		r.read(u8); // tag
		r.read(u8); // count
		// Skip operators (16 f32) + voice params (7 f32) = 23 f32
		for (let i = 0; i < 23; i++) r.read(f32);

		expect(r.read(f32)).toBeCloseTo(0.05);
		expect(r.read(f32)).toBeCloseTo(0.2);
		expect(r.read(f32)).toBeCloseTo(0.6);
		expect(r.read(f32)).toBeCloseTo(1.0);
	});

	it("encodes LFOs with routes", () => {
		const patch = makeDefaultPatch();
		patch.lfos[0] = {
			rate: 0.5,
			waveform: LfoWaveform.Triangle,
			routes: [
				{ target: ParamId.FilterFreq, depth: 400.0 },
				{ target: ParamId.Index, depth: 0.3 },
			],
		};
		patch.lfos[1] = {
			rate: 2.0,
			waveform: LfoWaveform.Saw,
			routes: [],
		};

		const buf = encodePatchBank([patch]);
		const r = reader(buf);
		r.read(u8); // tag
		r.read(u8); // count
		// Skip operators (16 f32) + voice params (7 f32) + amp env (4 f32) = 27 f32
		for (let i = 0; i < 27; i++) r.read(f32);

		// LFO 0
		expect(r.read(f32)).toBeCloseTo(0.5); // rate
		expect(r.read(u8)).toBe(LfoWaveform.Triangle); // waveform
		expect(r.read(u8)).toBe(2); // routeCount
		expect(r.read(u8)).toBe(ParamId.FilterFreq);
		expect(r.read(f32)).toBeCloseTo(400.0);
		expect(r.read(u8)).toBe(ParamId.Index);
		expect(r.read(f32)).toBeCloseTo(0.3);

		// LFO 1
		expect(r.read(f32)).toBeCloseTo(2.0);
		expect(r.read(u8)).toBe(LfoWaveform.Saw);
		expect(r.read(u8)).toBe(0); // no routes
	});

	it("encodes multiple patches sequentially", () => {
		const p1 = makeDefaultPatch();
		const p2 = makeDefaultPatch();
		p2.index = 5.0;

		const buf = encodePatchBank([p1, p2]);
		const r = reader(buf);
		expect(r.read(u8)).toBe(MessageType.PatchBank);
		expect(r.read(u8)).toBe(2);

		// We can at least verify the buffer is big enough for 2 patches
		// Each patch with no LFO routes: 27 f32 (108) + 2 LFOs (f32 + u8 + u8 each = 6 bytes) = 120 bytes
		// 2 patches = 240 bytes + 2 byte header = 242 bytes
		expect(buf.byteLength).toBe(242);
	});
});

describe("encodePattern", () => {
	it("encodes header", () => {
		const pattern: PatternData = {
			length: 16,
			tracks: [{ stepCount: 16, events: [] }],
		};
		const buf = encodePattern(pattern);
		const r = reader(buf);

		expect(r.read(u8)).toBe(MessageType.Pattern);
		expect(r.read(u8)).toBe(1); // trackCount
		expect(r.read(u8)).toBe(16); // patternLength
	});

	it("encodes empty track", () => {
		const pattern: PatternData = {
			length: 16,
			tracks: [{ stepCount: 16, events: [] }],
		};
		const buf = encodePattern(pattern);
		const r = reader(buf);
		r.read(u8); // tag
		r.read(u8); // trackCount
		r.read(u8); // patternLength

		expect(r.read(u8)).toBe(16); // stepCount
		expect(r.read(u8)).toBe(0); // eventCount
	});

	it("encodes NoteOn step with patch load", () => {
		const pattern: PatternData = {
			length: 16,
			tracks: [
				{
					stepCount: 16,
					events: [
						{
							stepIndex: 0,
							patchIndex: 3,
							trig: { type: TrigType.NoteOn, note: 60, velocity: 100 },
						},
					],
				},
			],
		};
		const buf = encodePattern(pattern);
		const r = reader(buf);
		r.read(u8); // tag
		r.read(u8); // trackCount
		r.read(u8); // patternLength
		r.read(u8); // stepCount
		r.read(u8); // eventCount

		expect(r.read(u8)).toBe(0); // stepIndex
		const flags = r.read(u8);
		expect(flags & 0x01).toBe(0x01); // HAS_TRIG
		expect(flags & 0x04).toBe(0x04); // HAS_PATCH_INDEX
		expect(r.read(i8)).toBe(0); // microTiming

		expect(r.read(u8)).toBe(3); // patchIndex
		expect(r.read(u8)).toBe(TrigType.NoteOn);
		expect(r.read(u8)).toBe(60); // note
		expect(r.read(u8)).toBe(100); // velocity
	});

	it("encodes param locks", () => {
		const pattern: PatternData = {
			length: 16,
			tracks: [
				{
					stepCount: 16,
					events: [
						{
							stepIndex: 4,
							locks: [
								{ param: ParamId.FilterFreq, value: 2000.0 },
								{ param: ParamId.Index, value: 3.0 },
							],
						},
					],
				},
			],
		};
		const buf = encodePattern(pattern);
		const r = reader(buf);
		r.read(u8); // tag
		r.read(u8); // trackCount
		r.read(u8); // patternLength
		r.read(u8); // stepCount
		r.read(u8); // eventCount

		expect(r.read(u8)).toBe(4); // stepIndex
		const flags = r.read(u8);
		expect(flags & 0x02).toBe(0x02); // HAS_LOCKS
		expect(flags & 0x01).toBe(0); // no trig
		r.read(i8); // microTiming

		expect(r.read(u8)).toBe(2); // lockCount
		expect(r.read(u8)).toBe(ParamId.FilterFreq);
		expect(r.read(f32)).toBeCloseTo(2000.0);
		expect(r.read(u8)).toBe(ParamId.Index);
		expect(r.read(f32)).toBeCloseTo(3.0);
	});

	it("encodes micro-timing and oneshot", () => {
		const pattern: PatternData = {
			length: 16,
			tracks: [
				{
					stepCount: 16,
					events: [
						{
							stepIndex: 2,
							microTiming: -3,
							oneshot: true,
							trig: { type: TrigType.FadeOut },
						},
					],
				},
			],
		};
		const buf = encodePattern(pattern);
		const r = reader(buf);
		r.read(u8); // tag
		r.read(u8); // trackCount
		r.read(u8); // patternLength
		r.read(u8); // stepCount
		r.read(u8); // eventCount

		expect(r.read(u8)).toBe(2); // stepIndex
		const flags = r.read(u8);
		expect(flags & 0x08).toBe(0x08); // ONESHOT
		expect(flags & 0x01).toBe(0x01); // HAS_TRIG
		expect(r.read(i8)).toBe(-3); // microTiming
		expect(r.read(u8)).toBe(TrigType.FadeOut);
	});
});

describe("encodeBusConfig", () => {
	it("encodes all 4 buses", () => {
		const buses: BusSetup = [
			{
				slots: [{ type: EffectType.Delay, time: 0.5, feedback: 0.45, mix: 0.35 }],
			},
			{
				slots: [{ type: EffectType.Reverb, feedback: 0.85, lpFreq: 10000.0 }],
			},
			{ slots: [] },
			{ slots: [] },
		];

		const buf = encodeBusConfig(buses);
		const r = reader(buf);

		expect(r.read(u8)).toBe(MessageType.BusConfig);

		// Bus 0: delay
		expect(r.read(u8)).toBe(1); // slotCount
		expect(r.read(u8)).toBe(EffectType.Delay);
		expect(r.read(f32)).toBeCloseTo(0.5);
		expect(r.read(f32)).toBeCloseTo(0.45);
		expect(r.read(f32)).toBeCloseTo(0.35);

		// Bus 1: reverb
		expect(r.read(u8)).toBe(1);
		expect(r.read(u8)).toBe(EffectType.Reverb);
		expect(r.read(f32)).toBeCloseTo(0.85);
		expect(r.read(f32)).toBeCloseTo(10000.0);

		// Bus 2 & 3: empty
		expect(r.read(u8)).toBe(0);
		expect(r.read(u8)).toBe(0);
	});

	it("encodes overdrive and chorus", () => {
		const buses: BusSetup = [
			{ slots: [{ type: EffectType.Overdrive, drive: 0.7 }] },
			{
				slots: [
					{
						type: EffectType.Chorus,
						rate: 0.8,
						depth: 0.5,
						feedback: 0.2,
						delay: 0.6,
					},
				],
			},
			{ slots: [] },
			{ slots: [] },
		];

		const buf = encodeBusConfig(buses);
		const r = reader(buf);
		r.read(u8); // tag

		// Bus 0: overdrive
		expect(r.read(u8)).toBe(1);
		expect(r.read(u8)).toBe(EffectType.Overdrive);
		expect(r.read(f32)).toBeCloseTo(0.7);

		// Bus 1: chorus
		expect(r.read(u8)).toBe(1);
		expect(r.read(u8)).toBe(EffectType.Chorus);
		expect(r.read(f32)).toBeCloseTo(0.8);
		expect(r.read(f32)).toBeCloseTo(0.5);
		expect(r.read(f32)).toBeCloseTo(0.2);
		expect(r.read(f32)).toBeCloseTo(0.6);
	});
});

describe("encodeTransport", () => {
	it("encodes play", () => {
		const buf = encodeTransport(TransportCommand.Play);
		const r = reader(buf);
		expect(r.read(u8)).toBe(MessageType.Transport);
		expect(r.read(u8)).toBe(TransportCommand.Play);
		expect(buf.byteLength).toBe(2);
	});

	it("encodes stop", () => {
		const buf = encodeTransport(TransportCommand.Stop);
		const r = reader(buf);
		expect(r.read(u8)).toBe(MessageType.Transport);
		expect(r.read(u8)).toBe(TransportCommand.Stop);
	});
});

describe("encodeTempo", () => {
	it("encodes BPM as f32", () => {
		const buf = encodeTempo(140.0);
		const r = reader(buf);
		expect(r.read(u8)).toBe(MessageType.Tempo);
		expect(r.read(f32)).toBeCloseTo(140.0);
		expect(buf.byteLength).toBe(5);
	});
});

describe("encodeTrigger", () => {
	it("encodes NoteOn without patch", () => {
		const msg: TriggerMessage = {
			track: 3,
			trig: { type: TrigType.NoteOn, note: 64, velocity: 110 },
		};
		const buf = encodeTrigger(msg);
		const r = reader(buf);

		expect(r.read(u8)).toBe(MessageType.Trigger);
		expect(r.read(u8)).toBe(3); // track
		expect(r.read(u8)).toBe(0x00); // flags (no patch)
		expect(r.read(u8)).toBe(TrigType.NoteOn);
		expect(r.read(u8)).toBe(64); // note
		expect(r.read(u8)).toBe(110); // velocity
	});

	it("encodes NoteOn with patch index", () => {
		const msg: TriggerMessage = {
			track: 0,
			trig: { type: TrigType.NoteOn, note: 48, velocity: 127 },
			patchIndex: 5,
		};
		const buf = encodeTrigger(msg);
		const r = reader(buf);

		expect(r.read(u8)).toBe(MessageType.Trigger);
		expect(r.read(u8)).toBe(0); // track
		expect(r.read(u8)).toBe(0x01); // HAS_PATCH_INDEX
		expect(r.read(u8)).toBe(TrigType.NoteOn);
		expect(r.read(u8)).toBe(5); // patchIndex
		expect(r.read(u8)).toBe(48);
		expect(r.read(u8)).toBe(127);
	});

	it("encodes NoteOff", () => {
		const msg: TriggerMessage = {
			track: 7,
			trig: { type: TrigType.NoteOff },
		};
		const buf = encodeTrigger(msg);
		const r = reader(buf);

		expect(r.read(u8)).toBe(MessageType.Trigger);
		expect(r.read(u8)).toBe(7);
		expect(r.read(u8)).toBe(0x00);
		expect(r.read(u8)).toBe(TrigType.NoteOff);
		expect(buf.byteLength).toBe(4);
	});

	it("encodes FadeOut", () => {
		const msg: TriggerMessage = {
			track: 2,
			trig: { type: TrigType.FadeOut },
		};
		const buf = encodeTrigger(msg);
		const r = reader(buf);

		expect(r.read(u8)).toBe(MessageType.Trigger);
		expect(r.read(u8)).toBe(2);
		expect(r.read(u8)).toBe(0x00);
		expect(r.read(u8)).toBe(TrigType.FadeOut);
	});
});
