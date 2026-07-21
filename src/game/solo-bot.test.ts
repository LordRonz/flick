import { describe, expect, it } from "vitest";
import {
	createSoloBot,
	createSoloBotMove,
	isSoloBot,
	playerLabel,
	SOLO_BOT_ID,
	shouldRemoveSoloBot,
} from "./solo-bot";

describe("solo bot", () => {
	it("fills a free station for exactly one human player", () => {
		const bot = createSoloBot([
			{
				playerId: "00000000-0000-4000-8000-000000000001",
				playerNumber: 1,
				color: "blue",
			},
		]);

		expect(bot).toEqual({
			playerId: SOLO_BOT_ID,
			playerNumber: 4,
			color: "yellow",
			ready: true,
			motionEnabled: false,
			connected: true,
		});
		expect(isSoloBot(bot?.playerId ?? "")).toBe(true);
		expect(playerLabel(bot ?? { playerId: "", playerNumber: 4 })).toBe("BOT");
		expect(
			playerLabel({
				playerId: "00000000-0000-4000-8000-000000000001",
				playerNumber: 1,
			}),
		).toBe("P1");
	});

	it("does not create a bot without exactly one human", () => {
		expect(createSoloBot([])).toBeNull();
		expect(
			createSoloBot([
				{
					playerId: "00000000-0000-4000-8000-000000000001",
					playerNumber: 1,
					color: "blue",
				},
				{
					playerId: "00000000-0000-4000-8000-000000000002",
					playerNumber: 2,
					color: "red",
				},
			]),
		).toBeNull();
	});

	it("keeps the bot through a solo controller reconnect", () => {
		const bot = {
			playerId: SOLO_BOT_ID,
			playerNumber: 4 as const,
			color: "yellow" as const,
		};
		expect(shouldRemoveSoloBot(bot, [])).toBe(false);
		expect(
			shouldRemoveSoloBot(bot, [
				{
					playerId: "00000000-0000-4000-8000-000000000001",
					playerNumber: 1,
					color: "blue",
				},
			]),
		).toBe(false);
		expect(
			shouldRemoveSoloBot(bot, [
				{
					playerId: "00000000-0000-4000-8000-000000000001",
					playerNumber: 1,
					color: "blue",
				},
				{
					playerId: "00000000-0000-4000-8000-000000000002",
					playerNumber: 2,
					color: "red",
				},
			]),
		).toBe(true);
	});

	it("produces bounded, varied input from a deterministic random source", () => {
		const samples = [0, 0.5, 1];
		const move = createSoloBotMove(() => samples.shift() ?? 0.5);

		expect(move).toEqual({
			normalizedAim: -0.5,
			intensity: 0.74,
			delayMs: 1500,
		});
	});
});
