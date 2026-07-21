import { colorForPlayerNumber } from "../realtime/player-slots";
import type { LobbyPlayer, PlayerAssignment, PlayerNumber } from "./types";

export const SOLO_BOT_ID = "00000000-0000-4000-8000-00000000b070";
export const SOLO_BOT_AIM_LEAD_MS = 260;

const BOT_STATION_PREFERENCE: PlayerNumber[] = [4, 3, 2, 1];

export type SoloBotMove = {
	normalizedAim: number;
	intensity: number;
	delayMs: number;
};

export function createSoloBot(
	humanPlayers: readonly PlayerAssignment[],
): LobbyPlayer | null {
	if (humanPlayers.length !== 1) return null;
	const occupied = new Set(humanPlayers.map((player) => player.playerNumber));
	const playerNumber = BOT_STATION_PREFERENCE.find(
		(candidate) => !occupied.has(candidate),
	);
	if (!playerNumber) return null;
	return {
		playerId: SOLO_BOT_ID,
		playerNumber,
		color: colorForPlayerNumber(playerNumber),
		ready: true,
		motionEnabled: false,
		connected: true,
	};
}

export function createSoloBotMove(
	random: () => number = Math.random,
): SoloBotMove {
	const aimSample = safeRandomSample(random());
	const intensitySample = safeRandomSample(random());
	const delaySample = safeRandomSample(random());
	return {
		normalizedAim: roundToHundredths(-0.5 + aimSample),
		intensity: roundToHundredths(0.62 + intensitySample * 0.24),
		delayMs: Math.round(900 + delaySample * 600),
	};
}

export function isSoloBot(playerId: string) {
	return playerId === SOLO_BOT_ID;
}

export function shouldRemoveSoloBot(
	bot: PlayerAssignment,
	connectedHumans: readonly PlayerAssignment[],
) {
	return (
		connectedHumans.length > 1 ||
		connectedHumans.some((player) => player.playerNumber === bot.playerNumber)
	);
}

export function playerLabel(
	player: Pick<PlayerAssignment, "playerId" | "playerNumber">,
) {
	return isSoloBot(player.playerId) ? "BOT" : `P${player.playerNumber}`;
}

function safeRandomSample(value: number) {
	if (!Number.isFinite(value)) return 0.5;
	return Math.max(0, Math.min(1, value));
}

function roundToHundredths(value: number) {
	return Math.round(value * 100) / 100;
}
