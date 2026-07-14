import Phaser from "phaser";

export class PreloadScene extends Phaser.Scene {
	constructor() {
		super({ key: "PreloadScene" });
	}

	create() {
		const { width, height } = this.scale;
		const label = this.add
			.text(width / 2, height / 2, "LOADING OFFICE ARENA", {
				color: "#74e6b2",
				fontFamily: "DM Mono, monospace",
				fontSize: "18px",
				letterSpacing: 4,
			})
			.setOrigin(0.5);
		this.tweens.add({
			targets: label,
			alpha: 0.2,
			duration: 500,
			yoyo: true,
			repeat: 1,
		});
		this.time.delayedCall(700, () => this.scene.start("ArenaScene"));
	}
}
