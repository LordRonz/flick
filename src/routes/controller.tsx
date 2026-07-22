import { createFileRoute, Link } from "@tanstack/react-router";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { z } from "zod";
import { BrandMark } from "../components/BrandMark";
import "../controller/controller.css";
import {
	type AimSendState,
	nextAimMessage,
	normalizedAimToTrackPercent,
	pointerXToNormalizedAim,
} from "../controller/aim-input";
import {
	detectFlick,
	FLICK_SENSITIVITY_CONFIG,
	type FlickSensitivity,
	forwardAccelerationMagnitude,
	type GravityFilterState,
	INITIAL_GRAVITY_FILTER,
	parseFlickSensitivity,
	removeGravity,
} from "../controller/flick-detector";
import {
	createScreenWakeLock,
	type ScreenWakeLockStatus,
} from "../controller/screen-wake-lock";
import { playUiCue } from "../game/audio/ArcadeAudio";
import { STATIONS } from "../game/config/arena";
import { type FlickSource, THROW_COOLDOWN_MS } from "../game/config/controls";
import { nextProjectileType } from "../game/config/projectiles";
import { playerLabel } from "../game/solo-bot";
import { mapAimAngle } from "../game/systems/aim";
import { clamp } from "../game/systems/math";
import { buildRoundAwards, successfulThrowRate } from "../game/systems/results";
import { hitBonusLabels } from "../game/systems/scoring";
import type {
	LobbyPlayer,
	MatchPhase,
	MatchStanding,
	PlayerAssignment,
	ProjectileType,
} from "../game/types";
import {
	type ControllerMessage,
	HostMessageSchema,
} from "../realtime/protocol";
import {
	createSocketUrl,
	sendSocketMessage,
} from "../realtime/websocket-client";

export const Route = createFileRoute("/controller")({
	validateSearch: z.object({ room: z.string().catch("") }),
	component: ControllerPage,
});

type PermissionState = "Not enabled" | "Enabled" | "Denied" | "Unsupported";
type ThrowSource = FlickSource;
const FLICK_SENSITIVITY_STORAGE_KEY = "flick-sensitivity:v1";

