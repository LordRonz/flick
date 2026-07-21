import { z } from "zod";
import { FLICK_SOURCES } from "../game/config/controls";
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
const flickSourceSchema = z.enum(FLICK_SOURCES);
const playerNumberSchema = z.union([
	z.literal(1),
	z.literal(2),
	z.literal(3),
	z.literal(4),
]);
const playerColorSchema = z.enum(PLAYER_COLORS);
const matchPhaseSchema = z.enum(["lobby", "countdown", "playing", "results"]);
const projectileTypeSchema = z.enum([
	"paper-ball",
	"coffee-mug",
	"stapler",
	"bomb",
	"superball",
]);
const propTypeSchema = z.enum([
	"monitor",
	"printer",
	"plant",
	"water-cooler",
	"document-stack",
	"office-chair",
	"recycling-bin",
]);

const playerAssignmentSchema = z.object({
	playerId: z.string().uuid(),
	playerNumber: playerNumberSchema,
	color: playerColorSchema,
});

const lobbyPlayerSchema = playerAssignmentSchema.extend({
	ready: z.boolean(),
	motionEnabled: z.boolean(),
	connected: z.boolean(),
});

const playerRoundStatsSchema = z.object({
	score: z.number().int().nonnegative(),
	throws: z.number().int().nonnegative(),
	playerHits: z.number().int().nonnegative(),
	successfulThrows: z.number().int().nonnegative(),
	bankShots: z.number().int().nonnegative(),
	leaderHits: z.number().int().nonnegative(),
	propHits: z.number().int().nonnegative(),
	propsDestroyed: z.number().int().nonnegative(),
});

const standingSchema = playerAssignmentSchema.extend({
	rank: z.number().int().positive(),
	...playerRoundStatsSchema.shape,
});

const spectatorPlayerStateSchema = playerAssignmentSchema
	.extend({
		stationId: z.string().min(1).max(32),
		x: finiteNumber,
		y: finiteNumber,
		rotation: finiteNumber,
		aimAngle: finiteNumber,
		cooldownRemainingMs: finiteNumber.min(0),
		animationState: z.enum([
			"idle",
			"aiming",
			"throwing",
			"hit",
			"winning",
			"losing",
		]),
		ready: z.boolean(),
	})
	.strict();

const spectatorProjectileStateSchema = z
	.object({
		projectileId: z.string().uuid(),
		ownerPlayerId: z.string().uuid(),
		projectileType: projectileTypeSchema,
		x: finiteNumber,
		y: finiteNumber,
		rotation: finiteNumber,
		velocityX: finiteNumber,
		velocityY: finiteNumber,
	})
	.strict();

const spectatorPropStateSchema = z
	.object({
		propId: z.string().min(1).max(64),
		propType: propTypeSchema,
		x: finiteNumber,
		y: finiteNumber,
		rotation: finiteNumber,
		health: finiteNumber.min(0),
		maxHealth: finiteNumber.positive(),
		destroyed: z.boolean(),
		damageState: z.number().int().min(0).max(3),
	})
	.strict();

export const SpectatorSnapshotSchema = z
	.object({
		type: z.literal("spectator-snapshot"),
		sequence: z.number().int().nonnegative(),
		hostTimestamp: finiteNumber.nonnegative(),
		phase: matchPhaseSchema,
		timeRemainingMs: finiteNumber.min(0),
		countdownValue: z
			.union([z.literal(3), z.literal(2), z.literal(1), z.literal("FLICK")])
			.optional(),
		players: z.array(spectatorPlayerStateSchema).max(4),
		projectiles: z.array(spectatorProjectileStateSchema).max(32),
		props: z.array(spectatorPropStateSchema).max(8),
		scores: z
			.array(
				z
					.object({
						playerId: z.string().uuid(),
						score: z.number().int().nonnegative(),
					})
					.strict(),
			)
			.max(4),
		standings: z.array(standingSchema).max(4).optional(),
		targetSpectatorId: z.string().uuid().optional(),
	})
	.strict();

