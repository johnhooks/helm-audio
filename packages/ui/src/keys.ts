/**
 * Two-row piano keyboard mapping.
 *
 * Maps keyboard scancodes (KeyboardEvent.code) to semitone offsets.
 * The offset is added to (octave + 1) * 12 to produce a MIDI note number.
 *
 * Lower octave (ZXCVBNM row + SDFGHJ sharps):
 *   S D   G H J          ← black keys
 *  Z X C V B N M         ← white keys
 *  C D E F G A B
 *
 * Upper octave (QWERTYUIOP row + 234567890 sharps):
 *   2 3   5 6 7   9 0    ← black keys
 *  Q W E R T Y U I O P   ← white keys
 *  C D E F G A B C D E
 */

const SCANCODE_TO_SEMITONE: Partial<Record<string, number>> = {
	// Lower octave
	KeyZ: 0, // C
	KeyS: 1, // C#
	KeyX: 2, // D
	KeyD: 3, // D#
	KeyC: 4, // E
	KeyV: 5, // F
	KeyG: 6, // F#
	KeyB: 7, // G
	KeyH: 8, // G#
	KeyN: 9, // A
	KeyJ: 10, // A#
	KeyM: 11, // B

	// Upper octave
	KeyQ: 12, // C
	Digit2: 13, // C#
	KeyW: 14, // D
	Digit3: 15, // D#
	KeyE: 16, // E
	KeyR: 17, // F
	Digit5: 18, // F#
	KeyT: 19, // G
	Digit6: 20, // G#
	KeyY: 21, // A
	Digit7: 22, // A#
	KeyU: 23, // B
	KeyI: 24, // C
	Digit9: 25, // C#
	KeyO: 26, // D
	Digit0: 27, // D#
	KeyP: 28, // E
};

/**
 * Convert a keyboard scancode to a MIDI note number.
 * Returns null if the scancode is not a note key.
 */
export function scancodeToNote(code: string, octave: number): number | null {
	const semitone = SCANCODE_TO_SEMITONE[code];
	if (semitone === undefined) return null;
	const midi = (octave + 1) * 12 + semitone;
	if (midi > 127) return null;
	return midi;
}
