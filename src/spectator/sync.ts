import type {
	SpectatorPlayerState,
	SpectatorPresentationEvent,
	SpectatorProjectileState,
	SpectatorSnapshot,
} from "../realtime/protocol";

export const SPECTATOR_INTERPOLATION_DELAY_MS = 100;
const LARGE_POSITION_ERROR = 320;

export function interpolateNumber(from: number, to: number, amount: number) {
	return from + (to - from) * clamp01(amount);
}

export function interpolateRotation(from: number, to: number, amount: number) {
	const fullTurn = Math.PI * 2;
	const delta = ((((to - from) % fullTurn) + Math.PI * 3) % fullTurn) - Math.PI;
	return from + delta * clamp01(amount);
}

export function correctTimer(
	displayedMs: number,
	authoritativeMs: number,
	elapsedSinceSnapshotMs: number,
) {
	const target = Math.max(0, authoritativeMs - elapsedSinceSnapshotMs);
	if (!Number.isFinite(displayedMs) || Math.abs(target - displayedMs) > 1_000)
		return target;
	return interpolateNumber(displayedMs, target, 0.2);
}

export class SnapshotBuffer {
	private snapshots: SpectatorSnapshot[] = [];
	private sequence = -1;
	private clockOffsetMs: number | null = null;

	get size() {
		return this.snapshots.length;
	}

	get latestSequence() {
		return this.sequence;
	}

	push(snapshot: SpectatorSnapshot, receivedAt = Date.now()) {
		if (snapshot.sequence <= this.sequence) return false;
		// Host and spectator wall clocks are not synchronized; track the
		// host-time-minus-local-time offset so sampling works under skew.
		const offset = snapshot.hostTimestamp - receivedAt;
		this.clockOffsetMs =
			this.clockOffsetMs === null
				? offset
				: this.clockOffsetMs + (offset - this.clockOffsetMs) * 0.15;
		this.sequence = snapshot.sequence;
		this.snapshots.push(snapshot);
		if (this.snapshots.length > 12) this.snapshots.shift();
		return true;
	}

	clear() {
		this.snapshots = [];
		this.sequence = -1;
		this.clockOffsetMs = null;
	}

	sampleLocal(localNow: number, delayMs: number) {
		return this.sample(localNow + (this.clockOffsetMs ?? 0) - delayMs);
	}

	sample(renderTimestamp: number) {
		if (this.snapshots.length === 0) return null;
		const newest = this.snapshots.at(-1);
		if (!newest) return null;
		const newerIndex = this.snapshots.findIndex(
			(snapshot) => snapshot.hostTimestamp >= renderTimestamp,
		);
		if (newerIndex === -1) return newest;
		if (newerIndex === 0) return this.snapshots[0] ?? newest;
		const older = this.snapshots[newerIndex - 1];
		const newer = this.snapshots[newerIndex];
		if (!older || !newer) return newest;
		const duration = newer.hostTimestamp - older.hostTimestamp;
		const amount =
			duration <= 0 ? 1 : (renderTimestamp - older.hostTimestamp) / duration;
		return interpolateSnapshot(older, newer, amount);
	}
}

export class PresentationEventDeduplicator {
	private readonly seen = new Set<string>();
	private readonly order: string[] = [];

	constructor(private readonly capacity = 256) {}

	accept(event: SpectatorPresentationEvent) {
		if (this.seen.has(event.eventId)) return false;
		this.seen.add(event.eventId);
		this.order.push(event.eventId);
		while (this.order.length > this.capacity) {
			const oldest = this.order.shift();
			if (oldest) this.seen.delete(oldest);
		}
		return true;
	}

	clear() {
		this.seen.clear();
		this.order.length = 0;
	}
}

export class SpectatorResyncState {
	readonly buffer = new SnapshotBuffer();
	needsSync = true;

	connected() {
		this.buffer.clear();
		this.needsSync = true;
	}

	receivedSnapshot(snapshot: SpectatorSnapshot) {
		if (!this.buffer.push(snapshot)) return false;
		this.needsSync = false;
		return true;
	}
}

function interpolateSnapshot(
	older: SpectatorSnapshot,
	newer: SpectatorSnapshot,
	amount: number,
): SpectatorSnapshot {
	return {
		...newer,
		hostTimestamp: interpolateNumber(
			older.hostTimestamp,
			newer.hostTimestamp,
			amount,
		),
		timeRemainingMs: interpolateNumber(
			older.timeRemainingMs,
			newer.timeRemainingMs,
			amount,
		),
		players: interpolateEntities(
			older.players,
			newer.players,
			"playerId",
			amount,
			interpolatePlayer,
		),
		projectiles: interpolateEntities(
			older.projectiles,
			newer.projectiles,
			"projectileId",
			amount,
			interpolateProjectile,
		),
		props: newer.props.map((next) => {
			const previous = older.props.find((prop) => prop.propId === next.propId);
			if (!previous) return next;
			return {
				...next,
				x: interpolatePosition(previous.x, next.x, amount),
				y: interpolatePosition(previous.y, next.y, amount),
				rotation: interpolateRotation(previous.rotation, next.rotation, amount),
			};
		}),
	};
}

function interpolatePlayer(
	previous: SpectatorPlayerState,
	next: SpectatorPlayerState,
	amount: number,
) {
	return {
		...next,
		x: interpolatePosition(previous.x, next.x, amount),
		y: interpolatePosition(previous.y, next.y, amount),
		rotation: interpolateRotation(previous.rotation, next.rotation, amount),
		aimAngle: interpolateRotation(previous.aimAngle, next.aimAngle, amount),
		cooldownRemainingMs: interpolateNumber(
			previous.cooldownRemainingMs,
			next.cooldownRemainingMs,
			amount,
		),
	};
}

function interpolateProjectile(
	previous: SpectatorProjectileState,
	next: SpectatorProjectileState,
	amount: number,
) {
	return {
		...next,
		x: interpolatePosition(previous.x, next.x, amount),
		y: interpolatePosition(previous.y, next.y, amount),
		rotation: interpolateRotation(previous.rotation, next.rotation, amount),
		velocityX: interpolateNumber(previous.velocityX, next.velocityX, amount),
		velocityY: interpolateNumber(previous.velocityY, next.velocityY, amount),
	};
}

function interpolateEntities<T extends Record<K, string>, K extends keyof T>(
	older: T[],
	newer: T[],
	key: K,
	amount: number,
	interpolate: (previous: T, next: T, amount: number) => T,
) {
	return newer.map((next) => {
		const previous = older.find((candidate) => candidate[key] === next[key]);
		return previous ? interpolate(previous, next, amount) : next;
	});
}

function interpolatePosition(from: number, to: number, amount: number) {
	return Math.abs(to - from) > LARGE_POSITION_ERROR
		? to
		: interpolateNumber(from, to, amount);
}

function clamp01(value: number) {
	return Math.max(0, Math.min(1, value));
}
