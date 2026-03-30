import nodeResolve from "@rollup/plugin-node-resolve";
import esbuild from "rollup-plugin-esbuild";

export default {
	input: "src/processor.ts",
	output: {
		file: "dist/processor.js",
		format: "es",
	},
	plugins: [
		nodeResolve(),
		esbuild({ target: "es2024" }),
		{
			// Replace import.meta.url with a placeholder.
			// With SINGLE_FILE=1 the WASM is base64-inlined, so
			// _scriptName is never used to locate external files.
			name: "strip-import-meta",
			resolveImportMeta() {
				return "undefined";
			},
		},
	],
};
