import { defineConfig } from "vite";

export default defineConfig({
	server: {
		headers: {
			// Required for SharedArrayBuffer / AudioWorklet
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Embedder-Policy": "require-corp",
		},
	},
});
