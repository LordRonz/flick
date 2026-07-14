import { describe, expect, it } from "vitest";
import { isFreshInputTimestamp } from "./input-validation";

describe("controller input freshness", () => {
	it("accepts increasing timestamps close to the server clock", () => {
		expect(isFreshInputTimestamp(10_000, 10_000, 9_900)).toBe(true);
	});

	it("rejects stale, future, and replayed timestamps", () => {
		expect(isFreshInputTimestamp(-1, 10_000)).toBe(false);
		expect(isFreshInputTimestamp(20_000, 10_000)).toBe(false);
		expect(isFreshInputTimestamp(9_900, 10_000, 9_900)).toBe(false);
	});
});
