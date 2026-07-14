import { describe, expect, it } from "vitest";
import { canScoreAgainst, hitScore, propScore } from "./scoring";

describe("arena scoring", () => {
	it("uses distinct scores for each projectile", () => {
		expect(hitScore("paper-ball")).toBe(50);
		expect(hitScore("coffee-mug")).toBe(100);
		expect(hitScore("stapler")).toBe(150);
	});

	it("uses configured prop values", () => {
		expect(propScore("water-cooler")).toBeGreaterThan(
			propScore("document-stack"),
		);
	});

	it("prevents a projectile from scoring twice against one target", () => {
		expect(canScoreAgainst(new Set(), "p2")).toBe(true);
		expect(canScoreAgainst(new Set(["p2"]), "p2")).toBe(false);
	});
});
