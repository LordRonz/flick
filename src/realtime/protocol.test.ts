import { describe, expect, it } from "vitest";
import {
	ControllerMessageSchema,
	HostMessageSchema,
	parseJsonMessage,
	SpectatorSnapshotSchema,
	SpectatorToRoomMessageSchema,
} from "./protocol";

describe("realtime protocol", () => {
	it("accepts valid aim messages", () => {
		expect(
			parseJsonMessage(
				'{"type":"aim","normalizedAim":0.4,"timestamp":1}',
				ControllerMessageSchema,
			),
		).toEqual({ type: "aim", normalizedAim: 0.4, timestamp: 1 });
	});

	it("rejects out-of-range input", () => {
		expect(
			parseJsonMessage(
				'{"type":"flick","intensity":2,"source":"button","timestamp":1}',
				ControllerMessageSchema,
			),
		).toBeNull();
	});

	it("requires a known flick source", () => {
		expect(
			parseJsonMessage(
				'{"type":"flick","intensity":0.75,"source":"unknown","timestamp":1}',
				ControllerMessageSchema,
			),
		).toBeNull();
	});

	it("accepts motion status without requiring motion for ready", () => {
		expect(
			parseJsonMessage(
				'{"type":"motion-status","enabled":false}',
				ControllerMessageSchema,
			),
		).toEqual({ type: "motion-status", enabled: false });
	});

	it("rejects oversized payloads", () => {
		expect(
			parseJsonMessage("x".repeat(3000), ControllerMessageSchema),
		).toBeNull();
	});

	it("accepts a controller ready message", () => {
		expect(
			parseJsonMessage(
				'{"type":"ready","ready":true}',
				ControllerMessageSchema,
			),
		).toEqual({ type: "ready", ready: true });
	});

	it("accepts an assignment sent to a controller", () => {
		expect(
			parseJsonMessage(
				'{"type":"assignment","player":{"playerId":"00000000-0000-4000-8000-000000000001","playerNumber":2,"color":"red"}}',
				HostMessageSchema,
			)?.type,
		).toBe("assignment");
	});

	it("validates gameplay bonus feedback", () => {
		expect(
			HostMessageSchema.safeParse({
				type: "hit-confirmed",
				attackerPlayerId: "00000000-0000-4000-8000-000000000001",
				targetPlayerId: "00000000-0000-4000-8000-000000000002",
				score: 100,
				bankShot: true,
				leaderBounty: true,
			}).success,
		).toBe(true);
		expect(
			HostMessageSchema.safeParse({
				type: "prop-hit-confirmed",
				playerId: "00000000-0000-4000-8000-000000000001",
				propType: "printer",
				score: 20,
				destroyed: false,
			}).success,
		).toBe(true);
	});

	it("validates the live leader bounty state", () => {
		expect(
			HostMessageSchema.safeParse({
				type: "leader-state",
				leaderPlayerId: "00000000-0000-4000-8000-000000000002",
				leaderPlayerNumber: 2,
				bountyActive: true,
			}).success,
		).toBe(true);
	});

	it("requires the extended round stats used by results awards", () => {
		const result = {
			type: "round-result",
			standings: [
				{
					playerId: "00000000-0000-4000-8000-000000000001",
					playerNumber: 1,
					color: "blue",
					rank: 1,
					score: 250,
					throws: 10,
					playerHits: 4,
					successfulThrows: 3,
					bankShots: 1,
					leaderHits: 2,
					propHits: 3,
					propsDestroyed: 1,
				},
			],
		};
		expect(HostMessageSchema.safeParse(result).success).toBe(true);
		expect(
			HostMessageSchema.safeParse({
				...result,
				standings: result.standings.map(
					({ successfulThrows: _, ...standing }) => standing,
				),
			}).success,
		).toBe(false);
	});

	it("allows only sync and ping messages from spectators", () => {
		expect(
			parseJsonMessage('{"type":"request-sync"}', SpectatorToRoomMessageSchema),
		).toEqual({ type: "request-sync" });
		expect(
			parseJsonMessage(
				'{"type":"aim","normalizedAim":0.5,"timestamp":1}',
				SpectatorToRoomMessageSchema,
			),
		).toBeNull();
	});

	it("validates complete spectator snapshots", () => {
		const snapshot = {
			type: "spectator-snapshot",
			sequence: 2,
			hostTimestamp: 10,
			phase: "playing",
			timeRemainingMs: 42_000,
			players: [],
			projectiles: [],
			props: [],
			scores: [],
		};
		expect(SpectatorSnapshotSchema.safeParse(snapshot).success).toBe(true);
		expect(
			SpectatorSnapshotSchema.safeParse({
				...snapshot,
				sequence: -1,
			}).success,
		).toBe(false);
	});
});
