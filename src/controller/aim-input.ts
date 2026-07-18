import { clamp } from "../game/systems/math";
import type { AimInputMessage } from "../realtime/protocol";

export const AIM_SEND_INTERVAL_MS = 66;
export const AIM_CHANGE_THRESHOLD = 0.02;
export const AIM_MAX_SILENCE_MS = 250;
export const AIM_TRACK_MIN_PERCENT = 10;
export const AIM_TRACK_MAX_PERCENT = 90;

export type AimSendState = {
	lastSentValue: number;
	lastSentAt: number;
};

export function pointerXToNormalizedAim(
	clientX: number,
	left: number,
	width: number,
) {
	if (!Number.isFinite(width) || width <= 0) return 0;
	const trackLeft = left + width * (AIM_TRACK_MIN_PERCENT / 100);
	const trackWidth =
		width * ((AIM_TRACK_MAX_PERCENT - AIM_TRACK_MIN_PERCENT) / 100);
	return clamp(((clientX - trackLeft) / trackWidth) * 2 - 1, -1, 1);
}

export function normalizedAimToTrackPercent(normalizedAim: number) {
	const normalized = normalizeAim(normalizedAim);
	return (
		AIM_TRACK_MIN_PERCENT +
		((normalized + 1) / 2) * (AIM_TRACK_MAX_PERCENT - AIM_TRACK_MIN_PERCENT)
	);
}

export function nextAimMessage(
	normalizedAim: number,
	timestamp: number,
	state: AimSendState,
	force = false,
) {
	const value = normalizeAim(normalizedAim);
	const elapsed = timestamp - state.lastSentAt;
	const changed = Math.abs(value - state.lastSentValue);
	const due = elapsed >= AIM_SEND_INTERVAL_MS;
	const silentTooLong = elapsed >= AIM_MAX_SILENCE_MS;
	if (!force && (!due || (!silentTooLong && changed < AIM_CHANGE_THRESHOLD)))
		return null;
	return {
		message: {
			type: "aim",
			normalizedAim: value,
			timestamp,
		} satisfies AimInputMessage,
		state: { lastSentValue: value, lastSentAt: timestamp },
	};
}

function normalizeAim(value: number) {
	return clamp(Number.isFinite(value) ? value : 0, -1, 1);
}
