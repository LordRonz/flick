import type { PropType } from "../types";

export type PropCollisionShape = "rectangle" | "circle";

export type PropDefinition = {
	textureKey: string;
	width: number;
	height: number;
	renderWidth: number;
	renderHeight: number;
	maxHealth: number;
	scoreValue: number;
	collisionShape: PropCollisionShape;
	isStatic: boolean;
	mass?: number;
	restitution?: number;
	friction?: number;
	frictionAir?: number;
};

export const PROP_DEFINITIONS: Record<PropType, PropDefinition> = {
	monitor: {
		textureKey: "prop-monitor-hd",
		width: 74,
		height: 58,
		renderWidth: 112,
		renderHeight: 76,
		maxHealth: 2,
		scoreValue: 75,
		collisionShape: "rectangle",
		isStatic: true,
	},
	printer: {
		textureKey: "prop-printer-hd",
		width: 90,
		height: 58,
		renderWidth: 120,
		renderHeight: 96,
		maxHealth: 3,
		scoreValue: 100,
		collisionShape: "rectangle",
		isStatic: true,
	},
	plant: {
		textureKey: "prop-plant-hd",
		width: 54,
		height: 78,
		renderWidth: 88,
		renderHeight: 120,
		maxHealth: 2,
		scoreValue: 80,
		collisionShape: "rectangle",
		isStatic: true,
	},
	"water-cooler": {
		textureKey: "prop-water-cooler-hd",
		width: 52,
		height: 96,
		renderWidth: 90,
		renderHeight: 150,
		maxHealth: 3,
		scoreValue: 125,
		collisionShape: "rectangle",
		isStatic: true,
	},
	"document-stack": {
		textureKey: "prop-document-stack-hd",
		width: 68,
		height: 34,
		renderWidth: 104,
		renderHeight: 62,
		maxHealth: 1,
		scoreValue: 50,
		collisionShape: "rectangle",
		isStatic: true,
	},
	"office-chair": {
		textureKey: "prop-office-chair-hd",
		width: 78,
		height: 130,
		renderWidth: 100,
		renderHeight: 146,
		maxHealth: 4,
		scoreValue: 175,
		collisionShape: "rectangle",
		isStatic: false,
		mass: 3.2,
		restitution: 0.42,
		friction: 0.18,
		frictionAir: 0.035,
	},
	"recycling-bin": {
		textureKey: "prop-recycling-bin-hd",
		width: 60,
		height: 82,
		renderWidth: 78,
		renderHeight: 90,
		maxHealth: 2,
		scoreValue: 90,
		collisionShape: "rectangle",
		isStatic: false,
		mass: 1.1,
		restitution: 0.55,
		friction: 0.08,
		frictionAir: 0.018,
	},
};

export const PROP_LAYOUT: Array<{ type: PropType; x: number; y: number }> = [
	{ type: "monitor", x: 330, y: 382 },
	{ type: "printer", x: 850, y: 372 },
	{ type: "plant", x: 1040, y: 360 },
	{ type: "document-stack", x: 640, y: 301 },
	{ type: "office-chair", x: 585, y: 534 },
	{ type: "recycling-bin", x: 750, y: 562 },
];
