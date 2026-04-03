import { describe, it, expect } from "vitest";
import type { DisplayList } from "@helm-audio/display";
import {
	type Element,
	resolve,
	resolveParent,
	dispatchKey,
	drawAll,
	moveSibling,
	drillIn,
	drillOut,
} from "./element.ts";

// --- Test helpers ---

/** Create a minimal element. No draw needed for logic tests. */
function el(id: string, opts: Partial<Element> = {}): Element {
	return {
		id,
		col: 0,
		row: 0,
		width: 1,
		height: 1,
		enabled: true,
		draw: opts.draw ?? (() => {}),
		...opts,
	};
}

/**
 * Build a small tree for testing:
 *
 *   root
 *   ├── a
 *   │   ├── a1
 *   │   └── a2
 *   ├── b (disabled)
 *   │   └── b1
 *   └── c
 *       ├── c1 (disabled)
 *       └── c2
 */
function makeTree(): Element {
	return el("root", {
		children: [
			el("a", {
				children: [el("a1"), el("a2")],
			}),
			el("b", {
				enabled: false,
				children: [el("b1")],
			}),
			el("c", {
				children: [el("c1", { enabled: false }), el("c2")],
			}),
		],
	});
}

// --- resolve ---

describe("resolve", () => {
	const tree = makeTree();

	it("resolves root by its own id", () => {
		const result = resolve(tree, ["root"]);
		expect(result?.id).toBe("root");
	});

	it("resolves a direct child", () => {
		const result = resolve(tree, ["root", "a"]);
		expect(result?.id).toBe("a");
	});

	it("resolves a nested child", () => {
		const result = resolve(tree, ["root", "a", "a2"]);
		expect(result?.id).toBe("a2");
	});

	it("returns null for a non-existent path", () => {
		expect(resolve(tree, ["root", "x"])).toBeNull();
	});

	it("returns null for a path that goes too deep", () => {
		expect(resolve(tree, ["root", "a", "a1", "deep"])).toBeNull();
	});

	it("returns null for wrong root id", () => {
		expect(resolve(tree, ["wrong"])).toBeNull();
	});
});

// --- resolveParent ---

describe("resolveParent", () => {
	const tree = makeTree();

	it("returns null for root path", () => {
		expect(resolveParent(tree, ["root"])).toBeNull();
	});

	it("returns root for a direct child path", () => {
		const result = resolveParent(tree, ["root", "a"]);
		expect(result?.id).toBe("root");
	});

	it("returns the parent of a nested child", () => {
		const result = resolveParent(tree, ["root", "a", "a2"]);
		expect(result?.id).toBe("a");
	});
});

// --- dispatchKey ---

describe("dispatchKey", () => {
	it("dispatches to the deepest handler first", () => {
		const log: string[] = [];
		const tree = el("root", {
			onKey: (key) => {
				log.push("root:" + key);
				return true;
			},
			children: [
				el("child", {
					onKey: (key) => {
						log.push("child:" + key);
						return true;
					},
				}),
			],
		});

		const handled = dispatchKey(tree, ["root", "child"], "Enter");
		expect(handled).toBe(true);
		expect(log).toEqual(["child:Enter"]);
	});

	it("bubbles to parent when child does not handle", () => {
		const log: string[] = [];
		const tree = el("root", {
			onKey: (key) => {
				log.push("root:" + key);
				return true;
			},
			children: [
				el("child", {
					onKey: () => false, // does not handle
				}),
			],
		});

		const handled = dispatchKey(tree, ["root", "child"], "Enter");
		expect(handled).toBe(true);
		expect(log).toEqual(["root:Enter"]);
	});

	it("returns false when no handler catches the key", () => {
		const tree = el("root", {
			children: [el("child")],
		});

		const handled = dispatchKey(tree, ["root", "child"], "Enter");
		expect(handled).toBe(false);
	});

	it("passes the full path to each handler", () => {
		const receivedPaths: string[][] = [];
		const tree = el("root", {
			onKey: (_key, path) => {
				receivedPaths.push([...path]);
				return false;
			},
			children: [
				el("child", {
					onKey: (_key, path) => {
						receivedPaths.push([...path]);
						return false;
					},
				}),
			],
		});

		dispatchKey(tree, ["root", "child"], "x");
		expect(receivedPaths).toEqual([
			["root", "child"], // child handler gets full path
			["root", "child"], // root handler also gets full path
		]);
	});

	it("stops bubbling after a handler returns true", () => {
		const log: string[] = [];
		const tree = el("root", {
			onKey: () => {
				log.push("root");
				return true;
			},
			children: [
				el("a", {
					onKey: () => {
						log.push("a");
						return true;
					},
					children: [
						el("a1", {
							onKey: () => {
								log.push("a1");
								return false;
							}, // does not handle
						}),
					],
				}),
			],
		});

		dispatchKey(tree, ["root", "a", "a1"], "x");
		// a1 doesn't handle, a does and stops bubbling
		expect(log).toEqual(["a1", "a"]);
	});
});

// --- drawAll ---

