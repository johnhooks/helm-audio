import { describe, it, expect } from "vitest";
import { scancodeToHex, HexEntry } from "./hex-input.ts";

describe("scancodeToHex", () => {
	it("maps digit scancodes to 0-9", () => {
		expect(scancodeToHex("Digit0")).toBe(0);
		expect(scancodeToHex("Digit5")).toBe(5);
		expect(scancodeToHex("Digit9")).toBe(9);
	});

	it("maps letter scancodes to 10-15", () => {
		expect(scancodeToHex("KeyA")).toBe(10);
		expect(scancodeToHex("KeyF")).toBe(15);
	});

	it("returns null for non-hex keys", () => {
		expect(scancodeToHex("KeyG")).toBeNull();
		expect(scancodeToHex("ArrowUp")).toBeNull();
		expect(scancodeToHex("Space")).toBeNull();
	});
});

describe("HexEntry", () => {
	it("first digit returns high nibble, not complete", () => {
		const entry = new HexEntry();
		const result = entry.feed(6);
		expect(result).toEqual({ value: 0x60, complete: false });
	});

	it("second digit returns full byte, complete", () => {
		const entry = new HexEntry();
		entry.feed(6);
		const result = entry.feed(4);
		expect(result).toEqual({ value: 0x64, complete: true });
	});

	it("resets after completing a byte", () => {
		const entry = new HexEntry();
		entry.feed(6);
		entry.feed(4);
		// Should start fresh
		const result = entry.feed(7);
		expect(result).toEqual({ value: 0x70, complete: false });
	});

	it("manual reset clears pending state", () => {
		const entry = new HexEntry();
		entry.feed(6);
		expect(entry.pending).toBe(true);
		entry.reset();
		expect(entry.pending).toBe(false);
		const result = entry.feed(3);
		expect(result).toEqual({ value: 0x30, complete: false });
	});

	it("handles 0x00", () => {
		const entry = new HexEntry();
		entry.feed(0);
		const result = entry.feed(0);
		expect(result).toEqual({ value: 0x00, complete: true });
	});

	it("handles 0xFF", () => {
		const entry = new HexEntry();
		entry.feed(15);
		const result = entry.feed(15);
		expect(result).toEqual({ value: 0xFF, complete: true });
	});
});
