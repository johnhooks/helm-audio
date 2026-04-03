/**
 * WebGL2 character grid renderer.
 *
 * Renders a fixed-size character grid to an offscreen framebuffer at native
 * resolution, then blits to the screen canvas with integer scaling and
 * nearest-neighbor filtering. Inspired by the M8WebDisplay rendering
 * architecture (MIT, James Deery).
 *
 * Three render passes per frame:
 *   1. Rectangles — instanced quads for row backgrounds, cursor, selection
 *   2. Text — instanced quads sampling from the bitmap font atlas
 *   3. Blit — fullscreen quad copying the offscreen texture to the canvas
 */

import type { FontConfig } from "./font.ts";
import { loadFontTexture } from "./font.ts";
import { buildProgram, shaderSources } from "./shaders.ts";
import type { DisplayList } from "./display-list.ts";

function glCreate<T>(result: T | null, name: string): T {
	if (result === null) throw new Error(`Failed to create WebGL ${name}`);
	return result;
}

export interface RendererOptions {
	/** The canvas element to render into. */
	canvas: HTMLCanvasElement;
	/** Grid dimensions in characters. */
	columns: number;
	rows: number;
	/** Font configuration. */
	font: FontConfig;
	/** URL of the font atlas PNG. */
	fontUrl: string;
	/** Background color (0-255 per channel). */
	background?: [number, number, number];
}

export class Renderer {
	private readonly gl: WebGL2RenderingContext;
	private readonly canvas: HTMLCanvasElement;
	private readonly columns: number;
	private readonly rows: number;
	private readonly font: FontConfig;
	private readonly nativeWidth: number;
	private readonly nativeHeight: number;
	private bg: [number, number, number];

	// Rect pass
	private rectProgram!: WebGLProgram;
	private rectVao!: WebGLVertexArrayObject;
	private rectBuffer!: WebGLBuffer;
	private readonly maxRects = 256;

	// Text pass
	private textProgram!: WebGLProgram;
	private textVao!: WebGLVertexArrayObject;
	private textCharBuffer!: WebGLBuffer;
	private textColorBuffer!: WebGLBuffer;
	private fontTexture: WebGLTexture | null = null;

	// Offscreen framebuffer
	private offscreenTex!: WebGLTexture;
	private offscreenFb!: WebGLFramebuffer;

	// Blit pass
	private blitProgram!: WebGLProgram;

	// Cached viewport for integer-scaled blit
	private blitX = 0;
	private blitY = 0;
	private blitW = 0;
	private blitH = 0;

	private ready = false;

	/** Called once after the font texture finishes loading. */
	onReady?: () => void;

	constructor(options: RendererOptions) {
		this.canvas = options.canvas;
		this.columns = options.columns;
		this.rows = options.rows;
		this.font = options.font;
		this.bg = options.background ?? [0, 0, 0];

		this.nativeWidth = this.columns * this.font.cellWidth;
		this.nativeHeight = this.rows * this.font.cellHeight;

		const gl = this.canvas.getContext("webgl2", {
			alpha: false,
			antialias: false,
		});
		if (!gl) throw new Error("WebGL2 not supported");
		this.gl = gl;

		this.setupRects();
		this.setupText();
		this.setupOffscreen();
		this.setupBlit();

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		void this.loadFont(options.fontUrl);
	}

	private async loadFont(url: string): Promise<void> {
		this.fontTexture = await loadFontTexture(this.gl, url);
		this.ready = true;
		this.onReady?.();
	}

	// --- Rect pass setup ---

	private setupRects(): void {
		const gl = this.gl;
		this.rectProgram = buildProgram(gl, shaderSources.rect);

		this.rectVao = glCreate(gl.createVertexArray(), "VAO");
		gl.bindVertexArray(this.rectVao);

		this.rectBuffer = glCreate(gl.createBuffer(), "buffer");
		gl.bindBuffer(gl.ARRAY_BUFFER, this.rectBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, this.maxRects * 28, gl.STREAM_DRAW); // 7 floats × 4 bytes

		// shape: vec4 (x, y, w, h) at location 0
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 28, 0);
		gl.vertexAttribDivisor(0, 1);