describe("drawAll", () => {
	it("calls draw on every element in the tree", () => {
		const drawn: string[] = [];
		const tree = el("root", {
			draw: () => drawn.push("root"),
			children: [
				el("a", {
					draw: () => drawn.push("a"),
					children: [el("a1", { draw: () => drawn.push("a1") })],
				}),
				el("b", { draw: () => drawn.push("b") }),
			],
		});

		drawAll(null as unknown as DisplayList, tree, ["root", "a", "a1"]);
		expect(drawn).toEqual(["root", "a", "a1", "b"]);
	});

	it("sets focused=true only on the leaf of the path", () => {
		const focusState: Record<string, boolean> = {};
		const tree = el("root", {
			draw: (_d, focused) => {
				focusState["root"] = focused;
			},
			children: [
				el("a", {
					draw: (_d, focused) => {
						focusState["a"] = focused;
					},
					children: [
						el("a1", {
							draw: (_d, focused) => {
								focusState["a1"] = focused;
							},
						}),
						el("a2", {
							draw: (_d, focused) => {
								focusState["a2"] = focused;
							},
						}),
					],
				}),
			],
		});

		drawAll(null as unknown as DisplayList, tree, ["root", "a", "a1"]);
		expect(focusState["root"]).toBe(false);
		expect(focusState["a"]).toBe(false);
		expect(focusState["a1"]).toBe(true);
		expect(focusState["a2"]).toBe(false);
	});

	it("sets inScope=true for elements on the focus path", () => {
		const scopeState: Record<string, boolean> = {};
		const tree = el("root", {
			draw: (_d, _f, inScope) => {
				scopeState["root"] = inScope;
			},
			children: [
				el("a", {
					draw: (_d, _f, inScope) => {
						scopeState["a"] = inScope;
					},
					children: [
						el("a1", {
							draw: (_d, _f, inScope) => {
								scopeState["a1"] = inScope;
							},
						}),
					],
				}),
				el("b", {
					draw: (_d, _f, inScope) => {
						scopeState["b"] = inScope;
					},
				}),
			],
		});

		drawAll(null as unknown as DisplayList, tree, ["root", "a", "a1"]);
		expect(scopeState["root"]).toBe(true);
		expect(scopeState["a"]).toBe(true);
		expect(scopeState["a1"]).toBe(true);
		expect(scopeState["b"]).toBe(false);
	});
});

// --- moveSibling ---

describe("moveSibling", () => {
	const tree = makeTree();

	it("moves to the next enabled sibling", () => {
		// root's enabled children: a, c (b is disabled)
		const result = moveSibling(tree, ["root", "a"], 1);
		expect(result).toEqual(["root", "c"]);
	});

	it("skips disabled siblings", () => {
		// Moving from a (+1) should skip b and land on c
		const result = moveSibling(tree, ["root", "a"], 1);
		expect(result).toEqual(["root", "c"]);
	});

	it("returns null when at the last sibling", () => {
		const result = moveSibling(tree, ["root", "c"], 1);
		expect(result).toBeNull();
	});

	it("returns null when at the first sibling going backwards", () => {
		const result = moveSibling(tree, ["root", "a"], -1);
		expect(result).toBeNull();
	});

	it("moves backwards through enabled siblings", () => {
		const result = moveSibling(tree, ["root", "c"], -1);
		expect(result).toEqual(["root", "a"]);
	});

	it("works at deeper levels", () => {
		const result = moveSibling(tree, ["root", "a", "a1"], 1);
		expect(result).toEqual(["root", "a", "a2"]);
	});
});

// --- drillIn ---

describe("drillIn", () => {
	const tree = makeTree();

	it("drills into the first enabled child", () => {
		const result = drillIn(tree, ["root"]);
		expect(result).toEqual(["root", "a"]);
	});

	it("skips disabled children", () => {
		// c's first child is c1 (disabled), should land on c2
		const result = drillIn(tree, ["root", "c"]);
		expect(result).toEqual(["root", "c", "c2"]);
	});

	it("returns null when element has no children", () => {
		const result = drillIn(tree, ["root", "a", "a1"]);
		expect(result).toBeNull();
	});

	it("returns null when all children are disabled", () => {
		const allDisabled = el("root", {
			children: [el("x", { enabled: false }), el("y", { enabled: false })],
		});
		const result = drillIn(allDisabled, ["root"]);
		expect(result).toBeNull();
	});
});

// --- drillOut ---

describe("drillOut", () => {
	it("removes the last element from the path", () => {
		const result = drillOut(["root", "a", "a1"]);
		expect(result).toEqual(["root", "a"]);
	});

	it("returns null when already at root", () => {
		const result = drillOut(["root"]);
		expect(result).toBeNull();
	});
});

// --- resolve edge cases ---

describe("resolve edge cases", () => {
	it("handles empty path", () => {
		const tree = makeTree();
		// Empty path should still return root since loop doesn't execute
		const result = resolve(tree, []);
		expect(result?.id).toBe("root");
	});

	it("handles single-element path matching root", () => {
		const tree = el("solo");
		const result = resolve(tree, ["solo"]);
		expect(result?.id).toBe("solo");
	});
});
