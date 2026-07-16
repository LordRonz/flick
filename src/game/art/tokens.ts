export const ARCADE_COLORS = {
	ink: 0x172033,
	inkSoft: 0x2d3850,
	sky: 0x8bd7ff,
	skyLight: 0xdff6ff,
	wall: 0xf4ead8,
	wallShade: 0xd9cbb6,
	floor: 0x5b6d8c,
	floorDark: 0x35435f,
	white: 0xfffbef,
	coffee: 0x7a4b38,
	warning: 0xff6b5f,
	success: 0x37d67a,
	gold: 0xffca3a,
	blue: 0x3b82f6,
	red: 0xef4444,
	green: 0x22c55e,
	yellow: 0xfacc15,
} as const;

export const PLAYER_HEX = {
	blue: ARCADE_COLORS.blue,
	red: ARCADE_COLORS.red,
	green: ARCADE_COLORS.green,
	yellow: ARCADE_COLORS.yellow,
} as const;

export const ARCADE_MOTION = {
	fast: 90,
	feedback: 160,
	standard: 220,
	celebration: 520,
} as const;

export const EFFECT_LIMITS = {
	transients: 150,
	trailIntervalMs: 38,
	debrisPerImpact: 18,
} as const;
