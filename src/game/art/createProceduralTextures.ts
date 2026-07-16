import type Phaser from "phaser";
import { ARCADE_COLORS, PLAYER_HEX } from "./tokens";

type DrawTexture = (graphics: Phaser.GameObjects.Graphics) => void;

export function createProceduralTextures(scene: Phaser.Scene) {
	createTexture(scene, "fx-dot", 12, 12, (g) => {
		g.fillStyle(ARCADE_COLORS.white).fillCircle(6, 6, 5);
	});
	createTexture(scene, "fx-paper", 16, 8, (g) => {
		g.fillStyle(ARCADE_COLORS.white).fillRoundedRect(1, 1, 14, 6, 2);
		g.lineStyle(1, 0x9bb8c9).strokeRoundedRect(1, 1, 14, 6, 2);
	});
	createTexture(scene, "fx-ceramic", 12, 13, (g) => {
		g.fillStyle(0xffd6be).fillTriangle(1, 1, 11, 4, 4, 12);
		g.lineStyle(2, ARCADE_COLORS.ink).strokeTriangle(1, 1, 11, 4, 4, 12);
	});
	createTexture(scene, "fx-coffee", 10, 14, (g) => {
		g.fillStyle(ARCADE_COLORS.coffee).fillEllipse(5, 8, 9, 11);
		g.fillStyle(0xc7895a).fillCircle(3, 5, 2);
	});
	createTexture(scene, "fx-spark", 14, 14, (g) => {
		g.fillStyle(ARCADE_COLORS.gold).fillTriangle(7, 0, 10, 6, 14, 7);
		g.fillTriangle(14, 7, 8, 10, 7, 14).fillTriangle(7, 14, 4, 8, 0, 7);
		g.fillTriangle(0, 7, 6, 4, 7, 0);
	});
	createTexture(scene, "fx-water", 10, 14, (g) => {
		g.fillStyle(0x4dbbe8).fillTriangle(5, 0, 10, 8, 5, 14);
		g.fillTriangle(5, 0, 5, 14, 0, 8);
	});
	createTexture(scene, "fx-leaf", 15, 10, (g) => {
		g.fillStyle(0x45b85d).fillEllipse(7, 5, 14, 8);
		g.lineStyle(1, 0x17713a).lineBetween(2, 7, 12, 3);
	});

	createTexture(scene, "projectile-paper-ball", 34, 34, (g) => {
		g.fillStyle(ARCADE_COLORS.ink, 0.18).fillCircle(18, 19, 14);
		g.fillStyle(ARCADE_COLORS.white).fillCircle(16, 15, 13);
		g.lineStyle(3, ARCADE_COLORS.ink).strokeCircle(16, 15, 13);
		g.lineStyle(2, 0x9fb8c6)
			.beginPath()
			.moveTo(7, 13)
			.lineTo(14, 9)
			.lineTo(22, 13)
			.strokePath();
		g.beginPath().moveTo(9, 20).lineTo(15, 16).lineTo(23, 21).strokePath();
	});
	createTexture(scene, "projectile-coffee-mug", 46, 42, (g) => {
		g.fillStyle(ARCADE_COLORS.ink, 0.2).fillRoundedRect(6, 9, 30, 28, 7);
		g.fillStyle(0xff8f70).fillRoundedRect(4, 5, 30, 28, 7);
		g.lineStyle(3, ARCADE_COLORS.ink).strokeRoundedRect(4, 5, 30, 28, 7);
		g.lineStyle(5, ARCADE_COLORS.ink).strokeCircle(35, 18, 9);
		g.lineStyle(3, 0xffc1a8).strokeCircle(35, 18, 9);
		g.fillStyle(ARCADE_COLORS.coffee).fillEllipse(19, 9, 22, 6);
		g.fillStyle(0xffffff, 0.45).fillRoundedRect(9, 11, 5, 13, 2);
	});
	createTexture(scene, "projectile-stapler", 54, 34, (g) => {
		g.fillStyle(ARCADE_COLORS.ink, 0.2).fillRoundedRect(5, 13, 47, 17, 6);
		g.fillStyle(0x5f6d86).fillRoundedRect(4, 14, 46, 14, 5);
		g.lineStyle(3, ARCADE_COLORS.ink).strokeRoundedRect(4, 14, 46, 14, 5);
		g.fillStyle(0x2f3a50).fillRoundedRect(5, 3, 43, 14, 6);
		g.lineStyle(3, ARCADE_COLORS.ink).strokeRoundedRect(5, 3, 43, 14, 6);
		g.fillStyle(0xcbd5e1).fillRect(40, 8, 7, 5);
		g.fillStyle(0xffffff, 0.35).fillRoundedRect(10, 6, 22, 3, 1);
	});

	for (const [color, tint] of Object.entries(PLAYER_HEX)) {
		createTexture(scene, `player-${color}`, 92, 104, (g) => {
			g.fillStyle(ARCADE_COLORS.ink, 0.18).fillEllipse(48, 96, 58, 11);
			g.fillStyle(tint).fillRoundedRect(14, 38, 64, 56, 18);
			g.lineStyle(5, ARCADE_COLORS.ink).strokeRoundedRect(14, 38, 64, 56, 18);
			g.fillStyle(tint).fillCircle(46, 30, 25);
			g.lineStyle(5, ARCADE_COLORS.ink).strokeCircle(46, 30, 25);
			g.fillStyle(0xffefd6).fillCircle(46, 31, 18);
			g.fillStyle(ARCADE_COLORS.ink)
				.fillCircle(39, 29, 3)
				.fillCircle(53, 29, 3);
			g.lineStyle(2, ARCADE_COLORS.ink)
				.beginPath()
				.arc(46, 34, 8, 0.2, 2.9)
				.strokePath();
			g.fillStyle(ARCADE_COLORS.white).fillTriangle(34, 46, 46, 61, 58, 46);
			g.fillStyle(ARCADE_COLORS.warning).fillTriangle(43, 52, 49, 52, 46, 69);
			g.fillStyle(ARCADE_COLORS.ink)
				.fillRoundedRect(5, 55, 16, 11, 5)
				.fillRoundedRect(71, 55, 16, 11, 5);
			g.fillStyle(0xffffff, 0.3).fillRoundedRect(22, 44, 8, 28, 4);
		});
	}

	createPropTextures(scene, "prop-monitor", 94, 78, drawMonitor);
	createPropTextures(scene, "prop-printer", 110, 78, drawPrinter);
	createPropTextures(scene, "prop-plant", 76, 104, drawPlant);
	createPropTextures(scene, "prop-water-cooler", 74, 122, drawWaterCooler);
	createPropTextures(scene, "prop-document-stack", 88, 52, drawDocuments);
}