		// colour: vec3 (r, g, b) at location 1
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 16);
		gl.vertexAttribDivisor(1, 1);

		gl.bindVertexArray(null);
	}

	// --- Text pass setup ---

	private setupText(): void {
		const gl = this.gl;
		this.textProgram = buildProgram(gl, shaderSources.text);

		this.textVao = glCreate(gl.createVertexArray(), "VAO");
		gl.bindVertexArray(this.textVao);

		// Per-instance color: vec3 (r, g, b) as unsigned bytes, normalized
		this.textColorBuffer = glCreate(gl.createBuffer(), "buffer");
		gl.bindBuffer(gl.ARRAY_BUFFER, this.textColorBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, this.columns * this.rows * 3, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.UNSIGNED_BYTE, true, 0, 0);
		gl.vertexAttribDivisor(0, 1);

		// Per-instance character index: float (uint8 → float)
		this.textCharBuffer = glCreate(gl.createBuffer(), "buffer");
		gl.bindBuffer(gl.ARRAY_BUFFER, this.textCharBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, this.columns * this.rows, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 1, gl.UNSIGNED_BYTE, false, 0, 0);
		gl.vertexAttribDivisor(1, 1);

		gl.bindVertexArray(null);
	}

	// --- Offscreen framebuffer ---

	private setupOffscreen(): void {
		const gl = this.gl;

		this.offscreenTex = glCreate(gl.createTexture(), "texture");
		gl.bindTexture(gl.TEXTURE_2D, this.offscreenTex);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			this.nativeWidth,
			this.nativeHeight,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			null,
		);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

		this.offscreenFb = glCreate(gl.createFramebuffer(), "framebuffer");
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.offscreenFb);
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			this.offscreenTex,
			0,
		);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	// --- Blit pass ---

	private setupBlit(): void {
		const gl = this.gl;
		this.blitProgram = buildProgram(gl, shaderSources.blit);
		gl.useProgram(this.blitProgram);
		gl.uniform1i(gl.getUniformLocation(this.blitProgram, "src"), 0);
	}

	// --- Viewport scaling ---

	/**
	 * Update the canvas backing store and compute the integer-scaled
	 * viewport for the blit pass. Call on window resize.
	 *
	 * Computes the largest integer scale factor where the native
	 * resolution fits within the canvas. The result is centered with
	 * the background color filling the borders. Every source pixel
	 * maps to an exact NxN block of screen pixels — no interpolation,
	 * no blur.
	 */
	resize(): void {
		const dpr = window.devicePixelRatio || 1;
		const cssWidth = this.canvas.clientWidth;
		const cssHeight = this.canvas.clientHeight;
		const pixelWidth = Math.floor(cssWidth * dpr);
		const pixelHeight = Math.floor(cssHeight * dpr);
		this.canvas.width = pixelWidth;
		this.canvas.height = pixelHeight;

		// Largest integer scale that fits both dimensions
		const scaleX = Math.floor(pixelWidth / this.nativeWidth);
		const scaleY = Math.floor(pixelHeight / this.nativeHeight);
		const scale = Math.max(1, Math.min(scaleX, scaleY));

		this.blitW = this.nativeWidth * scale;
		this.blitH = this.nativeHeight * scale;
		this.blitX = Math.floor((pixelWidth - this.blitW) / 2);
		this.blitY = Math.floor((pixelHeight - this.blitH) / 2);
	}

	// --- Draw ---

	/**
	 * Render a display list to the canvas.
	 * This is the only method the view layer calls.
	 */
	draw(list: DisplayList): void {
		if (!this.ready) return;

		const gl = this.gl;
		const { cellWidth, cellHeight } = this.font;

		// --- Pass 1: Rects → offscreen ---
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.offscreenFb);
		gl.viewport(0, 0, this.nativeWidth, this.nativeHeight);

		gl.clearColor(this.bg[0] / 255, this.bg[1] / 255, this.bg[2] / 255, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);

		if (list.rectCount > 0) {
			gl.useProgram(this.rectProgram);
			gl.uniform2f(
				gl.getUniformLocation(this.rectProgram, "resolution"),
				this.nativeWidth,
				this.nativeHeight,
			);

			// Convert cell-coordinate rects to pixel coordinates
			const pixelRects = new Float32Array(list.rectCount * 7);
			for (let i = 0; i < list.rectCount; i++) {
				const si = i * 7;
				pixelRects[si] = list.rects[si] * cellWidth;
				pixelRects[si + 1] = list.rects[si + 1] * cellHeight;
				pixelRects[si + 2] = list.rects[si + 2] * cellWidth;
				pixelRects[si + 3] = list.rects[si + 3] * cellHeight;
				pixelRects[si + 4] = list.rects[si + 4];
				pixelRects[si + 5] = list.rects[si + 5];
				pixelRects[si + 6] = list.rects[si + 6];
			}

			gl.bindVertexArray(this.rectVao);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.rectBuffer);
			gl.bufferSubData(gl.ARRAY_BUFFER, 0, pixelRects);
			gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, list.rectCount);
		}

		// --- Pass 2: Text → offscreen ---
		gl.useProgram(this.textProgram);
		gl.uniform2f(
			gl.getUniformLocation(this.textProgram, "resolution"),
			this.nativeWidth,
			this.nativeHeight,
		);
		gl.uniform2f(gl.getUniformLocation(this.textProgram, "gridSize"), this.columns, this.rows);
		gl.uniform2f(gl.getUniformLocation(this.textProgram, "cellSize"), cellWidth, cellHeight);
		gl.uniform2f(
			gl.getUniformLocation(this.textProgram, "glyphSize"),
			this.font.glyphWidth,
			this.font.glyphHeight,
		);

		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.fontTexture);
		gl.uniform1i(gl.getUniformLocation(this.textProgram, "font"), 1);

		gl.bindVertexArray(this.textVao);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.textColorBuffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, list.colors);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.textCharBuffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, list.chars);

		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.columns * this.rows);

		// --- Pass 3: Blit offscreen → canvas (integer-scaled, centered) ---
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);

		// Clear the full canvas to background (fills letterbox/pillarbox borders)
		gl.viewport(0, 0, this.canvas.width, this.canvas.height);
		gl.clearColor(this.bg[0] / 255, this.bg[1] / 255, this.bg[2] / 255, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);

		// Set viewport to the integer-scaled centered rect
		gl.viewport(this.blitX, this.blitY, this.blitW, this.blitH);

		gl.useProgram(this.blitProgram);
		gl.uniform2f(
			gl.getUniformLocation(this.blitProgram, "resolution"),
			this.nativeWidth,
			this.nativeHeight,
		);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.offscreenTex);

		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}

	/** Update the background color. */
	setBackground(r: number, g: number, b: number): void {
		this.bg = [r, g, b];
	}
}
