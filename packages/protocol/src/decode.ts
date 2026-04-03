import { Binary, u8 } from "@bitmachina/binary";
import { MessageType } from "./types.ts";

/** Decoded state report from the engine. */
export interface StateReport {
	step: number;
	playing: boolean;
	patternSwapped: boolean;
}

/**
 * Decode a state report message from the engine.
 * Wire format: [type: u8] [step: u8] [playing: u8] [patternSwapped: u8]
 * Returns null if the buffer is not a state report.
 */
export function decodeStateReport(buf: ArrayBuffer): StateReport | null {
	if (buf.byteLength < 4) return null;
	const b = new Binary(buf);
	const type: MessageType = b.read(u8);
	if (type !== MessageType.StateReport) return null;
	return {
		step: b.read(u8),
		playing: b.read(u8) !== 0,
		patternSwapped: b.read(u8) !== 0,
	};
}
