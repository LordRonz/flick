import { PROJECTILE_DEFINITIONS } from "../config/projectiles";
import { PROP_DEFINITIONS } from "../config/props";
import type { ProjectileType, PropType } from "../types";

export function hitScore(projectileType: ProjectileType) {
	return PROJECTILE_DEFINITIONS[projectileType].hitScore;
}

export function propScore(propType: PropType) {
	return PROP_DEFINITIONS[propType].scoreValue;
}

export function canScoreAgainst(
	scoredPlayerIds: ReadonlySet<string>,
	targetPlayerId: string,
) {
	return !scoredPlayerIds.has(targetPlayerId);
}
