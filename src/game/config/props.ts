import type { PropType } from "../types";

export type PropCollisionShape = "rectangle" | "circle";

export type PropDefinition = {
	textureKey: string;
	width: number;
	height: number;
	maxHealth: number;
	scoreValue: number;
	collisionShape: PropCollisionShape;
	isStatic: boolean;
};

export const PROP_DEFINITIONS: Record<PropType, PropDefinition> = {
	monitor: {
		textureKey: "prop-monitor",
		width: 74,
		height: 58,
		maxHealth: 2,
		scoreValue: 75,
		collisionShape: "rectangle",
		isStatic: true,
	},
	printer: {
		textureKey: "prop-printer",
		width: 90,
		height: 58,
		maxHealth: 3,
		scoreValue: 100,
		collisionShape: "rectangle",
		isStatic: true,
	},
	plant: {
		textureKey: "prop-plant",
		width: 54,
		height: 78,
		maxHealth: 2,
		scoreValue: 80,
		collisionShape: "rectangle",
		isStatic: true,
	},
	"water-cooler": {
		textureKey: "prop-water-cooler",
		width: 52,
		height: 96,
		maxHealth: 3,
		scoreValue: 125,
		collisionShape: "circle",
		isStatic: true,
	},
	"document-stack": {
		textureKey: "prop-document-stack",
		width: 68,
		height: 34,
		maxHealth: 1,
		scoreValue: 50,
		collisionShape: "rectangle",
		isStatic: true,
	},
};

export const PROP_LAYOUT: Array<{ type: PropType; x: number; y: number }> = [
	{ type: "monitor", x: 330, y: 484 },
	{ type: "printer", x: 640, y: 566 },
	{ type: "plant", x: 956, y: 486 },
	{ type: "water-cooler", x: 1082, y: 256 },
	{ type: "document-stack", x: 552, y: 296 },
];
