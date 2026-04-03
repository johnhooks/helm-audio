// Inline shader sources. Vite imports these as strings via ?raw.
import rectVert from "./shaders/rect.vert?raw";
import rectFrag from "./shaders/rect.frag?raw";
import textVert from "./shaders/text.vert?raw";
import textFrag from "./shaders/text.frag?raw";
import blitVert from "./shaders/blit.vert?raw";
import blitFrag from "./shaders/blit.frag?raw";

export const shaderSources = {
	rect: { vert: rectVert, frag: rectFrag },
	text: { vert: textVert, frag: textFrag },
	blit: { vert: blitVert, frag: blitFrag },
} as const;

export function compileShader(
	gl: WebGL2RenderingContext,
	type: number,
	source: string,
): WebGLShader {
	const shader = gl.createShader(type);
	if (shader === null) throw new Error("Failed to create shader");
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw new Error(`Shader compile error: ${log ?? "unknown"}`);
	}
	return shader;
}

export function buildProgram(
	gl: WebGL2RenderingContext,
	sources: { vert: string; frag: string },
): WebGLProgram {
	const program = gl.createProgram() as WebGLProgram | null;
	if (program === null) throw new Error("Failed to create program");

	const vert = compileShader(gl, gl.VERTEX_SHADER, sources.vert);
	const frag = compileShader(gl, gl.FRAGMENT_SHADER, sources.frag);
	gl.attachShader(program, vert);
	gl.attachShader(program, frag);
	gl.linkProgram(program);

	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const log = gl.getProgramInfoLog(program);
		gl.deleteProgram(program);
		throw new Error(`Program link error: ${log ?? "unknown"}`);
	}

	// Shaders can be detached after linking
	gl.detachShader(program, vert);
	gl.detachShader(program, frag);
	gl.deleteShader(vert);
	gl.deleteShader(frag);

	return program;
}