export const SpectatorPresentationEventSchema = z.discriminatedUnion("type", [
	z
		.object({
			type: z.literal("projectile-thrown"),
			eventId: z.string().uuid(),
			playerId: z.string().uuid(),
			projectileId: z.string().uuid(),
			projectileType: projectileTypeSchema,
			intensity: finiteNumber.min(0).max(1),
		})
		.strict(),
	z
		.object({
			type: z.literal("player-hit"),
			eventId: z.string().uuid(),
			attackerPlayerId: z.string().uuid(),
			targetPlayerId: z.string().uuid(),
			projectileType: projectileTypeSchema,
			score: z.number().int().nonnegative(),
			bankShot: z.boolean(),
			leaderBounty: z.boolean(),
			impactX: finiteNumber,
			impactY: finiteNumber,
			impactStrength: finiteNumber.min(0),
		})
		.strict(),
	z
		.object({
			type: z.literal("prop-damaged"),
			eventId: z.string().uuid(),
			propId: z.string().min(1).max(64),
			propType: propTypeSchema,
			playerId: z.string().uuid(),
			score: z.number().int().nonnegative(),
			destroyed: z.boolean(),
			impactX: finiteNumber,
			impactY: finiteNumber,
		})
		.strict(),
	z
		.object({
			type: z.literal("prop-destroyed"),
			eventId: z.string().uuid(),
			playerId: z.string().uuid(),
			propId: z.string().min(1).max(64),
			propType: propTypeSchema,
			score: z.number().int().nonnegative(),
			impactX: finiteNumber,
			impactY: finiteNumber,
		})
		.strict(),
	z
		.object({
			type: z.literal("bomb-exploded"),
			eventId: z.string().uuid(),
			playerId: z.string().uuid(),
			impactX: finiteNumber,
			impactY: finiteNumber,
		})
		.strict(),
	z
		.object({
			type: z.literal("countdown"),
			eventId: z.string().uuid(),
			value: z.union([
				z.literal(3),
				z.literal(2),
				z.literal(1),
				z.literal("FLICK"),
			]),
		})
		.strict(),
	z
		.object({
			type: z.literal("match-ended"),
			eventId: z.string().uuid(),
			standings: z.array(standingSchema).max(4),
		})
		.strict(),
]);

const spectatorEventMessageSchema = z
	.object({
		type: z.literal("spectator-event"),
		event: SpectatorPresentationEventSchema,
	})
	.strict();

const flickAcceptedSchema = z
	.object({
		type: z.literal("flick-accepted"),
		playerId: z.string().uuid(),
		projectileType: projectileTypeSchema,
		practice: z.boolean().optional(),
	})
	.strict();

const hitConfirmedSchema = z.object({
	type: z.literal("hit-confirmed"),
	attackerPlayerId: z.string().uuid(),
	targetPlayerId: z.string().uuid(),
	score: z.number().int().nonnegative(),
	bankShot: z.boolean(),
	leaderBounty: z.boolean(),
});

const propHitConfirmedSchema = z.object({
	type: z.literal("prop-hit-confirmed"),
	playerId: z.string().uuid(),
	propType: propTypeSchema,
	score: z.number().int().nonnegative(),
	destroyed: z.boolean(),
});

const leaderStateSchema = z.object({
	type: z.literal("leader-state"),
	leaderPlayerId: z.string().uuid().nullable(),
	leaderPlayerNumber: playerNumberSchema.nullable(),
	bountyActive: z.boolean(),
});

const controllerInputSchema = z.discriminatedUnion("type", [
	z
		.object({
			type: z.literal("aim"),
			normalizedAim: finiteNumber.min(-1).max(1),
			timestamp: finiteNumber,
		})
		.strict(),
	z
		.object({
			type: z.literal("flick"),
			intensity: finiteNumber.min(0).max(1),
			source: flickSourceSchema,
			timestamp: finiteNumber,
		})
		.strict(),
	z.object({ type: z.literal("ready"), ready: z.boolean() }).strict(),
	z
		.object({
			type: z.literal("motion-status"),
			enabled: z.boolean(),
		})
		.strict(),
]);

