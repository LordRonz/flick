import { clamp } from "../game/systems/math";

export type FlickSensitivity = "low" | "normal" | "high";

export type FlickDetectorConfig = {
	spikeThreshold: number;
	cooldownMs: number;
	maxIntensityMagnitude: number;
};

export const FLICK_SENSITIVITY_CONFIG: Record<
	FlickSensitivity,
	FlickDetectorConfig
> = {
	low: { spikeThreshold: 16, cooldownMs: 650, maxIntensityMagnitude: 46 },
	normal: { spikeThreshold: 13, cooldownMs: 550, maxIntensityMagnitude: 42 },
	high: { spikeThreshold: 10, cooldownMs: 500, maxIntensityMagnitude: 38 },
};

export const FLICK_DETECTOR_CONFIG = FLICK_SENSITIVITY_CONFIG.normal;

export type FlickDetectorState = { lastFlickAt: number };

export type AccelerationVector = {
	x?: number | null;
	y?: number | null;
	z?: number | null;
};

export function forwardAccelerationMagnitude(
	acceleration: AccelerationVector | null | undefined,
) {
	if (Number.isFinite(acceleration?.z)) return Math.abs(acceleration?.z ?? 0);
	const x = acceleration?.x ?? 0;
	const y = acceleration?.y ?? 0;
	const z = acceleration?.z ?? 0;
	return Math.sqrt(x * x + y * y + z * z);
}

export function detectFlick(
	magnitude: number,
	state: FlickDetectorState,
	now: number,
	config: FlickDetectorConfig = FLICK_DETECTOR_CONFIG,
) {
	if (
		!Number.isFinite(magnitude) ||
		magnitude < config.spikeThreshold ||
		now - state.lastFlickAt < config.cooldownMs
	) {
		return { flicked: false, intensity: 0, state };
	}
	const intensity = clamp(
		(magnitude - config.spikeThreshold) /
			(config.maxIntensityMagnitude - config.spikeThreshold),
		0,
		1,
	);
	return { flicked: true, intensity, state: { lastFlickAt: now } };
}
