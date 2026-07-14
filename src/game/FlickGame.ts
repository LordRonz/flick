import Phaser from "phaser";
import type { GameBridge } from "./bridge/GameBridge";
import { createGameConfig } from "./createGameConfig";

export type FlickGameOptions = {
	parent: HTMLElement;
	bridge: GameBridge;
	allowSinglePlayer?: boolean;
};

export function createFlickGame({
	parent,
	bridge,
	allowSinglePlayer = false,
}: FlickGameOptions) {
	const config = createGameConfig(bridge, allowSinglePlayer);
	config.parent = parent;
	return new Phaser.Game(config);
}
