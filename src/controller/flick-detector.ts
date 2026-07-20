import { clamp } from "../game/systems/math";

export type FlickSensitivity = "low" | "normal" | "high";

export function parseFlickSensitivity(value: string | null): FlickSensitivity {
	if (value === "low" || value === "normal" || value === "high") return value;
	return "normal";
}

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

// After the threshold is crossed, keep sampling briefly so the reported
// intensity reflects the peak of the swing, not the first sample over the line.
export const FLICK_PEAK_CAPTURE_MS = 120;

// Many Android sensors clamp devicemotion near ±2g (~19.6 m/s²), so a hard
// flick never approaches maxIntensityMagnitude and reads as a weak throw.
// Intensity is instead scaled to the strongest magnitude the device has
// reported this session, floored so light wobbles cannot count as full power.
export const FLICK_MIN_INTENSITY_RANGE = 8;

export type FlickDetectorState = {
	lastFlickAt: number;
	observedMax?: number;
	pending?: { startedAt: number; peak: number };
};

export type AccelerationVector = {
	x?: number | null;
	y?: number | null;
	z?: number | null;
};

export function forwardAccelerationMagnitude(
	acceleration: AccelerationVector | null | undefined,
) {
	const x = finiteAxis(acceleration?.x);
	const y = finiteAxis(acceleration?.y);
	const z = finiteAxis(acceleration?.z);
	return Math.sqrt(x * x + y * y + z * z);
}

function finiteAxis(value: number | null | undefined) {
	return Number.isFinite(value) ? (value ?? 0) : 0;
}

export type GravityFilterState = {
	x: number;
	y: number;
	z: number;
	initialized: boolean;
};

export const INITIAL_GRAVITY_FILTER: GravityFilterState = {
	x: 0,
	y: 0,
	z: 0,
	initialized: false,
};

// Devices without gravity-free acceleration report ~9.8 m/s² at rest. A
// low-pass estimate of gravity is subtracted so only real motion remains.
export function removeGravity(
	sample: { x: number; y: number; z: number },
	state: GravityFilterState,
	alpha = 0.8,
) {
	const gravity = state.initialized
		? {
				x: state.x * alpha + sample.x * (1 - alpha),
				y: state.y * alpha + sample.y * (1 - alpha),
				z: state.z * alpha + sample.z * (1 - alpha),
			}
		: { x: sample.x, y: sample.y, z: sample.z };
	return {
		linear: {
			x: sample.x - gravity.x,
			y: sample.y - gravity.y,
			z: sample.z - gravity.z,
		},
		state: { ...gravity, initialized: true },
	};
}

export function detectFlick(
	magnitude: number,
	state: FlickDetectorState,
	now: number,
	config: FlickDetectorConfig = FLICK_DETECTOR_CONFIG,
) {
	if (!Number.isFinite(magnitude))
		return { flicked: false, intensity: 0, state };
	const observedMax = Math.max(state.observedMax ?? 0, magnitude);
	if (state.pending) {
		const peak = Math.max(state.pending.peak, magnitude);
		if (now - state.pending.startedAt < FLICK_PEAK_CAPTURE_MS) {
			return {
				flicked: false,
				intensity: 0,
				state: {
					lastFlickAt: state.lastFlickAt,
					observedMax,
					pending: { startedAt: state.pending.startedAt, peak },
				},
			};
		}
		const effectiveMax = clamp(
			observedMax,
			config.spikeThreshold + FLICK_MIN_INTENSITY_RANGE,
			config.maxIntensityMagnitude,
		);
		const intensity = clamp(
			(peak - config.spikeThreshold) / (effectiveMax - config.spikeThreshold),
			0,
			1,
		);
		return {
			flicked: true,
			intensity,
			state: { lastFlickAt: now, observedMax },
		};
	}
	if (
		magnitude < config.spikeThreshold ||
		now - state.lastFlickAt < config.cooldownMs
	) {
		return {
			flicked: false,
			intensity: 0,
			state: { ...state, observedMax },
		};
	}
	return {
		flicked: false,
		intensity: 0,
		state: {
			lastFlickAt: state.lastFlickAt,
			observedMax,
			pending: { startedAt: now, peak: magnitude },
		},
	};
}