function createPropTextures(
	scene: Phaser.Scene,
	key: string,
	width: number,
	height: number,
	draw: DrawTexture,
) {
	createTexture(scene, key, width, height, (g) => draw(g));
	createTexture(scene, `${key}-damaged`, width, height, (g) => {
		draw(g);
		g.lineStyle(4, ARCADE_COLORS.warning)
			.beginPath()
			.moveTo(width * 0.32, height * 0.17)
			.lineTo(width * 0.46, height * 0.4)
			.lineTo(width * 0.38, height * 0.58)
			.lineTo(width * 0.57, height * 0.78)
			.strokePath();
	});
	createTexture(scene, `${key}-broken`, width, height, (g) => {
		draw(g);
		g.fillStyle(ARCADE_COLORS.ink, 0.5).fillRect(
			0,
			height * 0.58,
			width,
			height * 0.42,
		);
		g.lineStyle(5, ARCADE_COLORS.ink)
			.beginPath()
			.moveTo(5, height * 0.52)
			.lineTo(width * 0.35, height * 0.69)
			.lineTo(width * 0.6, height * 0.55)
			.lineTo(width - 5, height * 0.76)
			.strokePath();
	});
}

function drawMonitor(g: Phaser.GameObjects.Graphics) {
	g.fillStyle(ARCADE_COLORS.ink).fillRoundedRect(4, 4, 86, 55, 8);
	g.fillStyle(0x4cc9f0).fillRoundedRect(10, 10, 74, 43, 4);
	g.fillStyle(0xffffff, 0.38).fillTriangle(14, 12, 45, 12, 14, 34);
	g.fillStyle(ARCADE_COLORS.inkSoft)
		.fillRect(41, 59, 12, 10)
		.fillRoundedRect(27, 68, 40, 7, 3);
}

