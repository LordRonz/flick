import {
	PLAYER_COLORS,
	type PlayerColor,
	type PlayerNumber,
} from "../game/types";

export const PLAYER_NUMBERS: PlayerNumber[] = [1, 2, 3, 4];

export function findFirstFreePlayerNumber(
	occupiedNumbers: ReadonlySet<PlayerNumber>,
) {
	return PLAYER_NUMBERS.find((number) => !occupiedNumbers.has(number)) ?? null;
}

export function colorForPlayerNumber(playerNumber: PlayerNumber): PlayerColor {
	return PLAYER_COLORS[playerNumber - 1] ?? "blue";
}
