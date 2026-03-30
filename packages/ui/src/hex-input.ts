/**
 * Hex digit input for tracker fields.
 *
 * Converts keyboard scancodes to hex digit values (0-15).
 * Uses scancodes so it works regardless of keyboard layout.
 */

const SCANCODE_TO_HEX: Partial<Record<string, number>> = {
	Digit0: 0, Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4,
	Digit5: 5, Digit6: 6, Digit7: 7, Digit8: 8, Digit9: 9,
	KeyA: 10, KeyB: 11, KeyC: 12, KeyD: 13, KeyE: 14, KeyF: 15,
};

/**
 * Convert a keyboard scancode to a hex digit (0-15).
 * Returns null if the scancode is not a hex digit key.
 */
export function scancodeToHex(code: string): number | null {
	return SCANCODE_TO_HEX[code] ?? null;
}

/**
 * Manages two-nibble hex entry for a byte field.
 *
 * Tracks whether we're entering the high or low nibble.
 * Call `feed()` with each hex digit. It returns the current
 * value and whether the byte is complete (both nibbles entered).
 */
export class HexEntry {
	private highNibble: number | null = null;

	/**
	 * Feed a hex digit (0-15) into the entry.
	 *
	 * Returns `{ value, complete }`:
	 *   - First digit: value = digit << 4, complete = false
	 *   - Second digit: value = (high << 4) | digit, complete = true
	 */
	feed(digit: number): { value: number; complete: boolean } {
		if (this.highNibble === null) {
			this.highNibble = digit;
			return { value: digit << 4, complete: false };
		}
		const value = (this.highNibble << 4) | digit;
		this.highNibble = null;
		return { value, complete: true };
	}

	/** Reset to accept a new byte. */
	reset(): void {
		this.highNibble = null;
	}

	/** Whether we're waiting for the second nibble. */
	get pending(): boolean {
		return this.highNibble !== null;
	}
}
