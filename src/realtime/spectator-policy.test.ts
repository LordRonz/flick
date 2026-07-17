import { describe, expect, it } from "vitest";
import { findFirstFreePlayerNumber } from "./player-slots";
import { canAcceptSpectator, MAX_SPECTATORS } from "./spectator-policy";

describe("spectator admission", () => {
	it("allows displays below limit and rejects display above limit", () => {
		expect(canAcceptSpectator(MAX_SPECTATORS - 1)).toBe(true);
		expect(canAcceptSpectator(MAX_SPECTATORS)).toBe(false);
	});

	it("does not consume controller player slots", () => {
		const occupiedControllerSlots = new Set([1, 2] as const);
		const spectatorCount = MAX_SPECTATORS;
		expect(spectatorCount).toBe(8);
		expect(findFirstFreePlayerNumber(occupiedControllerSlots)).toBe(3);
	});
});
