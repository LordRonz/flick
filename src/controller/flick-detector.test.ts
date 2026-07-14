import { describe, expect, it } from "vitest";
import {
	detectFlick,
	FLICK_SENSITIVITY_CONFIG,
	forwardAccelerationMagnitude,
} from "./flick-detector";

describe("flick detector", () => {
	it("fires above threshold", () => {
		const result = detectFlick(30, { lastFlickAt: -Infinity }, 1000);
		expect(result.flicked).toBe(true);
		expect(result.intensity).toBeGreaterThan(0);
	});

	it("ignores spikes during cooldown", () => {
		const result = detectFlick(30, { lastFlickAt: 800 }, 1000);
		expect(result.flicked).toBe(false);
	});

	it("supports named sensitivity presets", () => {
		expect(
			detectFlick(
				12,
				{ lastFlickAt: -Infinity },
				1000,
				FLICK_SENSITIVITY_CONFIG.high,
			).flicked,
		).toBe(true);
		expect(
			detectFlick(
				12,
				{ lastFlickAt: -Infinity },
				1000,
				FLICK_SENSITIVITY_CONFIG.low,
			).flicked,
		).toBe(false);
	});

	it("uses the forward axis so lateral movement does not trigger a flick", () => {
		expect(forwardAccelerationMagnitude({ x: 30, y: 0, z: 0 })).toBe(0);
		expect(forwardAccelerationMagnitude({ x: 2, y: 3, z: -18 })).toBe(18);
	});
});