function drawPrinter(g: Phaser.GameObjects.Graphics) {
	g.fillStyle(ARCADE_COLORS.ink).fillRoundedRect(4, 20, 102, 52, 10);
	g.fillStyle(0xe7edf3).fillRoundedRect(8, 16, 94, 51, 8);
	g.fillStyle(0x728099).fillRoundedRect(17, 30, 76, 23, 5);
	g.fillStyle(ARCADE_COLORS.white).fillRect(26, 2, 58, 31);
	g.fillStyle(ARCADE_COLORS.warning).fillCircle(90, 27, 4);
	g.lineStyle(2, 0x9aacbd)
		.lineBetween(34, 10, 76, 10)
		.lineBetween(34, 17, 69, 17);
}

function drawPlant(g: Phaser.GameObjects.Graphics) {
	g.fillStyle(0x17713a).fillRoundedRect(34, 39, 8, 31, 4);
	g.fillStyle(0x35b85b)
		.fillEllipse(22, 35, 35, 22)
		.fillEllipse(54, 30, 35, 24)
		.fillEllipse(37, 17, 36, 28);
	g.lineStyle(3, ARCADE_COLORS.ink)
		.strokeEllipse(22, 35, 35, 22)
		.strokeEllipse(54, 30, 35, 24)
		.strokeEllipse(37, 17, 36, 28);
	g.fillStyle(0xe77b45).fillRoundedRect(17, 62, 42, 36, 8);
	g.lineStyle(4, ARCADE_COLORS.ink).strokeRoundedRect(17, 62, 42, 36, 8);
}

function drawWaterCooler(g: Phaser.GameObjects.Graphics) {
	g.fillStyle(0x93ddf4, 0.9).fillRoundedRect(18, 3, 38, 55, 16);
	g.lineStyle(4, ARCADE_COLORS.ink).strokeRoundedRect(18, 3, 38, 55, 16);
	g.fillStyle(0xdaf6ff, 0.65).fillRoundedRect(25, 10, 12, 31, 5);
	g.fillStyle(0xd9e1ea).fillRoundedRect(14, 54, 46, 61, 7);
	g.lineStyle(4, ARCADE_COLORS.ink).strokeRoundedRect(14, 54, 46, 61, 7);
	g.fillStyle(0x4cc9f0).fillRect(24, 67, 7, 12);
	g.fillStyle(ARCADE_COLORS.warning).fillRect(43, 67, 7, 12);
	g.fillStyle(0x718096).fillRoundedRect(24, 88, 27, 17, 4);
}

function drawDocuments(g: Phaser.GameObjects.Graphics) {
	const colors = [0xfff6d6, 0xdff6ff, 0xffe0e0];
	for (let index = 0; index < 3; index += 1) {
		g.fillStyle(colors[index] ?? ARCADE_COLORS.white).fillRoundedRect(
			5 + index * 4,
			28 - index * 11,
			76,
			19,
			3,
		);
		g.lineStyle(3, ARCADE_COLORS.ink).strokeRoundedRect(
			5 + index * 4,
			28 - index * 11,
			76,
			19,
			3,
		);
	}
}

function createTexture(
	scene: Phaser.Scene,
	key: string,
	width: number,
	height: number,
	draw: DrawTexture,
) {
	if (scene.textures.exists(key)) return;
	const graphics = scene.make.graphics({ x: 0, y: 0 });
	draw(graphics);
	graphics.generateTexture(key, width, height);
	graphics.destroy();
}
