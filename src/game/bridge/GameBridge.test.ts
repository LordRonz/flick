import { describe, expect, it } from "vitest";
import { GameBridge } from "./GameBridge";

describe("GameBridge", () => {
	it("queues network commands until Phaser is ready", () => {
		const bridge = new GameBridge();
		bridge.send({ type: "start-match" });
		const commands: string[] = [];
		bridge.onCommand((command) => commands.push(command.type));
		expect(commands).toEqual(["start-match"]);
	});

	it("removes game event listeners cleanly", () => {
		const bridge = new GameBridge();
		const events: string[] = [];
		const remove = bridge.onEvent((event) => events.push(event.type));
		remove();
		bridge.emit({ type: "game-ready" });
		expect(events).toEqual([]);
	});
});
