import { describe, expect, it } from "vitest";
import {
	BANK_SHOT_BONUS,
	canScoreAgainst,
	hitBonusLabels,
	hitScore,
	isLeaderBountyActive,
	LEADER_BOUNTY_BONUS,
	MATCH_DURATION_MS,
	playerHitScore,
	propHitScore,
	propScore,
	uniqueLeaderId,
} from "./scoring";

describe("arena scoring", () => {
	it("uses distinct scores for each projectile", () => {
		expect(hitScore("paper-ball")).toBe(50);
		expect(hitScore("coffee-mug")).toBe(100);
		expect(hitScore("stapler")).toBe(150);
		expect(hitScore("bomb")).toBe(125);
		expect(hitScore("superball")).toBe(75);
	});

	it("uses configured prop values", () => {
		expect(propScore("water-cooler")).toBeGreaterThan(
			propScore("document-stack"),
		);
		expect(propScore("office-chair")).toBeGreaterThan(propScore("printer"));
		expect(propScore("recycling-bin")).toBeGreaterThan(
			propScore("document-stack"),
		);
	});

	it("prevents a projectile from scoring twice against one target", () => {
		expect(canScoreAgainst(new Set(), "p2")).toBe(true);
		expect(canScoreAgainst(new Set(["p2"]), "p2")).toBe(false);
	});

	it("adds readable bank-shot and leader-bounty bonuses", () => {
		expect(
			playerHitScore("paper-ball", {
				bankShot: true,
				leaderBounty: true,
			}),
		).toEqual({
			baseScore: 50,
			bankShotBonus: BANK_SHOT_BONUS,
			leaderBountyBonus: LEADER_BOUNTY_BONUS,
			totalScore: 50 + BANK_SHOT_BONUS + LEADER_BOUNTY_BONUS,
		});
	});

	it("names each bonus separately for clear score feedback", () => {
		expect(hitBonusLabels({ bankShot: true, leaderBounty: true })).toEqual([
			`BANK +${BANK_SHOT_BONUS}`,
			`BOSS +${LEADER_BOUNTY_BONUS}`,
		]);
	});

	it("activates the leader bounty after the opening grace period", () => {
		expect(isLeaderBountyActive(MATCH_DURATION_MS)).toBe(false);
		expect(isLeaderBountyActive(MATCH_DURATION_MS - 14_999)).toBe(false);
		expect(isLeaderBountyActive(MATCH_DURATION_MS - 15_000)).toBe(true);
	});

	it("splits prop value between damage and the destruction bonus", () => {
		const firstHit = propHitScore("printer", 3, 1);
		const finalHit = propHitScore("printer", 2, 3);

		expect(firstHit).toEqual({
			damageApplied: 1,
			damageScore: 20,
			destructionBonus: 0,
			totalScore: 20,
			destroyed: false,
		});
		expect(finalHit).toEqual({
			damageApplied: 2,
			damageScore: 40,
			destructionBonus: 40,
			totalScore: 80,
			destroyed: true,
		});
		expect(firstHit.totalScore + finalHit.totalScore).toBe(
			propScore("printer"),
		);
	});

	it("only identifies a positive, unique leader", () => {
		expect(
			uniqueLeaderId([
				{ playerId: "p1", score: 100 },
				{ playerId: "p2", score: 80 },
			]),
		).toBe("p1");
		expect(
			uniqueLeaderId([
				{ playerId: "p1", score: 100 },
				{ playerId: "p2", score: 100 },
			]),
		).toBeNull();
		expect(
			uniqueLeaderId([
				{ playerId: "p1", score: 0 },
				{ playerId: "p2", score: 0 },
			]),
		).toBeNull();
	});
});
