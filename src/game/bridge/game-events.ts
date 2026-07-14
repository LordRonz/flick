import type {
	MatchPhase,
	MatchStanding,
	PlayerAssignment,
	PlayerRoundStats,
	ProjectileType,
	PropType,
} from "../types";

export type ReactToGameEvent =
	| { type: "player-joined"; player: PlayerAssignment }
	| { type: "player-left"; playerId: string }
	| { type: "player-ready"; playerId: string; ready: boolean }
	| { type: "player-calibration"; playerId: string; calibrated: boolean }
	| { type: "orientation"; playerId: string; normalizedX: number }
	| { type: "flick"; playerId: string; intensity: number }
	| { type: "start-match" }
	| { type: "reset-match" };

export type GameToReactEvent =
	| { type: "game-ready" }
	| { type: "phase-changed"; phase: MatchPhase }
	| { type: "timer-changed"; timeRemainingMs: number }
	| { type: "score-changed"; playerId: string; score: number }
	| { type: "stats-changed"; playerId: string; stats: PlayerRoundStats }
	| {
			type: "player-hit";
			attackerPlayerId: string;
			targetPlayerId: string;
			score: number;
	  }
	| {
			type: "prop-destroyed";
			playerId: string;
			propType: PropType;
			score: number;
	  }
	| {
			type: "projectile-thrown";
			playerId: string;
			projectileType: ProjectileType;
	  }
	| { type: "match-ended"; standings: MatchStanding[] };
