import { PROJECTILE_DEFINITIONS } from "../config/projectiles";
import { PROP_DEFINITIONS } from "../config/props";
import type { ProjectileType, PropType } from "../types";

export const BANK_SHOT_BONUS = 25;
export const LEADER_BOUNTY_BONUS = 25;
export const LEADER_BOUNTY_DELAY_MS = 15_000;
export const MATCH_DURATION_MS = 60_000;
const PROP_DAMAGE_SCORE_SHARE = 0.6;

export function isLeaderBountyActive(timeRemainingMs: number) {
	return timeRemainingMs <= MATCH_DURATION_MS - LEADER_BOUNTY_DELAY_MS;
}

export function hitBonusLabels(bonuses: {
	bankShot: boolean;
	leaderBounty: boolean;
}) {
	const labels: string[] = [];
	if (bonuses.bankShot) labels.push(`BANK +${BANK_SHOT_BONUS}`);
	if (bonuses.leaderBounty) labels.push(`BOSS +${LEADER_BOUNTY_BONUS}`);
	return labels;
}

export function hitScore(projectileType: ProjectileType) {
	return PROJECTILE_DEFINITIONS[projectileType].hitScore;
}

export function propScore(propType: PropType) {
	return PROP_DEFINITIONS[propType].scoreValue;
}

export function playerHitScore(
	projectileType: ProjectileType,
	bonuses: { bankShot: boolean; leaderBounty: boolean },
) {
	const baseScore = hitScore(projectileType);
	const bankShotBonus = bonuses.bankShot ? BANK_SHOT_BONUS : 0;
	const leaderBountyBonus = bonuses.leaderBounty ? LEADER_BOUNTY_BONUS : 0;
	return {
		baseScore,
		bankShotBonus,
		leaderBountyBonus,
		totalScore: baseScore + bankShotBonus + leaderBountyBonus,
	};
}

export function propHitScore(
	propType: PropType,
	currentHealth: number,
	damage: number,
) {
	const definition = PROP_DEFINITIONS[propType];
	const safeHealth = Math.max(0, Math.min(definition.maxHealth, currentHealth));
	const damageApplied = Math.min(safeHealth, Math.max(0, damage));
	const damagePerHealth = Math.floor(
		(definition.scoreValue * PROP_DAMAGE_SCORE_SHARE) / definition.maxHealth,
	);
	const damageScore = damageApplied * damagePerHealth;
	const destroyed = safeHealth > 0 && damageApplied >= safeHealth;
	const destructionBonus = destroyed
		? definition.scoreValue - damagePerHealth * definition.maxHealth
		: 0;
	return {
		damageApplied,
		damageScore,
		destructionBonus,
		totalScore: damageScore + destructionBonus,
		destroyed,
	};
}

export function uniqueLeaderId(
	players: ReadonlyArray<{ playerId: string; score: number }>,
) {
	const highestScore = Math.max(0, ...players.map((player) => player.score));
	if (highestScore <= 0) return null;
	const leaders = players.filter((player) => player.score === highestScore);
	return leaders.length === 1 ? (leaders[0]?.playerId ?? null) : null;
}

export function canScoreAgainst(
	scoredPlayerIds: ReadonlySet<string>,
	targetPlayerId: string,
) {
	return !scoredPlayerIds.has(targetPlayerId);
}
