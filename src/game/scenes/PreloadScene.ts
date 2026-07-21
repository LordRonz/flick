import Phaser from "phaser";

export class PreloadScene extends Phaser.Scene {
	constructor() {
		super({ key: "PreloadScene" });
	}

	preload() {
		this.load.image("office-arena", "/assets/game/office-arena-v2.png");
		this.load.image("projectile-bomb", "/assets/game/projectile-bomb.png");
		this.load.image(
			"projectile-superball",
			"/assets/game/projectile-superball.png",
		);
		this.load.image("prop-monitor-hd", "/assets/game/prop-monitor.png");
		this.load.image("prop-printer-hd", "/assets/game/prop-printer.png");
		this.load.image("prop-plant-hd", "/assets/game/prop-plant.png");
		this.load.image(
			"prop-water-cooler-hd",
			"/assets/game/prop-water-cooler.png",
		);
		this.load.image(
			"prop-document-stack-hd",
			"/assets/game/prop-document-stack.png",
		);
		this.load.image(
			"prop-office-chair-hd",
			"/assets/game/prop-office-chair.png",
		);
		this.load.image(
			"prop-recycling-bin-hd",
			"/assets/game/prop-recycling-bin.png",
		);
	}

	create() {
		this.scene.start("ArenaScene");
	}
}
