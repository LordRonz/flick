import { describe, expect, it } from "vitest";
import type { MatchStanding } from "../types";
import {
	buildRoundAwards,
	rankStandings,
	successfulThrowRate,
} from "./results";

function standing(
	playerNumber: MatchStanding["playerNumber"],
	overrides: Partial<MatchStanding> = {},
): MatchStanding {
	return {
		playerId: `00000000-0000-4000-8000-00000000000${playerNumber}`,
		playerNumber,
		color: ["blue", "red", "green", "yellow"][
			playerNumber - 1
		] as MatchStanding["color"],
		rank: playerNumber,
		score: 0,
		throws: 0,
		playerHits: 0,
		successfulThrows: 0,
		bankShots: 0,
		leaderHits: 0,
		propHits: 0,
		propsDestroyed: 0,
		...overrides,
	};
}

describe("round results", () => {
	it("measures successful throws without allowing multi-hit shots above 100%", () => {
		expect(
			successfulThrowRate(standing(1, { throws: 10, successfulThrows: 7 })),
		).toBe(0.7);
		expect(
			successfulThrowRate(standing(1, { throws: 1, successfulThrows: 2 })),
		).toBe(1);
		expect(successfulThrowRate(standing(1))).toBe(0);
	});

	it("builds distinct, earned round awards", () => {
		const awards = buildRoundAwards([
			standing(1, { throws: 10, successfulThrows: 8, playerHits: 9 }),
			standing(2, { throws: 8, successfulThrows: 3, propHits: 6 }),
			standing(3, { throws: 12, successfulThrows: 6, bankShots: 3 }),
			standing(4, { throws: 10, successfulThrows: 4, leaderHits: 4 }),
		]);

		expect(awards).toEqual([
			expect.objectContaining({
				playerId: expect.stringMatching(/1$/),
				label: "SHARPSHOOTER",
			}),
			expect.objectContaining({
				playerId: expect.stringMatching(/3$/),
				label: "TRICK SHOT",
			}),
			expect.objectContaining({
				playerId: expect.stringMatching(/4$/),
				label: "BOSS HUNTER",
			}),
		]);
	});

	it("omits awards that nobody earned", () => {
		expect(buildRoundAwards([standing(1), standing(2)])).toEqual([]);
	});

	it("does not call a low hit rate sharpshooting", () => {
		expect(
			buildRoundAwards([
				standing(1, { throws: 12, successfulThrows: 3, playerHits: 3 }),
			]),
		).toEqual([]);
	});

	it("gives tied scores a shared rank", () => {
		const ranked = rankStandings(
			[
				standing(3, { score: 100 }),
				standing(1, { score: 200 }),
				standing(2, { score: 200 }),
			].map(({ rank: _rank, ...player }) => player),
		);

		expect(
			ranked.map(({ playerNumber, rank }) => ({ playerNumber, rank })),
		).toEqual([
			{ playerNumber: 1, rank: 1 },
			{ playerNumber: 2, rank: 1 },
			{ playerNumber: 3, rank: 3 },
		]);
	});

	it("shares an award when players tie for its best value", () => {
		const awards = buildRoundAwards([
			standing(1, { bankShots: 2 }),
			standing(2, { bankShots: 2 }),
		]);

		expect(awards).toEqual([
			expect.objectContaining({ playerNumber: 1, label: "TRICK SHOT" }),
			expect.objectContaining({ playerNumber: 2, label: "TRICK SHOT" }),
		]);
	});
});
