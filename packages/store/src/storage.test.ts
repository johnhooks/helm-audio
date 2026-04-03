import { describe, it, expect } from "vitest";
import { createInitialState } from "./defaults.ts";
import { extractProject, applyProject } from "./storage.ts";
import { Page, StepField } from "./types.ts";

describe("extractProject", () => {
	it("extracts only persistent fields", () => {
		const state = createInitialState(8);
		state.tempo = 140;
		state.octave = 5;
		const project = extractProject(state);

		expect(project.tempo).toBe(140);
		expect(project.octave).toBe(5);
		expect(project.patterns).toBe(state.patterns);
		expect(project.patches).toBe(state.patches);
		expect(project.patchNames).toBe(state.patchNames);
		expect(project.buses).toBe(state.buses);
		expect(project.chain).toBe(state.chain);
		expect(project.chainLoop).toBe(state.chainLoop);
		expect(project.stepSize).toBe(state.stepSize);
	});

	it("does not include ephemeral fields", () => {
		const state = createInitialState(8);
		const project = extractProject(state);
		const keys = Object.keys(project);

		expect(keys).not.toContain("playing");
		expect(keys).not.toContain("playbackStep");
		expect(keys).not.toContain("editMode");
		expect(keys).not.toContain("undoStack");
		expect(keys).not.toContain("redoStack");
		expect(keys).not.toContain("selection");
		expect(keys).not.toContain("clipboard");
	});
});

describe("applyProject", () => {
	it("restores project data into fresh state", () => {
		const original = createInitialState(8);
		original.tempo = 160;
		original.octave = 6;
		original.stepSize = 4;
		original.chainLoop = false;
		const project = extractProject(original);

		const restored = applyProject(project);
		expect(restored.tempo).toBe(160);
		expect(restored.octave).toBe(6);
		expect(restored.stepSize).toBe(4);
		expect(restored.chainLoop).toBe(false);
	});

	it("resets ephemeral state but restores cursor and page", () => {
		const original = createInitialState(8);
		original.playing = true;
		original.cursor = { row: 5, col: 3, field: StepField.Velocity };
		original.page = Page.Instrument;
		original.undoStack.push({ entries: [] });
		const project = extractProject(original);

		const restored = applyProject(project);
		expect(restored.playing).toBe(false);
		expect(restored.cursor).toEqual({ row: 5, col: 3, field: StepField.Velocity });
		expect(restored.page).toBe(Page.Instrument);
		expect(restored.undoStack).toEqual([]);
		expect(restored.redoStack).toEqual([]);
	});

	it("roundtrips through JSON", () => {
		const original = createInitialState(8);
		original.tempo = 135;
		original.octave = 3;
		const project = extractProject(original);

		const json = JSON.stringify(project);
		const parsed = JSON.parse(json) as typeof project;
		const restored = applyProject(parsed);

		expect(restored.tempo).toBe(135);
		expect(restored.octave).toBe(3);
		expect(restored.patterns).toEqual(original.patterns);
		expect(restored.patches).toEqual(original.patches);
	});
});
