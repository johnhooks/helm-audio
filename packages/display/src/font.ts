/** Font atlas configuration and loading. */

export interface FontConfig {
	/** Pixel width of each character cell in the grid layout. */
	cellWidth: number;
	/** Pixel height of each character cell in the grid layout. */
	cellHeight: number;
	/** Pixel width of the glyph within the atlas image. */
	glyphWidth: number;
	/** Pixel height of the glyph within the atlas image. */
	glyphHeight: number;
	/** Number of glyphs in the atlas (contiguous from ASCII 33). */
	glyphCount: number;
}

/** M8 small font: 5×7 glyphs, 8×10 cell spacing, 94 printable ASCII chars. */
export const FONT_SMALL: FontConfig = {
	cellWidth: 8,
	cellHeight: 10,
	glyphWidth: 5,
	glyphHeight: 7,
	glyphCount: 94,
};

/** M8 large font: 8×9 glyphs, 10×12 cell spacing, 94 printable ASCII chars. */
export const FONT_LARGE: FontConfig = {
	cellWidth: 10,
	cellHeight: 12,
	glyphWidth: 8,
	glyphHeight: 9,
	glyphCount: 94,
};

/**
 * Load a font atlas PNG into a WebGL texture.
 * The atlas is a horizontal strip of glyphs — 94 characters starting from '!' (ASCII 33).
 * Character index 0 means empty (no glyph drawn).
 * Character index N maps to ASCII code 32 + N (so index 1 = '!', index 33 = 'A').
 */
export function loadFontTexture(gl: WebGL2RenderingContext, url: string): Promise<WebGLTexture> {
	return new Promise((resolve, reject) => {
		const tex = gl.createTexture() as WebGLTexture | null;
		if (tex === null) {
			reject(new Error("Failed to create font texture"));
			return;
		}

		const img = new Image();
		img.onload = () => {
			gl.bindTexture(gl.TEXTURE_2D, tex);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			resolve(tex);
		};
		img.onerror = () => {
			reject(new Error(`Failed to load font: ${url}`));
		};
		img.src = url;
	});
}

/** Convert an ASCII character to a font atlas index (0 = empty, 1 = '!'). */
export function charToIndex(c: string): number {
	const code = c.charCodeAt(0);
	if (code < 33 || code > 126) return 0;
	return code - 32;
}

/** Convert a string to an array of font atlas indices. */
export function stringToIndices(s: string): number[] {
	const indices: number[] = [];
	for (let i = 0; i < s.length; i++) {
		indices.push(charToIndex(s[i]));
	}
	return indices;
}
