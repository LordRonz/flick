import { describe, expect, it } from "vitest";
import { GAME_HEIGHT, GAME_WIDTH, WORLD_BOUNDARIES } from "./config/arena";
import { PROJECTILE_DEFINITIONS } from "./config/projectiles";
import { launchVelocity, mapAimAngle, mapThrowSpeed } from "./systems/aim";

describe("game physics boundary", () => {
	it("maps a centered aim to the station arc midpoint", () => {
		expect(mapAimAngle(0, { minAngle: -1, maxAngle: 1, defaultAngle: 0 })).toBe(
			0,
		);
	});

	it("keeps throw speed inside the Matter tuning range", () => {
		expect(mapThrowSpeed(0)).toBe(12);
		expect(mapThrowSpeed(1)).toBe(28);
		expect(launchVelocity(0, 1, 1)).toEqual({ x: 28, y: 0 });
	});

	it("closes every arena edge, including the corners", () => {
		const [left, right, top, bottom] = WORLD_BOUNDARIES;
		expect(left.x + left.width / 2).toBe(0);
		expect(right.x - right.width / 2).toBe(GAME_WIDTH);
		expect(top.y + top.height / 2).toBe(0);
		expect(bottom.y - bottom.height / 2).toBe(GAME_HEIGHT);
		expect(left.height).toBeGreaterThan(GAME_HEIGHT);
		expect(top.width).toBeGreaterThan(GAME_WIDTH);
	});

	it("gives every projectile a readable, distinct ricochet", () => {
		expect(PROJECTILE_DEFINITIONS["paper-ball"].restitution).toBeGreaterThan(
			PROJECTILE_DEFINITIONS["coffee-mug"].restitution,
		);
		expect(PROJECTILE_DEFINITIONS["coffee-mug"].restitution).toBeGreaterThan(
			PROJECTILE_DEFINITIONS.stapler.restitution,
		);
		expect(PROJECTILE_DEFINITIONS.stapler.restitution).toBeGreaterThan(0);
	});
});