function ControllerPage() {
	const { room } = Route.useSearch();
	const socketRef = useRef<WebSocket | null>(null);
	const sessionIdRef = useRef("");
	const assignmentRef = useRef<PlayerAssignment | null>(null);
	const throwCountRef = useRef(0);
	const motionListenerRef = useRef<((event: DeviceMotionEvent) => void) | null>(
		null,
	);
	const detectorRef = useRef({ lastFlickAt: -Infinity });
	const gravityFilterRef = useRef<GravityFilterState>(INITIAL_GRAVITY_FILTER);
	const aimSurfaceRef = useRef<HTMLDivElement | null>(null);
	const activePointerIdRef = useRef<number | null>(null);
	const aimRef = useRef(0);
	const aimSendStateRef = useRef<AimSendState>({
		lastSentValue: 0,
		lastSentAt: -Infinity,
	});
	const cooldownRef = useRef(0);
	const phaseRef = useRef<MatchPhase>("lobby");
	const sensitivityRef = useRef<FlickSensitivity>("normal");
	const confirmationTimerRef = useRef<number | undefined>(undefined);
	const motionEventCountRef = useRef(0);
	const lastMotionUiAtRef = useRef(0);
	const aimMessageTimesRef = useRef<number[]>([]);

	const [connection, setConnection] = useState("Connecting");
	const [reconnectAttempt, setReconnectAttempt] = useState(0);
	const backoffRef = useRef(0);
	const [permission, setPermission] = useState<PermissionState>("Not enabled");
	const [assignment, setAssignment] = useState<PlayerAssignment | null>(null);
	const [players, setPlayers] = useState<LobbyPlayer[]>([]);
	const [phase, setPhase] = useState<MatchPhase>("lobby");
	const [timeRemainingMs, setTimeRemainingMs] = useState(0);
	const [score, setScore] = useState(0);
	const [roundStandings, setRoundStandings] = useState<MatchStanding[]>([]);
	const [aim, setAim] = useState(0);
	const [isAiming, setIsAiming] = useState(false);
	const [magnitude, setMagnitude] = useState(0);
	const [motionEventCount, setMotionEventCount] = useState(0);
	const [lastFlick, setLastFlick] = useState(0);
	const [lastThrowSource, setLastThrowSource] = useState<ThrowSource | null>(
		null,
	);
	const [aimMessagesPerSecond, setAimMessagesPerSecond] = useState(0);
	const [projectile, setProjectile] = useState<ProjectileType>("paper-ball");
	const [nextProjectile, setNextProjectile] =
		useState<ProjectileType>("paper-ball");
	const [cooldownMs, setCooldownMs] = useState(0);
	const [cooldownEndsAt, setCooldownEndsAt] = useState(0);
	const [confirmation, setConfirmation] = useState("");
	const [ready, setReady] = useState(false);
	const [leaderState, setLeaderState] = useState<{
		playerId: string | null;
		playerNumber: PlayerAssignment["playerNumber"] | null;
		bountyActive: boolean;
	}>({ playerId: null, playerNumber: null, bountyActive: false });
	const [sensitivity, setSensitivity] = useState<FlickSensitivity>("normal");
	const [debugOpen, setDebugOpen] = useState(false);
	const [error, setError] = useState("");
	const [wakeLockStatus, setWakeLockStatus] =
		useState<ScreenWakeLockStatus>("idle");
	const wakeLockRef = useRef<ReturnType<typeof createScreenWakeLock> | null>(
		null,
	);

	phaseRef.current = phase;
	sensitivityRef.current = sensitivity;

	useEffect(() => {
		try {
			const stored = parseFlickSensitivity(
				window.localStorage.getItem(FLICK_SENSITIVITY_STORAGE_KEY),
			);
			sensitivityRef.current = stored;
			setSensitivity(stored);
		} catch {
			// Storage may be unavailable in private browsing. The setting still
			// works for the lifetime of this controller page.
		}
	}, []);

	useEffect(() => {
		if (!error) return;
		playUiCue(/room.+full|full.+room/i.test(error) ? "room-full" : "ui-error");
	}, [error]);

	useEffect(() => {
		if (!cooldownEndsAt) return;
		// Wall-clock based so timer throttling can't stretch the cooldown.
		const interval = window.setInterval(() => {
			const remaining = Math.max(0, cooldownEndsAt - Date.now());
			cooldownRef.current = remaining;
			setCooldownMs(remaining);
			if (remaining <= 0) setCooldownEndsAt(0);
		}, 50);
		return () => window.clearInterval(interval);
	}, [cooldownEndsAt]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: The interval reads stable refs and only follows active drag state.
	useEffect(() => {
		if (!isAiming) return;
		const interval = window.setInterval(() => {
			sendAimValue(aimRef.current);
		}, 66);
		return () => window.clearInterval(interval);
	}, [isAiming]);

	useEffect(() => {
		const controller = createScreenWakeLock(setWakeLockStatus);
		wakeLockRef.current = controller;
		return () => {
			wakeLockRef.current = null;
			void controller.destroy();
		};
	}, []);

	useEffect(() => {
		return () => {
			if (motionListenerRef.current) {
				window.removeEventListener("devicemotion", motionListenerRef.current);
				motionListenerRef.current = null;
			}
		};
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Runs once on mount; the handler and senders use stable refs.
	useEffect(() => {
		// Browsers without a motion permission prompt (Android, older iOS) get
		// physical flick enabled by default. iOS 13+ keeps the button because
		// requestPermission must be called from a user gesture.
		if (!("DeviceMotionEvent" in window)) return;
		if (navigator.maxTouchPoints === 0) return;
		const motion = window.DeviceMotionEvent as typeof DeviceMotionEvent & {
			requestPermission?: () => Promise<string>;
		};
		if (typeof motion.requestPermission === "function") return;
		if (!motionListenerRef.current) {
			motionListenerRef.current = handleMotion;
			window.addEventListener("devicemotion", handleMotion);
		}
		setPermission("Enabled");
		send({ type: "motion-status", enabled: true });
		void wakeLockRef.current?.request();
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Sensor and socket handlers use refs; the lifecycle is keyed by room and reconnect attempt.
	useEffect(() => {
		if (!room) return;
		if (typeof WebSocket === "undefined") {
			setConnection("WebSocket unavailable");
			return;
		}
		let retryTimer: number | undefined;
		const storageKey = `flick-session:${room}`;
		const existingSession = window.localStorage.getItem(storageKey);
		const sessionId =
			existingSession && isUuid(existingSession)
				? existingSession
				: crypto.randomUUID();
		window.localStorage.setItem(storageKey, sessionId);
		sessionIdRef.current = sessionId;

		const socket = new WebSocket(
			createSocketUrl(`/api/rooms/${room}/socket`, {
				role: "controller",
				sessionId,
			}),
		);
		socketRef.current = socket;
		socket.onopen = () => {
			backoffRef.current = 0;
			setConnection("Connected");
			setError("");
			// Motion may have been auto-enabled before the socket opened (or
			// across a reconnect), so replay the current status to the host.
			send({
				type: "motion-status",
				enabled: Boolean(motionListenerRef.current),
			});
		};
		socket.onmessage = (event) => {
			if (typeof event.data !== "string") return;
			let payload: unknown;
			try {
				payload = JSON.parse(event.data);
			} catch {
				return;
			}
			const parsed = HostMessageSchema.safeParse(payload);
			if (!parsed.success) return;
			const message = parsed.data;
			if (message.type === "assignment") {
				assignmentRef.current = message.player;
				throwCountRef.current = 0;
				setNextProjectile(nextProjectileType(0, message.player.playerNumber));
				setAssignment(message.player);
			} else if (message.type === "lobby-state") {
				setPlayers(message.players);
				const current = message.players.find(
					(player) => player.playerId === assignmentRef.current?.playerId,
				);
				if (current) setReady(current.ready);
			} else if (message.type === "match-state") {
				phaseRef.current = message.phase;
				setPhase(message.phase);
				setTimeRemainingMs(message.timeRemainingMs ?? 0);
				if (message.phase !== "results") {
					setRoundStandings([]);
				}
			} else if (message.type === "leader-state") {
				setLeaderState({
					playerId: message.leaderPlayerId,
					playerNumber: message.leaderPlayerNumber,
					bountyActive: message.bountyActive,
				});
			} else if (
				message.type === "flick-accepted" &&
				message.playerId === assignmentRef.current?.playerId
			) {
				if (message.practice) {
					showConfirmation("PRACTICE THROW ACCEPTED");
					vibrate(70);
					return;
				}
				throwCountRef.current += 1;
				startCooldown();
				setProjectile(message.projectileType);
				setNextProjectile(
					nextProjectileType(
						throwCountRef.current,
						assignmentRef.current?.playerNumber ?? 1,
					),
				);
				showConfirmation("THROW ACCEPTED");
				vibrate(50);
			} else if (
				message.type === "score-update" &&
				message.playerId === assignmentRef.current?.playerId
			) {
				setScore(message.score);
			} else if (
				message.type === "hit-confirmed" &&
				message.attackerPlayerId === assignmentRef.current?.playerId
			) {
				const bonuses = hitBonusLabels(message);
				showConfirmation(
					bonuses.length
						? `${bonuses.join(" · ")} · TOTAL +${message.score}`
						: `HIT +${message.score}`,
				);
				vibrate(90);
			} else if (
				message.type === "prop-hit-confirmed" &&
				message.playerId === assignmentRef.current?.playerId
			) {
				showConfirmation(
					`${message.destroyed ? "SMASH" : "PROP HIT"} +${message.score}`,
				);
				vibrate(message.destroyed ? 110 : 55);
			} else if (
				message.type === "player-hit" &&
				message.targetPlayerId === assignmentRef.current?.playerId
			) {
				showConfirmation("YOU GOT BONKED");
				vibrate(80, 80);
			} else if (message.type === "round-result") {
				setRoundStandings(message.standings);
				setPhase("results");
				phaseRef.current = "results";
				vibrate(240);
			} else if (message.type === "error") {
				setError(message.message);
			}
		};
		socket.onclose = (event) => {
			setConnection("Reconnecting");
			setError(
				event.code === 4001
					? "The host display disconnected. Waiting for it to come back…"
					: "Connection lost. Reconnecting…",
			);
			// The stored session id reclaims the same slot within the grace
			// period, so keep retrying with a gentle backoff.
			const delay = Math.min(
				8_000,
				1_000 * 2 ** Math.min(backoffRef.current, 3),
			);
			backoffRef.current += 1;
			retryTimer = window.setTimeout(
				() => setReconnectAttempt((attempt) => attempt + 1),
				delay,
			);
		};
		socket.onerror = () => setConnection("Error");
		return () => {
			if (retryTimer) window.clearTimeout(retryTimer);
			socket.onopen = null;
			socket.onmessage = null;
			socket.onclose = null;
			socket.onerror = null;
			socket.close();
			socketRef.current = null;
		};
	}, [room, reconnectAttempt]);

	function send(message: ControllerMessage) {
		sendSocketMessage(socketRef.current, message);
	}

	function startCooldown() {
		cooldownRef.current = THROW_COOLDOWN_MS;
		setCooldownMs(THROW_COOLDOWN_MS);
		setCooldownEndsAt(Date.now() + THROW_COOLDOWN_MS);
	}

	function sendAimValue(value: number, force = false) {
		const timestamp = Date.now();
		const next = nextAimMessage(
			value,
			timestamp,
			aimSendStateRef.current,
			force,
		);
		if (!next) return;
		aimSendStateRef.current = next.state;
		send(next.message);
		aimMessageTimesRef.current = aimMessageTimesRef.current.filter(
			(at) => timestamp - at < 1000,
		);
		aimMessageTimesRef.current.push(timestamp);
		setAimMessagesPerSecond(aimMessageTimesRef.current.length);
	}

	function updateAimValue(value: number, force = false) {
		const next = clamp(Number.isFinite(value) ? value : 0, -1, 1);
		aimRef.current = next;
		setAim(next);
		sendAimValue(next, force);
	}

	function updateAimFromPointer(
		event: ReactPointerEvent<HTMLDivElement>,
		force = false,
	) {
		const surface = aimSurfaceRef.current;
		if (!surface) return;
		const rect = surface.getBoundingClientRect();
		updateAimValue(
			pointerXToNormalizedAim(event.clientX, rect.left, rect.width),
			force,
		);
	}

	function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
		// No isPrimary check: a thumb resting elsewhere on the screen must not
		// block aiming. One-drag-at-a-time is enforced by the active pointer id.
		if (activePointerIdRef.current !== null) return;
		activePointerIdRef.current = event.pointerId;
		setIsAiming(true);
		try {
			event.currentTarget.setPointerCapture(event.pointerId);
		} catch {
			/* Pointer capture is optional on older debugging browsers. */
		}
		updateAimFromPointer(event, true);
	}

	function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
		if (event.pointerId !== activePointerIdRef.current) return;
		updateAimFromPointer(event);
	}

	function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
		if (event.pointerId !== activePointerIdRef.current) return;
		updateAimFromPointer(event, true);
		activePointerIdRef.current = null;
		setIsAiming(false);
		try {
			event.currentTarget.releasePointerCapture(event.pointerId);
		} catch {
			/* Pointer capture is optional on older debugging browsers. */
		}
	}

	function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
		if (event.pointerId !== activePointerIdRef.current) return;
		activePointerIdRef.current = null;
		setIsAiming(false);
	}

	function handleAimKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
		if (event.key === "ArrowLeft") {
			event.preventDefault();
			updateAimValue(aimRef.current - 0.08, true);
		} else if (event.key === "ArrowRight") {
			event.preventDefault();
			updateAimValue(aimRef.current + 0.08, true);
		} else if (event.key === "Home") {
			event.preventDefault();
			updateAimValue(-1, true);
		} else if (event.key === "End") {
			event.preventDefault();
			updateAimValue(1, true);
		}
	}

	function handleMotion(event: DeviceMotionEvent) {
		motionEventCountRef.current += 1;
		const linear = event.acceleration;
		const hasLinear =
			Number.isFinite(linear?.x ?? Number.NaN) ||
			Number.isFinite(linear?.y ?? Number.NaN) ||
			Number.isFinite(linear?.z ?? Number.NaN);
		let forwardMagnitude: number;
		let nextMagnitude: number;
		if (hasLinear) {
			const x = linear?.x ?? 0;
			const y = linear?.y ?? 0;
			const z = linear?.z ?? 0;
			nextMagnitude = Math.sqrt(x * x + y * y + z * z);
			forwardMagnitude = forwardAccelerationMagnitude(linear);
		} else {
			// No gravity-free data on this device: subtract a low-pass gravity
			// estimate so the ~9.8 m/s² baseline can't trigger phantom throws.
			const raw = event.accelerationIncludingGravity;
			const filtered = removeGravity(
				{ x: raw?.x ?? 0, y: raw?.y ?? 0, z: raw?.z ?? 0 },
				gravityFilterRef.current,
			);
			gravityFilterRef.current = filtered.state;
			nextMagnitude = Math.sqrt(
				filtered.linear.x * filtered.linear.x +
					filtered.linear.y * filtered.linear.y +
					filtered.linear.z * filtered.linear.z,
			);
			forwardMagnitude = nextMagnitude;
		}
		const now = Date.now();
		if (now - lastMotionUiAtRef.current >= 100) {
			lastMotionUiAtRef.current = now;
			setMagnitude(nextMagnitude);
			setMotionEventCount(motionEventCountRef.current);
		}
		const result = detectFlick(
			forwardMagnitude,
			detectorRef.current,
			now,
			FLICK_SENSITIVITY_CONFIG[sensitivityRef.current],
		);
		detectorRef.current = result.state;
		if (result.flicked && phaseRef.current === "playing")
			sendFlick(result.intensity, "motion");
	}

	async function enableMotion() {
		setError("");
		if (!("DeviceMotionEvent" in window)) {
			setPermission("Unsupported");
			send({ type: "motion-status", enabled: false });
			setError("Physical flick is unavailable. Use the Throw button instead.");
			return;
		}
		try {
			const motion = window.DeviceMotionEvent as typeof DeviceMotionEvent & {
				requestPermission?: () => Promise<string>;
			};
			if (
				motion.requestPermission &&
				(await motion.requestPermission()) !== "granted"
			)
				throw new Error("denied");
			if (!motionListenerRef.current) {
				motionListenerRef.current = handleMotion;
				window.addEventListener("devicemotion", handleMotion);
			}
			setPermission("Enabled");
			send({ type: "motion-status", enabled: true });
			if ((await wakeLockRef.current?.request()) === "active")
				showConfirmation("SCREEN AWAKE");
			else showConfirmation("PHYSICAL FLICK ENABLED");
		} catch {
			setPermission("Denied");
			send({ type: "motion-status", enabled: false });
			setError("Physical flick unavailable — use the Throw button.");
		}
	}

	function sendFlick(intensity: number, source: ThrowSource) {
		if (cooldownRef.current > 0 || phaseRef.current !== "playing") return;
		const safeIntensity = clamp(
			Number.isFinite(intensity) ? intensity : 0.75,
			0,
			1,
		);
		startCooldown();
		setLastFlick(safeIntensity);
		setLastThrowSource(source);
		showConfirmation(source === "button" ? "THROW SENT" : "FLICK SENT");
		vibrate(source === "button" ? 45 : 70);
		send({
			type: "flick",
			intensity: safeIntensity,
			source,
			timestamp: Date.now(),
		});
	}

	function updateFlickSensitivity(next: FlickSensitivity) {
		sensitivityRef.current = next;
		setSensitivity(next);
		detectorRef.current = {
			lastFlickAt: detectorRef.current.lastFlickAt,
		};
		try {
			window.localStorage.setItem(FLICK_SENSITIVITY_STORAGE_KEY, next);
		} catch {
			// Keep the in-memory setting when persistent storage is unavailable.
		}
		showConfirmation(`SENSITIVITY ${next.toUpperCase()}`);
	}

	function toggleReady() {
		if (!assignment) return;
		const next = !ready;
		setReady(next);
		send({ type: "ready", ready: next });
		showConfirmation(next ? "READY UP" : "NOT READY");
	}

	function showConfirmation(message: string) {
		setConfirmation(message);
		if (confirmationTimerRef.current)
			window.clearTimeout(confirmationTimerRef.current);
		confirmationTimerRef.current = window.setTimeout(
			() => setConfirmation(""),
			1100,
		);
	}

	if (!room)
		return (
			<main className="controller-shell">
				<div className="controller-card">
					<Link to="/" className="brand-mark">
						<BrandMark />
					</Link>
					<h1>Room code missing.</h1>
					<p>Scan the QR code from a host screen.</p>
				</div>
			</main>
		);

	const color = assignment?.color ?? "blue";
	const currentPlayer = players.find(
		(player) => player.playerId === assignment?.playerId,
	);
	const seconds = Math.ceil(timeRemainingMs / 1000);
	const stationAimAngle = assignment
		? mapAimAngle(aim, STATIONS[assignment.playerNumber].aim)
		: 0;
	const aimDegrees = Math.round((stationAimAngle * 180) / Math.PI);
	const aimPosition = normalizedAimToTrackPercent(aim);
	const throwProgress = cooldownMs
		? Math.max(0, Math.min(1, 1 - cooldownMs / THROW_COOLDOWN_MS))
		: 1;
	const canThrow =
		Boolean(assignment) && cooldownMs === 0 && phase === "playing";
	const motionSignal = Math.min(1, magnitude / 24);
	const wakeLockCopy = screenWakeLockCopy(wakeLockStatus);
	const personalAward = buildRoundAwards(roundStandings).find(
		(award) => award.playerId === assignment?.playerId,
	);
	const resultStanding = roundStandings.find(
		(standing) => standing.playerId === assignment?.playerId,
	);
	const leaderCopy =
		phase === "playing" && leaderState.playerNumber
			? `${leaderState.playerId === assignment?.playerId ? "YOU" : playerLabel({ playerId: leaderState.playerId ?? "", playerNumber: leaderState.playerNumber })} · ${leaderState.bountyActive ? "TARGET +25" : "LEADER"}`
			: phase.toUpperCase();

	return (
		<main className={`controller-shell color-${color} phase-${phase}`}>
			<div className="controller-card">
				<header className="controller-header">
					<Link to="/" className="brand-mark">
						<BrandMark />
					</Link>
					<span
						className={`connection-pill ${connection === "Connected" ? "is-connected" : ""}`}
					>
						<i />
						{connection}
					</span>
				</header>

				<section
					className="controller-player-header"
					aria-label="Player status"
				>
					<div className="controller-avatar">
						<span>{assignment ? `P${assignment.playerNumber}` : "—"}</span>
					</div>
					<div>
						<span className="panel-label">YOUR STATION</span>
						<h1>
							{assignment ? `${color.toUpperCase()} PLAYER` : "Joining arena…"}
						</h1>
						<p>
							Room <strong>{room}</strong>
						</p>
					</div>
					<div className="controller-score-block">
						<span>YOUR SCORE</span>
						<strong>{score.toString().padStart(3, "0")}</strong>
					</div>
				</section>

				<output className="controller-match-bar" aria-label="Match status">
					<span>{leaderCopy}</span>
					<strong>
						{phase === "playing"
							? `${seconds}s`
							: phase === "countdown"
								? "GET SET"
								: phase === "results"
									? "FINISHED"
									: ready
										? "YOU’RE READY"
										: "NOT READY"}
					</strong>
				</output>

				{error ? (
					<div className="controller-error" role="alert">
						{error}
					</div>
				) : null}

				<section className="controller-projectile" aria-label="Your loadout">
					<ProjectileReadout label="LOADED" type={projectile} />
					<ProjectileReadout label="UP NEXT" type={nextProjectile} />
				</section>

				<div
					ref={aimSurfaceRef}
					className={`controller-aim-surface ${isAiming ? "is-dragging" : ""}`}
					role="slider"
					tabIndex={0}
					aria-label="Drag to aim"
					aria-valuemin={-1}
					aria-valuemax={1}
					aria-valuenow={Number(aim.toFixed(2))}
					onKeyDown={handleAimKeyDown}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerCancel={handlePointerCancel}
				>
					<span className="aim-surface-label">
						<strong>AIM</strong>
						<small>{aimDegrees}°</small>
					</span>
					<span className="aim-surface-limit aim-surface-left">LEFT</span>
					<span className="aim-surface-limit aim-surface-right">RIGHT</span>
					<span className="aim-surface-track" />
					<span
						className="aim-surface-handle"
						style={{ left: `${aimPosition}%` }}
					>
						<span />
					</span>
				</div>

				<p className="controller-throw-instruction">
					<strong>DRAG · FLICK · SCORE</strong>
					<span>
						Drag to aim, then make a short forward flick. Hold your phone
						securely.
					</span>
				</p>
				{phase === "lobby" ? (
					<p className="controller-safety-note">
						Leave space around you—or use the big Throw button instead.
					</p>
				) : null}

				<section className="controller-throw">
					<button
						className="throw-button"
						type="button"
						disabled={!canThrow}
						onClick={() => sendFlick(0.75, "button")}
						aria-label={cooldownMs > 0 ? "Throw cooling down" : "Throw"}
					>
						<span
							className="throw-button-progress"
							style={{ width: `${throwProgress * 100}%` }}
						/>
						<strong>{cooldownMs > 0 ? "RELOADING…" : "THROW!"}</strong>
						<small>
							{cooldownMs > 0
								? `${(cooldownMs / 1000).toFixed(1)}s cooldown`
								: canThrow
									? "Tap to launch your loaded ammo"
									: phase === "lobby"
										? "Waiting for the host to start"
										: "Throw unavailable"}
						</small>
					</button>
				</section>

				<div
					className={`confirmation ${confirmation ? "is-visible" : ""}`}
					aria-live="polite"
				>
					{confirmation}
				</div>

				<section
					className={`physical-flick-card physical-flick-${permission.toLowerCase().replaceAll(" ", "-")}`}
					aria-labelledby="physical-flick-title"
				>
					<div className="physical-flick-copy">
						<span className="physical-flick-mark" aria-hidden="true">
							↗
						</span>
						<div>
							<strong id="physical-flick-title">
								{permission === "Enabled"
									? "Physical flick is on"
									: permission === "Denied" || permission === "Unsupported"
										? "Physical flick unavailable"
										: "Try physical flick"}
							</strong>
							<output id="physical-flick-description" aria-live="polite">
								{permission === "Enabled"
									? "Short phone flicks now throw. The button still works."
									: permission === "Denied" || permission === "Unsupported"
										? "Keep playing with the on-screen Throw button."
										: "Use a short forward motion for the signature throw."}
							</output>
						</div>
					</div>
					<button
						className="physical-flick-button"
						type="button"
						onClick={enableMotion}
						disabled={permission === "Enabled" || permission === "Unsupported"}
						aria-describedby="physical-flick-description"
					>
						{permission === "Enabled"
							? "✓ ENABLED"
							: permission === "Unsupported"
								? "UNAVAILABLE"
								: "ENABLE"}
					</button>
				</section>

				{phase === "lobby" ? (
					<section className="controller-ready-panel">
						<div>
							<strong>{ready ? "LOCKED IN!" : "READY TO RUMBLE?"}</strong>
							<span>
								{ready
									? "Watch the big screen. The host can start anytime."
									: "Your aim and Throw button already work. Motion mode is optional."}
							</span>
						</div>
						<button
							className={`action-button ${ready ? "action-ready" : "action-accent"}`}
							type="button"
							onClick={toggleReady}
							disabled={!assignment}
						>
							{ready ? "✓ READY — TAP TO CANCEL" : "I’M READY!"}
						</button>
					</section>
				) : null}

				<details className="controller-setup">
					<summary>
						<span>
							<strong>Flick tuning</strong>
							<small>{sensitivity} sensitivity · sensor details</small>
						</span>
						<span className="setup-disclosure" aria-hidden="true">
							+
						</span>
					</summary>
					<div className="controller-setup-body">
						<fieldset
							className="sensitivity-control"
							aria-describedby="flick-sensitivity-help"
						>
							<legend>FLICK SENSITIVITY</legend>
							<p id="flick-sensitivity-help">
								Choose High if lighter phone motions are not registering.
							</p>
							<div>
								{(["low", "normal", "high"] as FlickSensitivity[]).map(
									(option) => (
										<button
											key={option}
											type="button"
											className={
												option === sensitivity
													? "sensitivity-button is-selected"
													: "sensitivity-button"
											}
											aria-pressed={option === sensitivity}
											onClick={() => updateFlickSensitivity(option)}
										>
											{option.toUpperCase()}
										</button>
									),
								)}
							</div>
						</fieldset>
						<output
							className={`motion-monitor ${permission === "Enabled" ? "is-enabled" : ""} ${motionEventCount > 0 ? "is-live" : ""}`}
							aria-label={
								permission === "Enabled"
									? `Sensor ${motionEventCount > 0 ? "receiving data" : "waiting for data"}, ${magnitude.toFixed(1)} meters per second squared`
									: "Motion sensor is off"
							}
						>
							<span className="motion-monitor-heading">
								<strong>SENSOR SIGNAL</strong>
								<em>
									{permission !== "Enabled"
										? "OFF"
										: motionEventCount > 0
											? "RECEIVING"
											: "WAITING"}
								</em>
							</span>
							<span className="motion-meter" aria-hidden="true">
								<span
									style={{
										transform: `scaleX(${motionSignal})`,
									}}
								/>
							</span>
							<span className="motion-monitor-readout">
								{permission === "Enabled"
									? `${magnitude.toFixed(1)} m/s² · ${motionEventCount} events`
									: "Enable physical flick, then move the phone"}
							</span>
						</output>
						<output
							className={`screen-wake-status screen-wake-${wakeLockStatus}`}
							aria-live="polite"
						>
							<span className="screen-wake-indicator" />
							<div>
								<strong>{wakeLockCopy.label}</strong>
								<p>{wakeLockCopy.detail}</p>
							</div>
						</output>
					</div>
				</details>

				<button
					className="debug-toggle"
					type="button"
					onClick={() => setDebugOpen((open) => !open)}
				>
					{debugOpen
						? "Hide Settings"
						: import.meta.env.DEV
							? "Show Debug Panel"
							: "Settings"}
				</button>
				{debugOpen ? (
					<section className="debug-panel">
						{import.meta.env.DEV ? (
							<>
								<DebugRow label="NORMALIZED AIM" value={aim.toFixed(3)} />
								<DebugRow
									label="AIM MESSAGES/S"
									value={aimMessagesPerSecond.toString()}
								/>
								<DebugRow
									label="LAST THROW SOURCE"
									value={lastThrowSource?.toUpperCase() ?? "—"}
								/>
								<DebugRow
									label="MOTION EVENTS"
									value={motionEventCount.toString()}
								/>
								<DebugRow
									label="ACCELERATION"
									value={`${magnitude.toFixed(1)} m/s²`}
								/>
								<DebugRow
									label="LAST FLICK"
									value={lastFlick ? `${Math.round(lastFlick * 100)}%` : "—"}
								/>
								<DebugRow
									label="COOLDOWN"
									value={cooldownMs ? `${cooldownMs}ms` : "READY"}
								/>
								<DebugRow label="SESSION" value={sessionIdRef.current || "—"} />
								<DebugRow
									label="PLAYER ID"
									value={assignment?.playerId ?? "—"}
								/>
							</>
						) : null}
						<button
							className="debug-test-button"
							type="button"
							onClick={() => sendFlick(0.75, "button")}
							disabled={!canThrow}
						>
							✦ Test Throw
						</button>
					</section>
				) : null}

				<p className="controller-footnote">
					{currentPlayer?.connected
						? "Drag to aim. Flick to throw. Tap THROW if motion is unavailable."
						: "Waiting for the host to reconnect."}
				</p>
				{phase === "results" && resultStanding ? (
					<section className="controller-result" aria-label="Your round result">
						<div className="controller-rank">
							FINAL RANK <strong>#{resultStanding.rank}</strong>
						</div>
						<div className="controller-result-stats">
							<span>
								<strong>{resultStanding.playerHits}</strong>{" "}
								{resultStanding.playerHits === 1 ? "HIT" : "HITS"}
							</span>
							<span>
								<strong>
									{Math.round(successfulThrowRate(resultStanding) * 100)}%
								</strong>{" "}
								CONNECTED
							</span>
							<span>
								<strong>{resultStanding.propsDestroyed}</strong> SMASHED
							</span>
						</div>
						{personalAward ? (
							<div className="controller-award">
								<span>ROUND AWARD</span>
								<strong>{personalAward.label}</strong>
								<small>{personalAward.detail}</small>
							</div>
						) : (
							<p className="controller-rematch-prompt">
								Aim for a round award in the rematch.
							</p>
						)}
					</section>
				) : null}

				<AndroidMotionGuide />
			</div>
		</main>
	);
}

