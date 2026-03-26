import tseslint from "typescript-eslint";

export default tseslint.config(
	{ ignores: ["**/dist", "**/wasm", "**/build", "DaisySP", "tmp", "**/*.d.mts", "**/public"] },
	tseslint.configs.strictTypeChecked,
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						"eslint.config.js",
						"vitest.config.ts",
						"packages/*/tsup.config.ts",
						"packages/*/vite.config.ts",
						"packages/*/rollup.config.js",
					],
					defaultProject: "tsconfig.base.json",
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
		},
	},
	{
		files: ["eslint.config.js", "vitest.config.ts", "packages/*/tsup.config.ts"],
		extends: [tseslint.configs.disableTypeChecked],
	},
);
