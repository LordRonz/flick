import { describe, expect, it } from "vitest";
import {
	colorForPlayerNumber,
	findFirstFreePlayerNumber,
} from "./player-slots";

describe("player slots", () => {
	it("assigns the first free slot and its stable color", () => {
		expect(findFirstFreePlayerNumber(new Set([1, 2]))).toBe(3);
		expect(colorForPlayerNumber(3)).toBe("green");
	});

	it("rejects a fifth player when all slots are occupied", () => {
		expect(findFirstFreePlayerNumber(new Set([1, 2, 3, 4]))).toBeNull();
	});
});