function AndroidMotionGuide() {
	return (
		<details className="android-motion-guide">
			<summary>
				<span className="android-guide-icon" aria-hidden="true">
					↗
				</span>
				<span className="android-guide-heading">
					<span>ANDROID HELP</span>
					<strong>Motion not working?</strong>
					<small>Fix Chrome or Brave settings in about 30 seconds</small>
				</span>
				<span className="android-guide-disclosure" aria-hidden="true">
					+
				</span>
			</summary>

			<div className="android-guide-body">
				<div className="android-browser-note">
					<span>BEST CHOICE</span>
					<div>
						<strong>Open Flick in Chrome</strong>
						<p>
							Chrome usually works immediately. Brave blocks motion sensors by
							default until you switch them on.
						</p>
					</div>
				</div>

				<ol className="android-guide-steps">
					<li>
						<span aria-hidden="true">1</span>
						<div>
							<strong>Open browser settings</strong>
							<p>Tap the ⋮ menu, then choose Settings.</p>
						</div>
					</li>
					<li>
						<span aria-hidden="true">2</span>
						<div>
							<strong>Find Motion sensors</strong>
							<p>Open Site settings, then tap Motion sensors.</p>
						</div>
					</li>
					<li>
						<span aria-hidden="true">3</span>
						<div>
							<strong>Allow and return</strong>
							<p>Turn access on, return to Flick, then refresh this page.</p>
						</div>
					</li>
				</ol>

				<div className="android-signal-check">
					<span className="android-signal-pulse" aria-hidden="true" />
					<div>
						<strong>Check that it worked</strong>
						<p>
							Open Flick tuning above and move your phone. The event count
							should climb quickly and the signal should move above 0.0 m/s².
						</p>
					</div>
				</div>

				<p className="android-guide-fallback">
					Still stuck? Keep playing with the Throw button—physical motion is
					always optional.
				</p>
			</div>
		</details>
	);
}

