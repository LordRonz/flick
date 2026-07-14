import { describe, expect, it } from "vitest";
import { mapAimAngle, mapThrowSpeed } from "./systems/aim";

describe("game physics boundary", () => {
	it("maps a centered aim to the station arc midpoint", () => {
		expect(mapAimAngle(0, { minAngle: -1, maxAngle: 1, defaultAngle: 0 })).toBe(
			0,
		);
	});

	it("keeps throw speed inside the Matter tuning range", () => {
		expect(mapThrowSpeed(0)).toBe(12);
		expect(mapThrowSpeed(1)).toBe(28);
	});
});
