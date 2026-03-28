import type { DisplayList } from "@helm-audio/display";
import type { TrackerStore } from "@helm-audio/store";
import { Page } from "@helm-audio/types";
import type { Element } from "./element.ts";
import { dispatchKey, drawAll } from "./element.ts";
import { buildPatternView } from "./pattern.ts";
import { buildSequenceView } from "./sequence.ts";
import { buildInstrumentView } from "./instrument.ts";

const PAGE_ORDER = [Page.Pattern, Page.Sequence, Page.Instrument];

const DEFAULT_PATHS: Record<number, string[]> = {
	[Page.Pattern]: ["pattern", "grid", "00-0"],
	[Page.Sequence]: ["sequence", "grid", "0-note"],
	[Page.Instrument]: ["instrument", "header", "type"],
};

/**
 * Top-level UI controller. Owns the document model, focus state,
 * key dispatch, and view rendering.
 *
 * The shell creates a Tracker, passes events to it, and calls draw()
 * each frame. The Tracker produces abstract actions (TODO) and marks
 * itself dirty when the display needs to update.
 */
export class Tracker {
	dirty = true;
	focusPath: string[];

	private store: TrackerStore;
	private view: Element;

	constructor(store: TrackerStore) {
		this.store = store;
		this.focusPath = DEFAULT_PATHS[store.state.page] ?? DEFAULT_PATHS[Page.Sequence];
		this.view = this.buildView();
	}

	/** Handle a raw keyboard event. Returns true if the event was consumed. */
	handleKeyDown(e: KeyboardEvent): boolean {
		const key = normalizeKey(e);

		// Global: page switching
		if (key === "Shift+ArrowLeft") {
			this.prevPage();
			return true;
		}
		if (key === "Shift+ArrowRight") {
			this.nextPage();
			return true;
		}

		// Dispatch through element tree with scope bubbling
		if (dispatchKey(this.view, this.focusPath, key)) {
			this.dirty = true;
			return true;
		}

		return false;
	}

	/** Draw the current view into a DisplayList. */
	draw(display: DisplayList): void {
		this.view = this.buildView();
		display.clear();
		drawAll(display, this.view, this.focusPath);
		this.dirty = false;
	}

	// --- Page management ---

	switchPage(page: Page): void {
		this.store.setPage(page);
		this.focusPath = DEFAULT_PATHS[page] ?? DEFAULT_PATHS[Page.Sequence];
		this.view = this.buildView();
		this.dirty = true;
	}

	nextPage(): void {
		const idx = PAGE_ORDER.indexOf(this.store.state.page);
		this.switchPage(PAGE_ORDER[(idx + 1) % PAGE_ORDER.length]);
	}

	prevPage(): void {
		const idx = PAGE_ORDER.indexOf(this.store.state.page);
		this.switchPage(PAGE_ORDER[(idx - 1 + PAGE_ORDER.length) % PAGE_ORDER.length]);
	}

	// --- Internals ---

	private setPath = (path: string[]): void => {
		this.focusPath = path;
		this.dirty = true;
	};

	private buildView(): Element {
		switch (this.store.state.page) {
			case Page.Pattern:
				return buildPatternView(this.store, this.setPath);
			case Page.Sequence:
				return buildSequenceView(this.store, this.setPath);
			case Page.Instrument:
				return buildInstrumentView(this.store, this.setPath);
			default:
				return buildSequenceView(this.store, this.setPath);
		}
	}
}

// --- Key normalization ---

function normalizeKey(e: KeyboardEvent): string {
	const parts: string[] = [];
	if (e.ctrlKey) parts.push("Ctrl");
	if (e.altKey) parts.push("Alt");
	if (e.shiftKey) parts.push("Shift");
	parts.push(e.key);
	return parts.join("+");
}
