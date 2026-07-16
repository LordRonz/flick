import Phaser from "phaser";

export class PreloadScene extends Phaser.Scene {
	constructor() {
		super({ key: "PreloadScene" });
	}

	create() {
		this.scene.start("ArenaScene");
	}
}
