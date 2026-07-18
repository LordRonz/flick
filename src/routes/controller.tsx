import { createFileRoute, Link } from "@tanstack/react-router";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { z } from "zod";
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
} from "../controller/flick-detector";
import {
	createScreenWakeLock,
	type ScreenWakeLockStatus,
} from "../controller/screen-wake-lock";
import { playUiCue } from "../game/audio/ArcadeAudio";
import { STATIONS } from "../game/config/arena";
import { type FlickSource, THROW_COOLDOWN_MS } from "../game/config/controls";
import { nextProjectileType } from "../game/config/projectiles";
import { mapAimAngle } from "../game/systems/aim";
import { clamp } from "../game/systems/math";
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
type TutorialStep = "aim" | "throw" | "ready" | "complete";
type ThrowSource = FlickSource;

const TUTORIAL_STORAGE_KEY = "flick-tutorial-complete:v1";

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
	const aimSurfaceRef = useRef<HTMLDivElement | null>(null);
	const activePointerIdRef = useRef<number | null>(null);
	const aimRef = useRef(0);
	const aimSendStateRef = useRef<AimSendState>({
		lastSentValue: 0,
		lastSentAt: -Infinity,
	});
	const aimRangeRef = useRef({ min: 0, max: 0 });
	const cooldownRef = useRef(0);
	const phaseRef = useRef<MatchPhase>("lobby");
	const tutorialStepRef = useRef<TutorialStep>("aim");
	const sensitivityRef = useRef<FlickSensitivity>("normal");
	const confirmationTimerRef = useRef<number | undefined>(undefined);
	const motionEventCountRef = useRef(0);
	const lastMotionUiAtRef = useRef(0);
	const aimMessageTimesRef = useRef<number[]>([]);

	const [connection, setConnection] = useState("Connecting");
	const [permission, setPermission] = useState<PermissionState>("Not enabled");
	const [assignment, setAssignment] = useState<PlayerAssignment | null>(null);
	const [players, setPlayers] = useState<LobbyPlayer[]>([]);
	const [phase, setPhase] = useState<MatchPhase>("lobby");
	const [timeRemainingMs, setTimeRemainingMs] = useState(0);
	const [score, setScore] = useState(0);
	const [rank, setRank] = useState<number | null>(null);
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
	const [confirmation, setConfirmation] = useState("");
	const [ready, setReady] = useState(false);
	const [tutorialStep, setTutorialStep] = useState<TutorialStep>("aim");
	const [sensitivity, setSensitivity] = useState<FlickSensitivity>("normal");
	const [debugOpen, setDebugOpen] = useState(false);
	const [error, setError] = useState("");
	const [wakeLockStatus, setWakeLockStatus] =
		useState<ScreenWakeLockStatus>("idle");
	const wakeLockRef = useRef<ReturnType<typeof createScreenWakeLock> | null>(
		null,
	);

	phaseRef.current = phase;
	tutorialStepRef.current = tutorialStep;
	sensitivityRef.current = sensitivity;

	useEffect(() => {
		const nextStep = readTutorialComplete() ? "complete" : "aim";
		tutorialStepRef.current = nextStep;
		setTutorialStep(nextStep);
	}, []);

	useEffect(() => {
		if (!error) return;
		playUiCue(/room.+full|full.+room/i.test(error) ? "room-full" : "ui-error");
	}, [error]);

	useEffect(() => {
		if (cooldownMs <= 0) return;
		const interval = window.setInterval(
			() =>
				setCooldownMs((current) => {
					const next = Math.max(0, current - 50);
					cooldownRef.current = next;
					return next;
				}),
			50,
		);
		return () => window.clearInterval(interval);
	}, [cooldownMs]);

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

	// biome-ignore lint/correctness/useExhaustiveDependencies: Sensor and socket handlers use refs; the lifecycle is keyed by room.
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
				if (current) setReady(current.ready);
			} else if (message.type === "match-state") {
				phaseRef.current = message.phase;
				setPhase(message.phase);
				setTimeRemainingMs(message.timeRemainingMs ?? 0);
			} else if (
				message.type === "flick-accepted" &&
				message.playerId === assignmentRef.current?.playerId
			) {
				if (message.practice) {
					tutorialStepRef.current = "ready";
					setTutorialStep("ready");
					showConfirmation("PRACTICE THROW ACCEPTED");
					vibrate(70);
					return;
				}
				throwCountRef.current += 1;
				cooldownRef.current = THROW_COOLDOWN_MS;
				setCooldownMs(THROW_COOLDOWN_MS);
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
				phaseRef.current = "results";
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
			if (motionListenerRef.current) {
				window.removeEventListener("devicemotion", motionListenerRef.current);
				motionListenerRef.current = null;
			}
			socketRef.current = null;
		};
	}, [room]);

	function send(message: ControllerMessage) {
		sendSocketMessage(socketRef.current, message);
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
		if (tutorialStepRef.current === "aim") {
			aimRangeRef.current = {
				min: Math.min(aimRangeRef.current.min, next),
				max: Math.max(aimRangeRef.current.max, next),
			};
			if (aimRangeRef.current.max - aimRangeRef.current.min >= 0.55) {
				tutorialStepRef.current = "throw";
				setTutorialStep("throw");
				showConfirmation("AIM STEP COMPLETE");
			}
		}
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
		if (!event.isPrimary || activePointerIdRef.current !== null) return;
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
			updateAimValue(aimRef.current - 0.08);
		} else if (event.key === "ArrowRight") {
			event.preventDefault();
			updateAimValue(aimRef.current + 0.08);
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
		const acceleration =
			event.acceleration ?? event.accelerationIncludingGravity;
		const x = acceleration?.x ?? 0;
		const y = acceleration?.y ?? 0;
		const z = acceleration?.z ?? 0;
		const nextMagnitude = Math.sqrt(x * x + y * y + z * z);
		const forwardMagnitude = forwardAccelerationMagnitude(acceleration);
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
		if (
			result.flicked &&
			(phaseRef.current === "playing" || tutorialStepRef.current === "throw")
		)
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
		if (
			cooldownRef.current > 0 ||
			(phaseRef.current !== "playing" && tutorialStepRef.current !== "throw")
		)
			return;
		const safeIntensity = clamp(
			Number.isFinite(intensity) ? intensity : 0.75,
			0,
			1,
		);
		cooldownRef.current = THROW_COOLDOWN_MS;
		setCooldownMs(THROW_COOLDOWN_MS);
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

	function toggleReady() {
		if (!assignment) return;
		if (!ready && tutorialStepRef.current === "ready") {
			tutorialStepRef.current = "complete";
			setTutorialStep("complete");
			writeTutorialComplete(true);
		}
		if (!ready && tutorialStepRef.current !== "complete") {
			showConfirmation("FINISH THE QUICK TUTORIAL");
			return;
		}
		const next = !ready;
		setReady(next);
		send({ type: "ready", ready: next });
		showConfirmation(next ? "READY UP" : "NOT READY");
	}

	function replayTutorial() {
		writeTutorialComplete(false);
		if (ready) {
			setReady(false);
			send({ type: "ready", ready: false });
		}
		tutorialStepRef.current = "aim";
		aimRangeRef.current = { min: aimRef.current, max: aimRef.current };
		setTutorialStep("aim");
		showConfirmation("TUTORIAL RESTARTED");
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
						<span className="brand-dot" />
						FLICK
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
		Boolean(assignment) &&
		cooldownMs === 0 &&
		(phase === "playing" || tutorialStep === "throw");
	const tutorial = tutorialCopy(tutorialStep);
	const wakeLockCopy = screenWakeLockCopy(wakeLockStatus);

	return (
		<main className={`controller-shell color-${color} phase-${phase}`}>
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
					<div className="controller-score-block">
						<span>SCORE</span>
						<strong>{score.toString().padStart(3, "0")}</strong>
					</div>
				</section>

				<div className="controller-match-bar">
					<span>{phase.toUpperCase()}</span>
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
				</div>

				{error ? (
					<div className="controller-error" role="alert">
						{error}
					</div>
				) : null}

				<section className="controller-projectile">
					<ProjectileReadout label="CURRENT" type={projectile} />
					<ProjectileReadout label="NEXT" type={nextProjectile} />
				</section>

				{tutorialStep !== "complete" ? (
					<section className={`tutorial-card tutorial-${tutorialStep}`}>
						<header>
							<span>HOW TO PLAY</span>
							<strong>
								0{tutorial.index} <em>/ 03</em>
							</strong>
						</header>
						<h2>{tutorial.title}</h2>
						<p>{tutorial.detail}</p>
						{tutorialStep === "throw" ? <small>Or tap THROW</small> : null}
					</section>
				) : null}

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
						<strong>DRAG TO AIM</strong>
						<small>{aimDegrees}°</small>
					</span>
					<span className="aim-surface-limit aim-surface-left">←</span>
					<span className="aim-surface-limit aim-surface-right">→</span>
					<span className="aim-surface-track" />
					<span
						className="aim-surface-handle"
						style={{ left: `${aimPosition}%` }}
					>
						<span />
					</span>
				</div>

				<p className="controller-throw-instruction">
					<strong>FLICK TO THROW</strong>
					<span>Hold the phone securely and make a short forward motion.</span>
				</p>
				{phase === "lobby" ? (
					<p className="controller-safety-note">
						Keep a firm grip and leave space around you.
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
						<strong>THROW</strong>
						<small>
							{cooldownMs > 0
								? `${(cooldownMs / 1000).toFixed(1)}s cooldown`
								: canThrow
									? "Tap if motion is unavailable"
									: tutorialStep === "aim"
										? "Finish the aim step first"
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

				{phase === "lobby" ? (
					<div className="controller-actions">
						<button
							className="action-button action-primary"
							type="button"
							onClick={enableMotion}
						>
							<span>◉</span>
							{permission === "Enabled"
								? "Physical Flick Enabled"
								: "Enable Physical Flick"}
						</button>
						<output
							className={`motion-status motion-status-${permission.toLowerCase().replaceAll(" ", "-")}`}
							aria-live="polite"
						>
							{permission === "Enabled"
								? "Physical flick enabled"
								: permission === "Denied" || permission === "Unsupported"
									? "Physical flick unavailable — use the Throw button"
									: "Optional: physical flick adds the signature throw"}
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
						<button
							className={`action-button ${ready ? "action-ready" : "action-accent"}`}
							type="button"
							onClick={toggleReady}
							disabled={
								!assignment ||
								(!ready &&
									tutorialStep !== "complete" &&
									tutorialStep !== "ready")
							}
						>
							{ready
								? "Ready — tap to leave ready state"
								: tutorialStep === "ready"
									? "You’re ready — mark me ready"
									: tutorialStep !== "complete"
										? "Finish the quick tutorial"
										: "Mark Me Ready"}
						</button>
					</div>
				) : null}

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
						<div className="sensitivity-control">
							<span className="panel-label">FLICK SENSITIVITY</span>
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
											onClick={() => setSensitivity(option)}
										>
											{option.toUpperCase()}
										</button>
									),
								)}
							</div>
						</div>
						<button
							className="debug-test-button"
							type="button"
							onClick={() => sendFlick(0.75, "button")}
							disabled={!canThrow}
						>
							✦ Test Throw
						</button>
						<button
							className="debug-test-button"
							type="button"
							onClick={replayTutorial}
						>
							Replay Tutorial
						</button>
					</section>
				) : null}

				<p className="controller-footnote">
					{currentPlayer?.connected
						? "Drag to aim. Flick to throw. Tap THROW if motion is unavailable."
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

function tutorialCopy(step: TutorialStep) {
	if (step === "throw")
		return {
			index: 2,
			title: "Flick to throw",
			detail:
				"Hold the phone securely and make a short forward throwing motion.",
		};
	if (step === "ready")
		return {
			index: 3,
			title: "You’re ready to play",
			detail: "Tap Mark Me Ready when your aim and throw feel comfortable.",
		};
	return {
		index: 1,
		title: "Drag to aim",
		detail: "Drag the marker left and right through a meaningful range.",
	};
}

function readTutorialComplete() {
	if (typeof window === "undefined") return false;
	try {
		return window.localStorage.getItem(TUTORIAL_STORAGE_KEY) === "true";
	} catch {
		return false;
	}
}

function writeTutorialComplete(complete: boolean) {
	if (typeof window === "undefined") return;
	try {
		if (complete) window.localStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
		else window.localStorage.removeItem(TUTORIAL_STORAGE_KEY);
	} catch {
		/* Private browsing can disable localStorage without disabling gameplay. */
	}
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
