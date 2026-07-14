import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
	detectFlick,
	FLICK_DETECTOR_CONFIG,
} from "../controller/flick-detector";
import { normalizeOrientation, smoothValue } from "../controller/motion";
import {
	createScreenWakeLock,
	type ScreenWakeLockStatus,
} from "../controller/screen-wake-lock";
import { nextProjectileType } from "../game/config/projectiles";
import type {
	LobbyPlayer,
	MatchPhase,
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

function ControllerPage() {
	const { room } = Route.useSearch();
	const socketRef = useRef<WebSocket | null>(null);
	const sessionIdRef = useRef("");
	const assignmentRef = useRef<PlayerAssignment | null>(null);
	const throwCountRef = useRef(0);
	const baselineRef = useRef<number | null>(null);
	const latestGammaRef = useRef(0);
	const sensorsEnabledRef = useRef(false);
	const tiltRef = useRef(0);
	const lastSentRef = useRef({ value: 0, at: 0 });
	const detectorRef = useRef({ lastFlickAt: -Infinity });
	const [connection, setConnection] = useState("Connecting");
	const [permission, setPermission] = useState<PermissionState>("Not enabled");
	const [assignment, setAssignment] = useState<PlayerAssignment | null>(null);
	const [players, setPlayers] = useState<LobbyPlayer[]>([]);
	const [phase, setPhase] = useState<MatchPhase>("lobby");
	const [timeRemainingMs, setTimeRemainingMs] = useState(0);
	const [score, setScore] = useState(0);
	const [rank, setRank] = useState<number | null>(null);
	const [tilt, setTilt] = useState(0);
	const [magnitude, setMagnitude] = useState(0);
	const [lastFlick, setLastFlick] = useState(0);
	const [projectile, setProjectile] = useState<ProjectileType>("paper-ball");
	const [nextProjectile, setNextProjectile] =
		useState<ProjectileType>("paper-ball");
	const [cooldownMs, setCooldownMs] = useState(0);
	const [confirmation, setConfirmation] = useState("");
	const [ready, setReady] = useState(false);
	const [calibrated, setCalibrated] = useState(false);
	const [debugOpen, setDebugOpen] = useState(false);
	const [error, setError] = useState("");
	const [wakeLockStatus, setWakeLockStatus] =
		useState<ScreenWakeLockStatus>("idle");
	const wakeLockRef = useRef<ReturnType<typeof createScreenWakeLock> | null>(
		null,
	);

	useEffect(() => {
		if (cooldownMs <= 0) return;
		const interval = window.setInterval(
			() => setCooldownMs((current) => Math.max(0, current - 50)),
			50,
		);
		return () => window.clearInterval(interval);
	}, [cooldownMs]);

	useEffect(() => {
		const controller = createScreenWakeLock(setWakeLockStatus);
		wakeLockRef.current = controller;
		return () => {
			wakeLockRef.current = null;
			void controller.destroy();
		};
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Sensor handlers use refs and the socket lifecycle is keyed by room.
	useEffect(() => {
		if (!room) return;
		if (typeof WebSocket === "undefined") {
			setConnection("WebSocket unavailable");
			return;
		}
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
			setConnection("Connected");
			setError("");
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
				if (current) {
					setReady(current.ready);
					setCalibrated(current.calibrated);
				}
			} else if (message.type === "match-state") {
				setPhase(message.phase);
				setTimeRemainingMs(message.timeRemainingMs ?? 0);
			} else if (message.type === "flick-accepted") {
				throwCountRef.current += 1;
				setCooldownMs(650);
				setProjectile(message.projectileType);
				setNextProjectile(
					nextProjectileType(
						throwCountRef.current,
						assignmentRef.current?.playerNumber ?? 1,
					),
				);
				setLastFlick((current) => current || 0.8);
				showConfirmation("FLICK ACCEPTED");
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
				showConfirmation(`+${message.score} HIT`);
				vibrate(90);
			} else if (
				message.type === "player-hit" &&
				message.targetPlayerId === assignmentRef.current?.playerId
			) {
				showConfirmation("YOU GOT BONKED");
				vibrate(80, 80);
			} else if (message.type === "round-result") {
				const standing = message.standings.find(
					(candidate) => candidate.playerId === assignmentRef.current?.playerId,
				);
				setRank(standing?.rank ?? null);
				setPhase("results");
				vibrate(240);
			} else if (message.type === "error") {
				setError(message.message);
			}
		};
		socket.onclose = () => {
			setConnection("Disconnected");
			setError(
				"Host unavailable. Reopen the room link when the host reconnects.",
			);
		};
		socket.onerror = () => setConnection("Error");
		return () => {
			socket.close();
			if (sensorsEnabledRef.current) {
				window.removeEventListener("deviceorientation", handleOrientation);
				window.removeEventListener("devicemotion", handleMotion);
				sensorsEnabledRef.current = false;
			}
			socketRef.current = null;
		};
	}, [room]);

	function send(message: ControllerMessage) {
		sendSocketMessage(socketRef.current, message);
	}

	function handleOrientation(event: DeviceOrientationEvent) {
		if (event.gamma == null) return;
		latestGammaRef.current = event.gamma;
		if (baselineRef.current == null) baselineRef.current = event.gamma;
		const next = smoothValue(
			tiltRef.current,
			normalizeOrientation(event.gamma, baselineRef.current),
		);
		tiltRef.current = next;
		setTilt(next);
		const now = Date.now();
		const changed = Math.abs(next - lastSentRef.current.value) > 0.035;
		const due = now - lastSentRef.current.at >= 100;
		if (due && (changed || now - lastSentRef.current.at > 500)) {
			send({ type: "orientation", normalizedX: next, timestamp: now });
			lastSentRef.current = { value: next, at: now };
		}
	}

	function handleMotion(event: DeviceMotionEvent) {
		const acceleration =
			event.acceleration ?? event.accelerationIncludingGravity;
		const x = acceleration?.x ?? 0;
		const y = acceleration?.y ?? 0;
		const z = acceleration?.z ?? 0;
		const nextMagnitude = Math.sqrt(x * x + y * y + z * z);
		setMagnitude(nextMagnitude);
		const result = detectFlick(nextMagnitude, detectorRef.current, Date.now());
		detectorRef.current = result.state;
		if (result.flicked) sendFlick(result.intensity);
	}

	async function enableMotion() {
		setError("");
		if (
			!("DeviceMotionEvent" in window) ||
			!("DeviceOrientationEvent" in window)
		) {
			setPermission("Unsupported");
			setError("This browser does not expose motion sensors.");
			return;
		}
		try {
			const motion = window.DeviceMotionEvent as typeof DeviceMotionEvent & {
				requestPermission?: () => Promise<string>;
			};
			const orientation =
				window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
					requestPermission?: () => Promise<string>;
				};
			if (
				motion.requestPermission &&
				(await motion.requestPermission()) !== "granted"
			)
				throw new Error("denied");
			if (
				orientation.requestPermission &&
				(await orientation.requestPermission()) !== "granted"
			)
				throw new Error("denied");
			if (!sensorsEnabledRef.current) {
				window.addEventListener("deviceorientation", handleOrientation);
				window.addEventListener("devicemotion", handleMotion);
				sensorsEnabledRef.current = true;
			}
			setPermission("Enabled");
			if ((await wakeLockRef.current?.request()) === "active") {
				showConfirmation("SCREEN AWAKE");
			}
		} catch {
			setPermission("Denied");
			setError(
				"Motion permission denied. Enable it in Safari settings, then reload this page.",
			);
		}
	}

	function calibrate() {
		setError("");
		if (permission !== "Enabled") {
			setError("Enable motion controls first.");
			return;
		}
		baselineRef.current = latestGammaRef.current;
		tiltRef.current = 0;
		setTilt(0);
		setCalibrated(true);
		send({ type: "calibration-status", calibrated: true });
		showConfirmation("CALIBRATED");
	}

	function toggleReady() {
		const next = !ready;
		setReady(next);
		send({ type: "ready", ready: next });
		showConfirmation(next ? "READY UP" : "NOT READY");
	}

	function sendFlick(intensity: number) {
		setLastFlick(intensity);
		send({ type: "flick", intensity, timestamp: Date.now() });
	}

	function showConfirmation(message: string) {
		setConfirmation(message);
		window.setTimeout(() => setConfirmation(""), 900);
	}

	if (!room)
		return (
			<main className="controller-shell">
				<div className="controller-card">
					<Link to="/" className="brand-mark">
						<span className="brand-dot" />
						FLICK
					</Link>
					<h1>Room code missing.</h1>
					<p>Scan the QR code from a host screen.</p>
				</div>
			</main>
		);

	const color = assignment?.color ?? "blue";
	const wakeLockCopy = screenWakeLockCopy(wakeLockStatus);
	const currentPlayer = players.find(
		(player) => player.playerId === assignment?.playerId,
	);
	const seconds = Math.ceil(timeRemainingMs / 1000);
	const aimDegrees = tilt * 28;

	return (
		<main className={`controller-shell color-${color}`}>
			<div className="controller-card">
				<header className="controller-header">
					<Link to="/" className="brand-mark">
						<span className="brand-dot" />
						FLICK
					</Link>
					<span
						className={`connection-pill ${connection === "Connected" ? "is-connected" : ""}`}
					>
						<i />
						{connection}
					</span>
				</header>
				<section className="controller-player-header">
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
				</section>
				<div className="controller-match-bar">
					<span>{phase.toUpperCase()}</span>
					<strong>
						{phase === "playing"
							? `${seconds}s`
							: score.toString().padStart(3, "0")}{" "}
						{phase === "playing" ? "" : "PTS"}
					</strong>
				</div>
				{error ? (
					<div className="controller-error" role="alert">
						{error}
					</div>
				) : null}
				<section className="aim-card">
					<div className="aim-scope">
						<div className="aim-center" />
						<div
							className="aim-arrow"
							style={{ transform: `rotate(${aimDegrees}deg)` }}
						/>
						<span className="aim-left">←</span>
						<span className="aim-right">→</span>
					</div>
					<div className="aim-readout">
						<span>TILT AIM</span>
						<strong>{tilt.toFixed(2)}</strong>
					</div>
				</section>
				<section className="controller-projectile">
					<div>
						<span className="panel-label">IN HAND</span>
						<strong>{projectileName(projectile)}</strong>
					</div>
					<div>
						<span className="panel-label">NEXT</span>
						<strong>{projectileName(nextProjectile)}</strong>
					</div>
					<div>
						<span className="panel-label">THROW</span>
						<strong>
							{cooldownMs > 0 ? `${(cooldownMs / 1000).toFixed(1)}s` : "READY"}
						</strong>
					</div>
				</section>
				<div
					className={`confirmation ${confirmation ? "is-visible" : ""}`}
					aria-live="polite"
				>
					{confirmation}
				</div>
				<div className="controller-actions">
					<button
						className="action-button action-primary"
						type="button"
						onClick={enableMotion}
					>
						<span>◉</span>{" "}
						{permission === "Enabled"
							? "Motion Controls Enabled"
							: "Enable Motion Controls"}
					</button>
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
					<button
						className="action-button action-secondary"
						type="button"
						onClick={calibrate}
					>
						<span>⊙</span> {calibrated ? "Recalibrate" : "Calibrate Phone"}
					</button>
					<button
						className={`action-button ${ready ? "action-ready" : "action-accent"}`}
						type="button"
						onClick={toggleReady}
						disabled={!assignment}
					>
						{ready ? "Ready — tap to leave ready state" : "Mark Me Ready"}
					</button>
				</div>
				<button
					className="debug-toggle"
					type="button"
					onClick={() => setDebugOpen((open) => !open)}
				>
					{debugOpen ? "Hide Debug Panel" : "Show Debug Panel"}
				</button>
				{debugOpen ? (
					<section className="debug-panel">
						<DebugRow label="NORMALIZED TILT" value={tilt.toFixed(3)} />
						<DebugRow
							label="RAW GAMMA"
							value={`${latestGammaRef.current.toFixed(1)}°`}
						/>
						<DebugRow
							label="ACCELERATION"
							value={`${magnitude.toFixed(1)} m/s²`}
						/>
						<DebugRow
							label="FLICK THRESHOLD"
							value={`${FLICK_DETECTOR_CONFIG.spikeThreshold} m/s²`}
						/>
						<DebugRow
							label="LAST FLICK"
							value={lastFlick ? `${Math.round(lastFlick * 100)}%` : "—"}
						/>
						<DebugRow label="SESSION" value={sessionIdRef.current || "—"} />
						<DebugRow label="PLAYER ID" value={assignment?.playerId ?? "—"} />
						<button
							className="debug-test-button"
							type="button"
							onClick={() => sendFlick(0.8)}
						>
							✦ Test Flick
						</button>
					</section>
				) : null}
				<p className="controller-footnote">
					{currentPlayer?.connected
						? "Tilt to aim. Flick forward to throw."
						: "Waiting for the host to reconnect."}
				</p>
				{phase === "results" && rank ? (
					<div className="controller-rank">
						FINAL RANK <strong>#{rank}</strong>
					</div>
				) : null}
			</div>
		</main>
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
	return "STAPLER";
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
			detail: "Keep the phone awake manually for the round.",
		};
	}
	if (status === "denied") {
		return {
			label: "SCREEN WAKE BLOCKED",
			detail: "Keep the phone awake manually for the round.",
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
		detail: "Enabled automatically when motion controls start.",
	};
}