function ProjectileReadout({
	label,
	type,
}: {
	label: string;
	type: ProjectileType;
}) {
	return (
		<div className="projectile-readout">
			<span
				className={`projectile-icon projectile-${type}`}
				aria-hidden="true"
			/>
			<span>
				<small className="panel-label">{label}</small>
				<strong>{projectileName(type)}</strong>
			</span>
		</div>
	);
}

function DebugRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="debug-row">
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

function vibrate(...pattern: number[]) {
	try {
		navigator.vibrate?.(pattern);
	} catch {
		/* unsupported browsers fail silently */
	}
}

function isUuid(value: string) {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		value,
	);
}

function projectileName(type: ProjectileType) {
	if (type === "paper-ball") return "PAPER BALL";
	if (type === "coffee-mug") return "COFFEE MUG";
	if (type === "stapler") return "STAPLER";
	if (type === "bomb") return "DESK BOMB";
	return "SUPERBALL";
}

function screenWakeLockCopy(status: ScreenWakeLockStatus) {
	if (status === "active") {
		return {
			label: "SCREEN AWAKE",
			detail: "Auto-lock is paused while this controller is visible.",
		};
	}
	if (status === "unsupported") {
		return {
			label: "SCREEN WAKE UNAVAILABLE",
			detail:
				"Disable auto-lock manually or keep the phone awake for the round.",
		};
	}
	if (status === "denied") {
		return {
			label: "SCREEN WAKE BLOCKED",
			detail:
				"Disable auto-lock manually or keep the phone awake for the round.",
		};
	}
	if (status === "released") {
		return {
			label: "SCREEN WAKE RELEASED",
			detail: "Return to this page to try again if the screen starts sleeping.",
		};
	}
	return {
		label: "SCREEN WAKE LOCK",
		detail: "Enabled automatically when physical flick controls start.",
	};
}
