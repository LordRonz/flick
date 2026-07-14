import { clamp } from "./math";

export type AimConfig = {
	minAngle: number;
	maxAngle: number;
	defaultAngle: number;
	invertInput?: boolean;
};

export function mapAimAngle(normalizedAim: number, config: AimConfig) {
	const normalized = clamp(
		Number.isFinite(normalizedAim) ? normalizedAim : 0,
		-1,
		1,
	);
	const directed = config.invertInput ? -normalized : normalized;
	return (
		config.minAngle + ((directed + 1) / 2) * (config.maxAngle - config.minAngle)
	);
}

export function smoothAim(
	previousAngle: number,
	targetAngle: number,
	factor = 0.14,
) {
	return previousAngle + (targetAngle - previousAngle) * clamp(factor, 0, 1);
}

export function mapThrowSpeed(intensity: number) {
	const normalized = clamp(Number.isFinite(intensity) ? intensity : 0, 0, 1);
	return 12 + normalized * (28 - 12);
}
