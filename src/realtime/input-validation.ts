export const MAX_INPUT_AGE_MS = 10_000;
export const MAX_INPUT_CLOCK_SKEW_MS = 2_000;

export function isFreshInputTimestamp(
	timestamp: number,
	now: number,
	previousTimestamp?: number,
) {
	if (
		timestamp < now - MAX_INPUT_AGE_MS ||
		timestamp > now + MAX_INPUT_CLOCK_SKEW_MS
	)
		return false;
	return previousTimestamp === undefined || timestamp > previousTimestamp;
}
