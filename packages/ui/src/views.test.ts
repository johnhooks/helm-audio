import { describe, it, expect } from "vitest";
import { createInitialState } from "@helm-audio/store";
import { Page } from "@helm-audio/types";
import { buildPatternView } from "./pattern.ts";
import { buildSequenceView } from "./sequence.ts";
import { buildInstrumentView } from "./instrument.ts";
import { printTree } from "./print.ts";

function noop() {}

describe("pattern view tree", () => {
	it("matches snapshot", async () => {
		const state = createInitialState(8);
		state.page = Page.Pattern;
		const tree = buildPatternView(state, noop, noop);
		await expect(printTree(tree)).toMatchFileSnapshot("__snapshots__/pattern-view.sexp");
	});
});

describe("sequence view tree", () => {
	it("matches snapshot", async () => {
		const state = createInitialState(8);
		state.page = Page.Sequence;
		const tree = buildSequenceView(state, noop, noop);
		await expect(printTree(tree)).toMatchFileSnapshot("__snapshots__/sequence-view.sexp");
	});
});

describe("instrument view tree", () => {
	it("matches snapshot", async () => {
		const state = createInitialState(8);
		state.page = Page.Instrument;
		const tree = buildInstrumentView(state, noop, noop);
		await expect(printTree(tree)).toMatchFileSnapshot("__snapshots__/instrument-view.sexp");
	});
});
