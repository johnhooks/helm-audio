import type { DisplayList } from "@helm-audio/display";

// --- Core types ---

export type RGB = readonly [number, number, number];

export interface Element {
	/** Unique id among siblings. */
	id: string;

	/** Position in character grid. */
	col: number;
	row: number;
	width: number;
	height: number;

	/** Can this element receive focus? Disabled elements are skipped during navigation. */
	enabled: boolean;

	/** Child elements. Navigation drills into these. */
	children?: Element[];

	/**
	 * Handle a key event at this scope level.
	 * Receives the full focus path for context.
	 * Return true to stop bubbling.
	 */
	onKey?: (key: string, path: string[]) => boolean;

	/**
	 * Draw this element. The `focused` flag is true when this is the
	 * leaf of the current focus path. `inScope` is true when this element
	 * is anywhere on the focus path (including ancestors of the focused leaf).
	 */
	draw: (display: DisplayList, focused: boolean, inScope: boolean) => void;
}

// --- Tree utilities ---

/** Walk a path of element ids and return the element at the end, or null. */
export function resolve(root: Element, path: string[]): Element | null {
	if (path.length === 0) return root;
	if (path[0] !== root.id) return null;
	let current: Element | null = root;
	for (let i = 1; i < path.length; i++) {
		if (!current?.children) return null;
		current = current.children.find((c) => c.id === path[i]) ?? null;
	}
	return current;
}

/** Find the parent of the element at the end of the path. */
export function resolveParent(root: Element, path: string[]): Element | null {
	if (path.length <= 1) return null;
	return resolve(root, path.slice(0, -1));
}

// --- Key dispatch ---

/**
 * Dispatch a key event by bubbling from the deepest scope to the root.
 * Each element's `onKey` handler is tried in order. First handler to
 * return true wins.
 */
export function dispatchKey(root: Element, path: string[], key: string): boolean {
	for (let depth = path.length; depth >= 1; depth--) {
		const el = resolve(root, path.slice(0, depth));
		if (el?.onKey?.(key, path)) return true;
	}
	return false;
}

// --- Drawing ---

/**
 * Walk the element tree and call draw on every element.
 * Elements on the focus path get `inScope: true`.
 * The leaf element on the focus path gets `focused: true`.
 */
export function drawAll(display: DisplayList, root: Element, path: string[]): void {
	function walk(el: Element, depth: number): void {
		const isOnPath = depth < path.length && path[depth] === el.id;
		const isLeaf = isOnPath && depth === path.length - 1;

		el.draw(display, isLeaf, isOnPath);

		if (el.children) {
			for (const child of el.children) {
				walk(child, isOnPath ? depth + 1 : path.length + 1);
			}
		}
	}
	walk(root, 0);
}

// --- Focus navigation ---

/** Get enabled sibling ids from a parent, given the current path. */
function enabledSiblings(root: Element, path: string[]): Element[] {
	const parent = resolveParent(root, path);
	if (!parent?.children) return [];
	return parent.children.filter((c) => c.enabled);
}

/**
 * Move focus to the next/previous enabled sibling at the current depth.
 * Returns a new path, or null if there is no sibling in that direction.
 */
export function moveSibling(root: Element, path: string[], delta: number): string[] | null {
	const siblings = enabledSiblings(root, path);
	if (siblings.length === 0) return null;

	const currentId = path[path.length - 1];
	const idx = siblings.findIndex((s) => s.id === currentId);
	const next = idx + delta;

	if (next < 0 || next >= siblings.length) return null;
	return [...path.slice(0, -1), siblings[next].id];
}

/**
 * Drill focus into the first enabled child of the current leaf.
 * Returns a new path, or null if the leaf has no enabled children.
 */
export function drillIn(root: Element, path: string[]): string[] | null {
	const el = resolve(root, path);
	if (!el?.children) return null;
	const first = el.children.find((c) => c.enabled);
	if (!first) return null;
	return [...path, first.id];
}

/**
 * Move focus up one scope level.
 * Returns a new path (parent becomes the leaf), or null if already at root.
 */
export function drillOut(path: string[]): string[] | null {
	if (path.length <= 1) return null;
	return path.slice(0, -1);
}
