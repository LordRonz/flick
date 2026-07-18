import type { ProjectileType } from "../types";

export type ProjectileDefinition = {
	textureKey: string;
	bodyShape: "circle" | "rectangle";
	width: number;
	height: number;
	radius?: number;
	mass: number;
	restitution: number;
	friction: number;
	frictionAir: number;
	speedMultiplier: number;
	hitScore: number;
	propDamage: number;
	lifetimeMs: number;
	angularVelocityRange: { min: number; max: number };
};

export const MIN_THROW_SPEED = 12;
export const MAX_THROW_SPEED = 28;
export const MAX_ACTIVE_PROJECTILES = 32;

export const PROJECTILE_DEFINITIONS: Record<
	ProjectileType,
	ProjectileDefinition
> = {
	"paper-ball": {
		textureKey: "projectile-paper-ball",
		bodyShape: "circle",
		width: 22,
		height: 22,
		radius: 11,
		mass: 0.8,
		restitution: 0.7,
		friction: 0.08,
		frictionAir: 0.012,
		speedMultiplier: 1.22,
		hitScore: 50,
		propDamage: 1,
		lifetimeMs: 6500,
		angularVelocityRange: { min: -8, max: 8 },
	},
	"coffee-mug": {
		textureKey: "projectile-coffee-mug",
		bodyShape: "rectangle",
		width: 26,
		height: 30,
		mass: 1.4,
		restitution: 0.5,
		friction: 0.26,
		frictionAir: 0.018,
		speedMultiplier: 0.92,
		hitScore: 100,
		propDamage: 2,
		lifetimeMs: 6500,
		angularVelocityRange: { min: -7, max: 7 },
	},
	stapler: {
		textureKey: "projectile-stapler",
		bodyShape: "rectangle",
		width: 34,
		height: 18,
		mass: 2.3,
		restitution: 0.3,
		friction: 0.38,
		frictionAir: 0.025,
		speedMultiplier: 0.72,
		hitScore: 150,
		propDamage: 3,
		lifetimeMs: 6500,
		angularVelocityRange: { min: -5, max: 5 },
	},
};

export const PROJECTILE_SEQUENCE: ProjectileType[] = [
	"paper-ball",
	"coffee-mug",
	"stapler",
];

export function nextProjectileType(
	throwCount: number,
	playerNumber: number,
): ProjectileType {
	return (
		PROJECTILE_SEQUENCE[
			(throwCount + playerNumber - 1) % PROJECTILE_SEQUENCE.length
		] ?? "paper-ball"
	);
}
