import type { AimConfig } from "../systems/aim";
import type { PlayerNumber } from "../types";

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export type Station = {
	playerNumber: PlayerNumber;
	x: number;
	y: number;
	aim: AimConfig;
};

export const STATIONS: Record<PlayerNumber, Station> = {
	1: {
		playerNumber: 1,
		x: 160,
		y: 610,
		aim: { minAngle: -1.35, maxAngle: -0.18, defaultAngle: -0.78 },
	},
	2: {
		playerNumber: 2,
		x: 1120,
		y: 610,
		aim: { minAngle: -2.96, maxAngle: -1.79, defaultAngle: -2.36 },
	},
	3: {
		playerNumber: 3,
		x: 222,
		y: 284,
		aim: { minAngle: -0.98, maxAngle: 0.25, defaultAngle: -0.36 },
	},
	4: {
		playerNumber: 4,
		x: 1058,
		y: 284,
		aim: { minAngle: -2.78, maxAngle: -1.55, defaultAngle: -2.18 },
	},
};

export const PLATFORM_LAYOUT = [
	{ x: 640, y: 688, width: 1180, height: 34 },
	{ x: 640, y: 68, width: 1180, height: 22 },
	{ x: 408, y: 420, width: 310, height: 20 },
	{ x: 876, y: 420, width: 310, height: 20 },
	{ x: 640, y: 332, width: 260, height: 18 },
];
