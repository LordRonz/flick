import { describe, expect, it } from "vitest";
import { createSpectatorUrl } from "./link";

describe("spectator link", () => {
	it("uses current origin and normalized room code", () => {
		expect(createSpectatorUrl("https://flick.example", " abc123 ")).toBe(
			"https://flick.example/watch?room=ABC123",
		);
	});
});
