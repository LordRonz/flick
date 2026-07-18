export const CLOCK_RESET_THRESHOLD_MS = 30_000;

export function isFreshInputTimestamp(
	timestamp: number,
	previousTimestamp?: number,
) {
	if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
	if (previousTimestamp === undefined) return true;
	if (timestamp > previousTimestamp) return true;
	// A large backwards jump means the phone clock was reset (NTP sync,
	// timezone change); accept it and rebase instead of locking the player out.
	return previousTimestamp - timestamp > CLOCK_RESET_THRESHOLD_MS;
}
