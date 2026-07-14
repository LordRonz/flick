export const PLAYER_COLORS = ["blue", "red", "green", "yellow"] as const;

export type PlayerColor = (typeof PLAYER_COLORS)[number];
export type PlayerNumber = 1 | 2 | 3 | 4;

export type PlayerAssignment = {
	playerId: string;
	playerNumber: PlayerNumber;
	color: PlayerColor;
};

export type LobbyPlayer = PlayerAssignment & {
	ready: boolean;
	calibrated: boolean;
	connected: boolean;
};

export type MatchPhase = "lobby" | "countdown" | "playing" | "results";

export type ProjectileType = "paper-ball" | "coffee-mug" | "stapler";

export type PropType =
	| "monitor"
	| "printer"
	| "plant"
	| "water-cooler"
	| "document-stack";

export type PlayerRoundStats = {
	score: number;
	throws: number;
	playerHits: number;
	propsDestroyed: number;
};

export type MatchStanding = PlayerAssignment &
	PlayerRoundStats & {
		rank: number;
	};