export const ControllerMessageSchema = controllerInputSchema;

export const HostToRoomMessageSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("match-state"),
		phase: matchPhaseSchema,
		timeRemainingMs: finiteNumber.min(0).optional(),
	}),
	leaderStateSchema,
	flickAcceptedSchema,
	hitConfirmedSchema,
	propHitConfirmedSchema,
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
	SpectatorSnapshotSchema,
	spectatorEventMessageSchema,
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
	z
		.object({
			type: z.literal("controller-input"),
			playerId: z.string().uuid(),
			input: controllerInputSchema,
		})
		.strict(),
	z
		.object({
			type: z.literal("spectator-connected"),
			spectatorId: z.string().uuid(),
		})
		.strict(),
	z
		.object({
			type: z.literal("spectator-disconnected"),
			spectatorId: z.string().uuid(),
		})
		.strict(),
	z
		.object({
			type: z.literal("spectator-count"),
			count: z.number().int().nonnegative(),
		})
		.strict(),
	z
		.object({
			type: z.literal("spectator-sync-request"),
			spectatorId: z.string().uuid(),
		})
		.strict(),
	z.object({ type: z.literal("error"), message: z.string().min(1).max(180) }),
]);

export const SpectatorToRoomMessageSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("request-sync") }).strict(),
	z
		.object({
			type: z.literal("ping"),
			timestamp: finiteNumber,
		})
		.strict(),
]);

export const RoomToSpectatorMessageSchema = z.discriminatedUnion("type", [
	SpectatorSnapshotSchema,
	spectatorEventMessageSchema,
	z
		.object({
			type: z.literal("host-unavailable"),
			message: z.string().min(1).max(180),
		})
		.strict(),
	z
		.object({
			type: z.literal("pong"),
			timestamp: finiteNumber,
			serverTimestamp: finiteNumber,
		})
		.strict(),
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
	leaderStateSchema,
	flickAcceptedSchema,
	z.object({
		type: z.literal("score-update"),
		playerId: z.string().uuid(),
		score: z.number().int().nonnegative(),
	}),
	hitConfirmedSchema,
	propHitConfirmedSchema,
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
export type AimInputMessage = Extract<ControllerMessage, { type: "aim" }>;
export type FlickInputMessage = Extract<ControllerMessage, { type: "flick" }>;
export type HostToRoomMessage = z.infer<typeof HostToRoomMessageSchema>;
export type RoomToHostMessage = z.infer<typeof RoomToHostMessageSchema>;
export type HostMessage = z.infer<typeof HostMessageSchema>;
export type SpectatorSnapshot = z.infer<typeof SpectatorSnapshotSchema>;
export type SpectatorPlayerState = SpectatorSnapshot["players"][number];
export type SpectatorProjectileState = SpectatorSnapshot["projectiles"][number];
export type SpectatorPropState = SpectatorSnapshot["props"][number];
export type SpectatorPresentationEvent = z.infer<
	typeof SpectatorPresentationEventSchema
>;
export type SpectatorToRoomMessage = z.infer<
	typeof SpectatorToRoomMessageSchema
>;
export type RoomToSpectatorMessage = z.infer<
	typeof RoomToSpectatorMessageSchema
>;

export type PlayerAssignmentMessage = {
	playerId: string;
	playerNumber: PlayerNumber;
	color: PlayerColor;
};

export type NetworkMatchPhase = MatchPhase;
export type NetworkProjectileType = ProjectileType;
export type NetworkPropType = PropType;

export const MAX_MESSAGE_BYTES = 4096;
export const MAX_HOST_MESSAGE_BYTES = 32_768;

export function parseJsonMessage<T>(
	raw: string,
	schema: z.ZodType<T>,
	maxBytes = MAX_MESSAGE_BYTES,
): T | null {
	if (new TextEncoder().encode(raw).byteLength > maxBytes) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		const result = schema.safeParse(parsed);
		return result.success ? result.data : null;
	} catch {
		return null;
	}
}
