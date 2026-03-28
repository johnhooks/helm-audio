import type { Element } from "./element.ts";

/**
 * Print an element tree as an s-expression string.
 *
 * Output format:
 *   (id col row width height enabled?
 *     (child ...)
 *     (child ...))
 *
 * Disabled elements show as (id ... :disabled).
 * Elements with onKey show :keys.
 */
export function printTree(el: Element, indent = 0): string {
	const pad = "  ".repeat(indent);
	const flags: string[] = [];
	if (!el.enabled) flags.push(":disabled");
	if (el.onKey) flags.push(":keys");

	const attrs = `${el.col} ${el.row} ${el.width}x${el.height}`;
	const flagStr = flags.length > 0 ? " " + flags.join(" ") : "";

	if (!el.children || el.children.length === 0) {
		return `${pad}(${el.id} ${attrs}${flagStr})`;
	}

	const childLines = el.children.map((c) => printTree(c, indent + 1));
	return `${pad}(${el.id} ${attrs}${flagStr}\n${childLines.join("\n")})`;
}
