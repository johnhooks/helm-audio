/** Draw command types. The view layer produces these, the renderer consumes them. */

export interface Color {
	r: number; // 0-255
	g: number;
	b: number;
}

/**
 * Character grid display buffer.
 * Stores character indices and colors for every cell in the grid.
 * The renderer uploads these as instance data for the text shader.
 */
export class DisplayList {
	/** Number of columns in the grid. */
	readonly columns: number;
	/** Number of rows in the grid. */
	readonly rows: number;

	/** Character index per cell (0 = empty). Flat array: row * columns + col. */
	readonly chars: Uint8Array;
	/** RGB color per cell. 3 bytes per cell: [r, g, b, r, g, b, ...]. */
	readonly colors: Uint8Array;

	/** Background rectangles. Packed as [x, y, w, h, r, g, b] per rect. */
	readonly rects: Float32Array;
	/** Number of active rects. */
	rectCount = 0;

	private readonly _maxRects: number;

	constructor(columns: number, rows: number, maxRects = 256) {
		this.columns = columns;
		this.rows = rows;
		this._maxRects = maxRects;

		const cellCount = columns * rows;
		this.chars = new Uint8Array(cellCount);
		this.colors = new Uint8Array(cellCount * 3);
		this.rects = new Float32Array(maxRects * 7);
	}

	/** Clear all cells and rects. */
	clear(): void {
		this.chars.fill(0);
		this.colors.fill(0);
		this.rectCount = 0;
	}

	/** Set a single character at (col, row) with a color. */
	setChar(col: number, row: number, char: number, r: number, g: number, b: number): void {
		const i = row * this.columns + col;
		this.chars[i] = char;
		this.colors[i * 3] = r;
		this.colors[i * 3 + 1] = g;
		this.colors[i * 3 + 2] = b;
	}

	/**
	 * Write a string starting at (col, row).
	 * Characters outside the grid are clipped.
	 */
	drawText(col: number, row: number, text: string, r: number, g: number, b: number): void {
		for (let i = 0; i < text.length; i++) {
			const c = col + i;
			if (c >= this.columns) break;
			if (c < 0) continue;
			const code = text.charCodeAt(i);
			// Map ASCII to font atlas index: 0 = empty, 1 = '!', ...
			const charIndex = code >= 33 && code <= 126 ? code - 32 : 0;
			this.setChar(c, row, charIndex, r, g, b);
		}
	}

	/** Add a background rectangle in cell coordinates. */
	addRect(col: number, row: number, w: number, h: number, r: number, g: number, b: number): void {
		if (this.rectCount >= this._maxRects) return;
		const i = this.rectCount * 7;
		this.rects[i] = col;
		this.rects[i + 1] = row;
		this.rects[i + 2] = w;
		this.rects[i + 3] = h;
		this.rects[i + 4] = r / 255;
		this.rects[i + 5] = g / 255;
		this.rects[i + 6] = b / 255;
		this.rectCount++;
	}
}
