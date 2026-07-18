import { describe, expect, it } from "vitest";
import {
	AIM_SEND_INTERVAL_MS,
	nextAimMessage,
	normalizedAimToTrackPercent,
	pointerXToNormalizedAim,
} from "./aim-input";

describe("controller aim input", () => {
	it("maps the inset visual track to the normalized range", () => {
		expect(pointerXToNormalizedAim(140, 100, 400)).toBe(-1);
		expect(pointerXToNormalizedAim(300, 100, 400)).toBe(0);
		expect(pointerXToNormalizedAim(460, 100, 400)).toBe(1);
	});

	it("clamps pointers outside the visual track", () => {
		expect(pointerXToNormalizedAim(100, 100, 400)).toBe(-1);
		expect(pointerXToNormalizedAim(500, 100, 400)).toBe(1);
		expect(pointerXToNormalizedAim(-20, 100, 400)).toBe(-1);
		expect(pointerXToNormalizedAim(700, 100, 400)).toBe(1);
	});

	it("keeps the handle centered on the inset visual track", () => {
		expect(normalizedAimToTrackPercent(-1)).toBe(10);
		expect(normalizedAimToTrackPercent(0)).toBe(50);
		expect(normalizedAimToTrackPercent(1)).toBe(90);
		expect(normalizedAimToTrackPercent(Number.NaN)).toBe(50);
	});

	it("throttles small changes but sends meaningful changes", () => {
		const state = { lastSentValue: 0, lastSentAt: 1000 };
		expect(nextAimMessage(0.01, 1000 + AIM_SEND_INTERVAL_MS, state)).toBeNull();
		const result = nextAimMessage(0.1, 1000 + AIM_SEND_INTERVAL_MS, state);
		expect(result?.message.normalizedAim).toBe(0.1);
	});

	it("always sends the final value when the drag ends", () => {
		const result = nextAimMessage(
			0.01,
			1000,
			{ lastSentValue: 0, lastSentAt: 1000 },
			true,
		);
		expect(result?.message.type).toBe("aim");
	});
});
