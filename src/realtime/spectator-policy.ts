export const MAX_SPECTATORS = 8;

export function canAcceptSpectator(currentSpectatorCount: number) {
	return currentSpectatorCount < MAX_SPECTATORS;
}
