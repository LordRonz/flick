import Phaser from "phaser";
import type { GameBridge } from "./bridge/GameBridge";
import { GAME_HEIGHT, GAME_WIDTH } from "./config/arena";
import { ArenaScene } from "./scenes/ArenaScene";
import { BootScene } from "./scenes/BootScene";
import { PreloadScene } from "./scenes/PreloadScene";

export function createGameConfig(
	bridge: GameBridge,
	allowSinglePlayer: boolean,
): Phaser.Types.Core.GameConfig {
	return {
		type: Phaser.AUTO,
		width: GAME_WIDTH,
		height: GAME_HEIGHT,
		parent: undefined,
		backgroundColor: "#081016",
		antialias: true,
		render: { antialias: true },
		scale: {
			mode: Phaser.Scale.FIT,
			autoCenter: Phaser.Scale.CENTER_BOTH,
			width: GAME_WIDTH,
			height: GAME_HEIGHT,
		},
		physics: {
			default: "matter",
			matter: {
				enableSleeping: true,
				gravity: { x: 0, y: 0.9 },
			},
		},
		scene: [
			new BootScene(),
			new PreloadScene(),
			new ArenaScene(bridge, allowSinglePlayer),
		],
	};
}
