import { describe, expect, it } from "vitest";
import { isFreshInputTimestamp } from "./input-validation";

describe("controller input freshness", () => {
	it("accepts increasing timestamps", () => {
		expect(isFreshInputTimestamp(10_000, 9_900)).toBe(true);
		expect(isFreshInputTimestamp(10_000)).toBe(true);
	});

	it("accepts skewed phone clocks as long as timestamps increase", () => {
		expect(isFreshInputTimestamp(5_000, 4_999)).toBe(true);
		expect(isFreshInputTimestamp(9_999_999, 9_999_998)).toBe(true);
	});

	it("rejects invalid and replayed timestamps", () => {
		expect(isFreshInputTimestamp(-1)).toBe(false);
		expect(isFreshInputTimestamp(Number.NaN)).toBe(false);
		expect(isFreshInputTimestamp(9_900, 9_900)).toBe(false);
		expect(isFreshInputTimestamp(9_800, 9_900)).toBe(false);
	});

	it("rebases after a large backwards clock jump", () => {
		expect(isFreshInputTimestamp(10_000, 60_000)).toBe(true);
	});
});
