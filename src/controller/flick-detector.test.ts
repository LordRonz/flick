import { describe, expect, it } from "vitest";
import {
	detectFlick,
	FLICK_PEAK_CAPTURE_MS,
	FLICK_SENSITIVITY_CONFIG,
	type FlickDetectorState,
	forwardAccelerationMagnitude,
	INITIAL_GRAVITY_FILTER,
	parseFlickSensitivity,
	removeGravity,
} from "./flick-detector";

function runFlick(
	samples: Array<{ magnitude: number; at: number }>,
	initial: FlickDetectorState = { lastFlickAt: -Infinity },
	config = FLICK_SENSITIVITY_CONFIG.normal,
) {
	let state = initial;
	let flicked = false;
	let intensity = 0;
	for (const sample of samples) {
		const result = detectFlick(sample.magnitude, state, sample.at, config);
		state = result.state;
		if (result.flicked) {
			flicked = true;
			intensity = result.intensity;
		}
	}
	return { flicked, intensity, state };
}

describe("flick detector", () => {
	it("fires above threshold after the peak-capture window", () => {
		const result = runFlick([
			{ magnitude: 30, at: 1000 },
			{ magnitude: 24, at: 1000 + FLICK_PEAK_CAPTURE_MS + 1 },
		]);
		expect(result.flicked).toBe(true);
		expect(result.intensity).toBeGreaterThan(0);
	});

	it("reports intensity from the swing peak, not the first crossing sample", () => {
		const weak = runFlick([
			{ magnitude: 14, at: 1000 },
			{ magnitude: 14, at: 1000 + FLICK_PEAK_CAPTURE_MS + 1 },
		]);
		const strong = runFlick([
			{ magnitude: 14, at: 1000 },
			{ magnitude: 40, at: 1060 },
			{ magnitude: 20, at: 1000 + FLICK_PEAK_CAPTURE_MS + 1 },
		]);
		expect(strong.intensity).toBeGreaterThan(weak.intensity);
		expect(strong.intensity).toBeGreaterThan(0.8);
	});

	it("ignores spikes during cooldown", () => {
		const result = detectFlick(30, { lastFlickAt: 800 }, 1000);
		expect(result.flicked).toBe(false);
		expect(result.state.pending).toBeUndefined();
	});

	it("supports named sensitivity presets", () => {
		expect(
			runFlick(
				[
					{ magnitude: 12, at: 1000 },
					{ magnitude: 12, at: 1000 + FLICK_PEAK_CAPTURE_MS + 1 },
				],
				{ lastFlickAt: -Infinity },
				FLICK_SENSITIVITY_CONFIG.high,
			).flicked,
		).toBe(true);
		expect(
			runFlick(
				[
					{ magnitude: 12, at: 1000 },
					{ magnitude: 12, at: 1000 + FLICK_PEAK_CAPTURE_MS + 1 },
				],
				{ lastFlickAt: -Infinity },
				FLICK_SENSITIVITY_CONFIG.low,
			).flicked,
		).toBe(false);
	});

	it("restores only valid saved sensitivity values", () => {
		expect(parseFlickSensitivity("low")).toBe("low");
		expect(parseFlickSensitivity("high")).toBe("high");
		expect(parseFlickSensitivity("turbo")).toBe("normal");
		expect(parseFlickSensitivity(null)).toBe("normal");
	});

	it("reaches full intensity on sensors clamped near ±2g", () => {
		// Many Android accelerometers cap devicemotion around 19.6 m/s², far
		// below maxIntensityMagnitude. A hard flick on such a device must still
		// read as a strong throw.
		const clipped = runFlick([
			{ magnitude: 19.6, at: 1000 },
			{ magnitude: 19.6, at: 1040 },
			{ magnitude: 19.6, at: 1000 + FLICK_PEAK_CAPTURE_MS + 1 },
		]);
		expect(clipped.flicked).toBe(true);
		expect(clipped.intensity).toBeGreaterThan(0.8);
	});

	it("keeps light flicks weak on clamped sensors", () => {
		const light = runFlick([
			{ magnitude: 15, at: 1000 },
			{ magnitude: 15, at: 1000 + FLICK_PEAK_CAPTURE_MS + 1 },
		]);
		expect(light.flicked).toBe(true);
		expect(light.intensity).toBeLessThan(0.4);
	});

	it("keeps the configured scale on devices with full sensor range", () => {
		// A device that has already reported strong magnitudes keeps grading
		// medium flicks against the configured ceiling, not its session peak.
		const medium = runFlick([
			{ magnitude: 40, at: 1000 },
			{ magnitude: 20, at: 1000 + FLICK_PEAK_CAPTURE_MS + 1 },
			{ magnitude: 25, at: 2000 },
			{ magnitude: 20, at: 2000 + FLICK_PEAK_CAPTURE_MS + 1 },
		]);
		expect(medium.flicked).toBe(true);
		expect(medium.intensity).toBeCloseTo((25 - 13) / (40 - 13), 2);
	});

	it("recognizes a flick regardless of the Android device axis", () => {
		expect(forwardAccelerationMagnitude({ x: 18, y: 2, z: 1 })).toBeCloseTo(
			Math.sqrt(18 * 18 + 2 * 2 + 1),
		);
		expect(forwardAccelerationMagnitude({ x: 2, y: -18, z: 1 })).toBeCloseTo(
			Math.sqrt(2 * 2 + 18 * 18 + 1),
		);
	});
});

describe("gravity filter", () => {
	it("suppresses the constant gravity baseline", () => {
		let state = INITIAL_GRAVITY_FILTER;
		let linear = { x: 0, y: 0, z: 0 };
		for (let index = 0; index < 20; index += 1) {
			const result = removeGravity({ x: 0, y: 0, z: 9.8 }, state);
			state = result.state;
			linear = result.linear;
		}
		expect(Math.abs(linear.z)).toBeLessThan(0.1);
	});

	it("passes sudden motion through after settling", () => {
		let state = INITIAL_GRAVITY_FILTER;
		for (let index = 0; index < 20; index += 1)
			state = removeGravity({ x: 0, y: 0, z: 9.8 }, state).state;
		const spike = removeGravity({ x: 0, y: 0, z: 9.8 + 20 }, state);
		expect(spike.linear.z).toBeGreaterThan(12);
	});
});
