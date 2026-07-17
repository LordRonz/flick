import Phaser from "phaser";
import type { GameBridge } from "./bridge/GameBridge";
import { createGameConfig } from "./createGameConfig";
import type { GameMode } from "./types";

export type FlickGameOptions = {
	parent: HTMLElement;
	bridge: GameBridge;
	mode?: GameMode;
	allowSinglePlayer?: boolean;
};

export function createFlickGame({
	parent,
	bridge,
	mode = "host",
	allowSinglePlayer = false,
}: FlickGameOptions) {
	const config = createGameConfig(bridge, mode, allowSinglePlayer);
	config.parent = parent;
	return new Phaser.Game(config);
}
