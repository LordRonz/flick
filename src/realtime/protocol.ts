import { z } from "zod";
import type {
	MatchPhase,
	PlayerColor,
	PlayerNumber,
	ProjectileType,
	PropType,
} from "../game/types";
import { PLAYER_COLORS } from "../game/types";

export const roomCodeSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/);

const finiteNumber = z.number().finite();
const playerNumberSchema = z.union([
	z.literal(1),
	z.literal(2),
	z.literal(3),
	z.literal(4),
]);
const playerColorSchema = z.enum(PLAYER_COLORS);
const matchPhaseSchema = z.enum(["lobby", "countdown", "playing", "results"]);
const projectileTypeSchema = z.enum(["paper-ball", "coffee-mug", "stapler"]);
const propTypeSchema = z.enum([
	"monitor",
	"printer",
	"plant",
	"water-cooler",
	"document-stack",
]);

const playerAssignmentSchema = z.object({
	playerId: z.string().uuid(),
	playerNumber: playerNumberSchema,
	color: playerColorSchema,
});

const lobbyPlayerSchema = playerAssignmentSchema.extend({
	ready: z.boolean(),
	calibrated: z.boolean(),
	connected: z.boolean(),
});

const playerRoundStatsSchema = z.object({
	score: z.number().int().nonnegative(),
	throws: z.number().int().nonnegative(),
	playerHits: z.number().int().nonnegative(),
	propsDestroyed: z.number().int().nonnegative(),
});

const standingSchema = playerAssignmentSchema.extend({
	rank: z.number().int().positive(),
	...playerRoundStatsSchema.shape,
});

const controllerInputSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("orientation"),
		normalizedX: finiteNumber.min(-1).max(1),
		timestamp: finiteNumber,
	}),
	z.object({
		type: z.literal("flick"),
		intensity: finiteNumber.min(0).max(1),
		timestamp: finiteNumber,
	}),
	z.object({ type: z.literal("ready"), ready: z.boolean() }),
	z.object({ type: z.literal("calibration-status"), calibrated: z.boolean() }),
]);

export const ControllerMessageSchema = controllerInputSchema;

export const HostToRoomMessageSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("match-state"),
		phase: matchPhaseSchema,
		timeRemainingMs: finiteNumber.min(0).optional(),
	}),
	z.object({
		type: z.literal("flick-accepted"),
		playerId: z.string().uuid(),
		projectileType: projectileTypeSchema,
	}),
	z.object({
		type: z.literal("hit-confirmed"),
		attackerPlayerId: z.string().uuid(),
		targetPlayerId: z.string().uuid(),
		score: z.number().int().nonnegative(),
	}),
	z.object({
		type: z.literal("player-hit"),
		targetPlayerId: z.string().uuid(),
		attackerPlayerId: z.string().uuid(),
	}),
	z.object({
		type: z.literal("prop-destroyed"),
		playerId: z.string().uuid(),
		propType: propTypeSchema,
		score: z.number().int().nonnegative(),
	}),
	z.object({
		type: z.literal("score-update"),
		playerId: z.string().uuid(),
		score: z.number().int().nonnegative(),
	}),
	z.object({
		type: z.literal("round-result"),
		standings: z.array(standingSchema).max(4),
	}),
]);

export const RoomToHostMessageSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("player-connected"),
		player: playerAssignmentSchema,
	}),
	z.object({
		type: z.literal("player-disconnected"),
		playerId: z.string().uuid(),
	}),
	z.object({
		type: z.literal("lobby-state"),
		players: z.array(lobbyPlayerSchema).max(4),
	}),
	z.object({
		type: z.literal("controller-input"),
		playerId: z.string().uuid(),
		input: controllerInputSchema,
	}),
	z.object({ type: z.literal("error"), message: z.string().min(1).max(180) }),
]);

export const HostMessageSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("assignment"), player: playerAssignmentSchema }),
	z.object({
		type: z.literal("lobby-state"),
		players: z.array(lobbyPlayerSchema).max(4),
	}),
	z.object({
		type: z.literal("match-state"),
		phase: matchPhaseSchema,
		timeRemainingMs: finiteNumber.min(0).optional(),
	}),
	z.object({
		type: z.literal("flick-accepted"),
		playerId: z.string().uuid(),
		projectileType: projectileTypeSchema,
	}),
	z.object({
		type: z.literal("score-update"),
		playerId: z.string().uuid(),
		score: z.number().int().nonnegative(),
	}),
	z.object({
		type: z.literal("hit-confirmed"),
		attackerPlayerId: z.string().uuid(),
		targetPlayerId: z.string().uuid(),
		score: z.number().int().nonnegative(),
	}),
	z.object({
		type: z.literal("player-hit"),
		targetPlayerId: z.string().uuid(),
		attackerPlayerId: z.string().uuid(),
	}),
	z.object({
		type: z.literal("prop-destroyed"),
		playerId: z.string().uuid(),
		propType: propTypeSchema,
		score: z.number().int().nonnegative(),
	}),
	z.object({
		type: z.literal("round-result"),
		standings: z.array(standingSchema).max(4),
	}),
	z.object({ type: z.literal("error"), message: z.string().min(1).max(180) }),
]);

export type ControllerMessage = z.infer<typeof ControllerMessageSchema>;
export type HostToRoomMessage = z.infer<typeof HostToRoomMessageSchema>;
export type RoomToHostMessage = z.infer<typeof RoomToHostMessageSchema>;
export type HostMessage = z.infer<typeof HostMessageSchema>;

export type PlayerAssignmentMessage = {
	playerId: string;
	playerNumber: PlayerNumber;
	color: PlayerColor;
};

export type NetworkMatchPhase = MatchPhase;
export type NetworkProjectileType = ProjectileType;
export type NetworkPropType = PropType;

export const MAX_MESSAGE_BYTES = 4096;

export function parseJsonMessage<T>(
	raw: string,
	schema: z.ZodType<T>,
): T | null {
	if (new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		const result = schema.safeParse(parsed);
		return result.success ? result.data : null;
	} catch {
		return null;
	}
}
