import Phaser from "phaser";

const PLAYER_TEXTURES = {
	blue: 0x44d8e4,
	red: 0xff665a,
	green: 0x74e6b2,
	yellow: 0xffd166,
} as const;

export class BootScene extends Phaser.Scene {
	constructor() {
		super({ key: "BootScene" });
	}

	create() {
		createTexture(this, "particle", 10, 10, (graphics) => {
			graphics.fillStyle(0xffffff, 1);
			graphics.fillCircle(5, 5, 5);
		});
		createTexture(this, "projectile-paper-ball", 24, 24, (graphics) => {
			graphics.fillStyle(0xfff0d5, 1);
			graphics.fillCircle(12, 12, 10);
			graphics.lineStyle(2, 0xd6a97a, 1);
			graphics.strokeCircle(12, 12, 8);
		});
		createTexture(this, "projectile-coffee-mug", 34, 34, (graphics) => {
			graphics.fillStyle(0xffad73, 1);
			graphics.fillRect(4, 7, 21, 20);
			graphics.lineStyle(4, 0xffd7ae, 1);
			graphics.strokeCircle(26, 17, 7);
			graphics.fillStyle(0x5b342d, 1);
			graphics.fillRect(7, 10, 15, 4);
		});
		createTexture(this, "projectile-stapler", 42, 26, (graphics) => {
			graphics.fillStyle(0x9ca8b2, 1);
			graphics.fillRect(4, 6, 30, 9);
			graphics.fillStyle(0x53616b, 1);
			graphics.fillRect(8, 15, 25, 6);
			graphics.fillStyle(0xe9f3f2, 1);
			graphics.fillRect(29, 8, 6, 5);
		});

		for (const [color, tint] of Object.entries(PLAYER_TEXTURES)) {
			createTexture(this, `player-${color}`, 74, 86, (graphics) => {
				graphics.fillStyle(tint, 1);
				graphics.fillCircle(37, 25, 20);
				graphics.fillRoundedRect(12, 42, 50, 36, 10);
				graphics.fillStyle(0x081016, 1);
				graphics.fillCircle(30, 23, 3);
				graphics.fillCircle(44, 23, 3);
				graphics.fillStyle(0xffffff, 0.8);
				graphics.fillRect(30, 31, 14, 3);
			});
		}

		createTexture(this, "prop-monitor", 86, 70, (graphics) => {
			graphics.fillStyle(0x30404d, 1);
			graphics.fillRoundedRect(5, 5, 76, 48, 5);
			graphics.fillStyle(0x79dbe2, 0.8);
			graphics.fillRect(12, 12, 62, 34);
			graphics.fillStyle(0x60727d, 1);
			graphics.fillRect(38, 53, 10, 10);
			graphics.fillRect(27, 63, 32, 4);
		});
		createTexture(this, "prop-printer", 100, 68, (graphics) => {
			graphics.fillStyle(0xd7e4e2, 1);
			graphics.fillRoundedRect(6, 18, 88, 42, 6);
			graphics.fillStyle(0x64767e, 1);
			graphics.fillRect(17, 27, 66, 17);
			graphics.fillStyle(0xffffff, 1);
			graphics.fillRect(25, 5, 50, 25);
		});
		createTexture(this, "prop-plant", 62, 88, (graphics) => {
			graphics.fillStyle(0x73d18c, 1);
			graphics.fillCircle(23, 26, 14);
			graphics.fillCircle(40, 22, 14);
			graphics.fillCircle(32, 13, 12);
			graphics.fillStyle(0xc77d4e, 1);
			graphics.fillRoundedRect(16, 46, 31, 31, 6);
		});
		createTexture(this, "prop-water-cooler", 60, 104, (graphics) => {
			graphics.fillStyle(0x9ddfe7, 0.9);
			graphics.fillRoundedRect(15, 5, 30, 46, 12);
			graphics.fillStyle(0xd8f5f2, 1);
			graphics.fillRect(18, 15, 24, 26);
			graphics.fillStyle(0x617984, 1);
			graphics.fillRect(21, 51, 18, 43);
			graphics.fillRect(8, 93, 44, 6);
		});
		createTexture(this, "prop-document-stack", 76, 42, (graphics) => {
			graphics.fillStyle(0xf2f2df, 1);
			graphics.fillRect(7, 12, 62, 23);
			graphics.lineStyle(2, 0xb9c7bd, 1);
			graphics.strokeRect(7, 12, 62, 23);
			graphics.fillStyle(0xffffff, 1);
			graphics.fillRect(13, 5, 52, 19);
		});

		this.scene.start("PreloadScene");
	}
}

function createTexture(
	scene: Phaser.Scene,
	key: string,
	width: number,
	height: number,
	draw: (graphics: Phaser.GameObjects.Graphics) => void,
) {
	if (scene.textures.exists(key)) return;
	const graphics = scene.make.graphics({ x: 0, y: 0 });
	draw(graphics);
	graphics.generateTexture(key, width, height);
	graphics.destroy();
}
