import { describe, expect, it } from "vitest";
import type { SpectatorSnapshot } from "../realtime/protocol";
import {
	correctTimer,
	interpolateRotation,
	PresentationEventDeduplicator,
	SnapshotBuffer,
	SpectatorResyncState,
} from "./sync";

function snapshot(
	sequence: number,
	hostTimestamp: number,
	x: number,
	rotation = 0,
): SpectatorSnapshot {
	return {
		type: "spectator-snapshot",
		sequence,
		hostTimestamp,
		phase: "playing",
		timeRemainingMs: 30_000,
		players: [
			{
				playerId: "00000000-0000-4000-8000-000000000001",
				playerNumber: 1,
				color: "blue",
				stationId: "station-1",
				x,
				y: 10,
				rotation,
				aimAngle: rotation,
				cooldownRemainingMs: 0,
				animationState: "idle",
				ready: true,
			},
		],
		projectiles: [],
		props: [],
		scores: [],
	};
}

describe("spectator synchronization", () => {
	it("rejects stale snapshots and tracks latest sequence", () => {
		const buffer = new SnapshotBuffer();
		expect(buffer.push(snapshot(2, 200, 20))).toBe(true);
		expect(buffer.push(snapshot(1, 100, 10))).toBe(false);
		expect(buffer.latestSequence).toBe(2);
		expect(buffer.size).toBe(1);
	});

	it("interpolates positions between buffered snapshots", () => {
		const buffer = new SnapshotBuffer();
		buffer.push(snapshot(1, 100, 10));
		buffer.push(snapshot(2, 200, 30));
		expect(buffer.sample(150)?.players[0]?.x).toBe(20);
	});

	it("freezes at newest snapshot when render time passes buffer", () => {
		const buffer = new SnapshotBuffer();
		buffer.push(snapshot(1, 100, 10));
		buffer.push(snapshot(2, 200, 30));
		expect(buffer.sample(500)?.players[0]?.x).toBe(30);
	});

	it("interpolates rotation across the shortest angle", () => {
		const result = interpolateRotation(
			(350 * Math.PI) / 180,
			(10 * Math.PI) / 180,
			0.5,
		);
		expect(Math.sin(result)).toBeCloseTo(0, 5);
		expect(Math.cos(result)).toBeCloseTo(1, 5);
	});

	it("smoothly corrects small timer drift and snaps large drift", () => {
		expect(correctTimer(9_900, 10_000, 200)).toBe(9_880);
		expect(correctTimer(20_000, 10_000, 200)).toBe(9_800);
	});

	it("prevents duplicate presentation events", () => {
		const events = new PresentationEventDeduplicator();
		const event = {
			type: "countdown",
			eventId: "00000000-0000-4000-8000-000000000002",
			value: 3,
		} as const;
		expect(events.accept(event)).toBe(true);
		expect(events.accept(event)).toBe(false);
	});

	it("clears stale snapshots and requests fresh sync after reconnect", () => {
		const state = new SpectatorResyncState();
		state.receivedSnapshot(snapshot(4, 400, 40));
		expect(state.needsSync).toBe(false);
		state.connected();
		expect(state.needsSync).toBe(true);
		expect(state.buffer.size).toBe(0);
	});
});
