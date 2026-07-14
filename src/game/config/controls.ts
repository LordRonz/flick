export const FLICK_SOURCES = ["motion", "button"] as const;

export type FlickSource = (typeof FLICK_SOURCES)[number];

export const THROW_COOLDOWN_MS = 650;
