/**
 * Assert that a value is non-null and non-undefined.
 * Crashes hard with a clear message if the assertion fails.
 */
export function assert<T>(value: T | null | undefined, message?: string): T {
	if (value === null || value === undefined) {
		throw new Error(message ?? "assertion failed: expected non-null value");
	}
	return value;
}
