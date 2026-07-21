import type {
	SpectatorPresentationEvent,
	SpectatorSnapshot,
} from "../../realtime/protocol";
import type { AudioLevels } from "../audio/ArcadeAudio";
import type { FlickSource } from "../config/controls";
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
	| { type: "player-motion-status"; playerId: string; enabled: boolean }
	| { type: "aim"; playerId: string; normalizedAim: number }
	| {
			type: "flick";
			playerId: string;
			intensity: number;
			source: FlickSource;
	  }
	| { type: "start-match" }
	| { type: "set-muted"; muted: boolean; persist?: boolean }
	| { type: "unlock-audio" }
	| { type: "set-audio-levels"; levels: AudioLevels }
	| { type: "reset-match" }
	| { type: "set-spectator-count"; count: number }
	| { type: "request-spectator-snapshot"; spectatorId: string }
	| { type: "reset-spectator-sync" }
	| { type: "apply-spectator-snapshot"; snapshot: SpectatorSnapshot }
	| {
			type: "apply-spectator-event";
			event: SpectatorPresentationEvent;
	  };

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
			bankShot: boolean;
			leaderBounty: boolean;
	  }
	| {
			type: "prop-hit";
			playerId: string;
			propType: PropType;
			score: number;
			destroyed: boolean;
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
			source: FlickSource;
	  }
	| {
			type: "practice-throw";
			playerId: string;
			projectileType: ProjectileType;
			source: FlickSource;
	  }
	| { type: "match-ended"; standings: MatchStanding[] }
	| {
			type: "spectator-snapshot";
			snapshot: SpectatorSnapshot;
			targetSpectatorId?: string;
	  }
	| {
			type: "spectator-presentation";
			event: SpectatorPresentationEvent;
	  }
	| {
			type: "spectator-debug";
			lastSequence: number;
			bufferSize: number;
	  };
