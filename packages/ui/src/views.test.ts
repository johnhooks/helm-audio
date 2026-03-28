import { describe, it, expect } from "vitest";
import { TrackerStore, createInitialState } from "@helm-audio/store";
import { Page } from "@helm-audio/types";
import { buildPatternView } from "./pattern.ts";
import { buildSequenceView } from "./sequence.ts";
import { buildInstrumentView } from "./instrument.ts";
import { printTree } from "./print.ts";

function noop() {}

describe("pattern view tree", () => {
	it("matches snapshot", async () => {
		const store = new TrackerStore(createInitialState(8));
		store.setPage(Page.Pattern);
		const tree = buildPatternView(store, noop);
		await expect(printTree(tree)).toMatchFileSnapshot("__snapshots__/pattern-view.sexp");
	});
});

describe("sequence view tree", () => {
	it("matches snapshot", async () => {
		const store = new TrackerStore(createInitialState(8));
		store.setPage(Page.Sequence);
		const tree = buildSequenceView(store, noop);
		await expect(printTree(tree)).toMatchFileSnapshot("__snapshots__/sequence-view.sexp");
	});
});

describe("instrument view tree", () => {
	it("matches snapshot", async () => {
		const store = new TrackerStore(createInitialState(8));
		store.setPage(Page.Instrument);
		const tree = buildInstrumentView(store, noop);
		await expect(printTree(tree)).toMatchFileSnapshot("__snapshots__/instrument-view.sexp");
	});
});
