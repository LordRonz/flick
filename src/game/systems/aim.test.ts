import { describe, expect, it } from "vitest";
import { mapAimAngle, mapThrowSpeed, smoothAim } from "./aim";

describe("arena aiming", () => {
	it("maps normalized aim across a station arc", () => {
		expect(
			mapAimAngle(-1, { minAngle: -1, maxAngle: 1, defaultAngle: 0 }),
		).toBe(-1);
		expect(mapAimAngle(1, { minAngle: -1, maxAngle: 1, defaultAngle: 0 })).toBe(
			1,
		);
	});

	it("mirrors input for stations facing the opposite direction", () => {
		expect(
			mapAimAngle(1, {
				minAngle: -3,
				maxAngle: -2,
				defaultAngle: -2.5,
				invertInput: true,
			}),
		).toBe(-3);
	});

	it("smooths noisy aim input", () => {
		expect(smoothAim(0, 1, 0.2)).toBeCloseTo(0.2);
	});

	it("clamps throw speed to the useful game range", () => {
		expect(mapThrowSpeed(-1)).toBe(12);
		expect(mapThrowSpeed(2)).toBe(28);
	});
});
