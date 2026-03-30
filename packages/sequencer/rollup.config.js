import nodeResolve from "@rollup/plugin-node-resolve";
import esbuild from "rollup-plugin-esbuild";

export default {
	input: "src/worker.ts",
	output: {
		file: "dist/worker.js",
		format: "es",
	},
	plugins: [
		nodeResolve(),
		esbuild({ target: "es2024" }),
	],
};
