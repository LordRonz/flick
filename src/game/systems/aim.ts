import { clamp } from "./math";

export type AimConfig = {
	minAngle: number;
	maxAngle: number;
	defaultAngle: number;
};

export function mapAimAngle(normalizedX: number, config: AimConfig) {
	const normalized = clamp(
		Number.isFinite(normalizedX) ? normalizedX : 0,
		-1,
		1,
	);
	return (
		config.minAngle +
		((normalized + 1) / 2) * (config.maxAngle - config.minAngle)
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
