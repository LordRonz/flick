import Phaser from "phaser";
import { createProceduralTextures } from "../art/createProceduralTextures";

export class BootScene extends Phaser.Scene {
	constructor() {
		super({ key: "BootScene" });
	}

	create() {
		createProceduralTextures(this);
		this.scene.start("PreloadScene");
	}
}
