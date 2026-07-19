import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { BrandMark } from "../components/BrandMark";
import { PhaserGame } from "../components/PhaserGame";
import { GameBridge } from "../game/bridge/GameBridge";
import type { MatchStanding } from "../game/types";
import {
	RoomToSpectatorMessageSchema,
	type SpectatorSnapshot,
} from "../realtime/protocol";
import {
	createSocketUrl,
	sendSocketMessage,
} from "../realtime/websocket-client";
import { correctTimer } from "../spectator/sync";

export const Route = createFileRoute("/watch")({
	validateSearch: z.object({ room: z.string().catch("") }),
	component: SpectatorPage,
});

const SPECTATOR_MUTED_KEY = "flick-spectator-muted:v1";

function SpectatorPage() {
	const { room: rawRoom } = Route.useSearch();
	const room = rawRoom.trim().toUpperCase();
	const bridgeRef = useRef(new GameBridge());
	const socketRef = useRef<WebSocket | null>(null);
	const connectionRef = useRef("Connecting");
	const stageRef = useRef<HTMLElement>(null);
	const latestSequenceRef = useRef(-1);
	const latestSnapshotRef = useRef<SpectatorSnapshot | null>(null);
	const snapshotReceivedAtRef = useRef(0);
	const hostClockOffsetRef = useRef<number | null>(null);
	const deliveryCountRef = useRef(0);
	const rateWindowRef = useRef({ startedAt: Date.now(), count: 0 });
	const [connection, setConnection] = useState("Connecting");
	const [connectionMessage, setConnectionMessage] = useState(
		"Connecting to host display…",
	);
	const [snapshot, setSnapshot] = useState<SpectatorSnapshot | null>(null);
	const [displayedTimeMs, setDisplayedTimeMs] = useState(0);
	const [reconnectAttempt, setReconnectAttempt] = useState(0);
	const [showRetry, setShowRetry] = useState(false);
	const [muted, setMuted] = useState(true);
	const [fullscreen, setFullscreen] = useState(false);
	const [latencyMs, setLatencyMs] = useState(0);
	const [snapshotRate, setSnapshotRate] = useState(0);
	const [interpolationBufferSize, setInterpolationBufferSize] = useState(0);
	const [latencySimulationMs, setLatencySimulationMs] = useState(0);
	const [dropSnapshots, setDropSnapshots] = useState(false);
	const [pauseSnapshots, setPauseSnapshots] = useState(false);

	useEffect(() => {
		bridgeRef.current.send({ type: "set-muted", muted, persist: false });
	}, [muted]);

	useEffect(() => {
		if (readSpectatorMuted()) return;
		const restoreSoundAfterInteraction = () => {
			bridgeRef.current.send({
				type: "set-muted",
				muted: false,
				persist: false,
			});
			bridgeRef.current.send({ type: "unlock-audio" });
			setMuted(false);
			window.removeEventListener("pointerdown", restoreSoundAfterInteraction);
			window.removeEventListener("keydown", restoreSoundAfterInteraction);
		};
		window.addEventListener("pointerdown", restoreSoundAfterInteraction, {
			once: true,
		});
		window.addEventListener("keydown", restoreSoundAfterInteraction, {
			once: true,
		});
		return () => {
			window.removeEventListener("pointerdown", restoreSoundAfterInteraction);
			window.removeEventListener("keydown", restoreSoundAfterInteraction);
		};
	}, []);

	useEffect(() => {
		if (!room || typeof WebSocket === "undefined") return;
		let active = true;
		let retryTimer: number | undefined;
		let syncTimer: number | undefined;
		let pingTimer: number | undefined;
		latestSequenceRef.current = -1;
		hostClockOffsetRef.current = null;
		connectionRef.current = "Connecting";
		setConnection("Connecting");
		setConnectionMessage(
			reconnectAttempt > 0 ? "Reconnecting to host…" : "Connecting to host…",
		);
		const socket = new WebSocket(
			createSocketUrl(`/api/rooms/${room}/socket`, { role: "spectator" }),
		);
		socketRef.current = socket;

		socket.onopen = () => {
			if (!active) return;
			bridgeRef.current.send({ type: "reset-spectator-sync" });
			connectionRef.current = "Connected";
			setConnection("Connected");
			setConnectionMessage("Waiting for the host display…");
			setShowRetry(false);
			sendSocketMessage(socket, { type: "request-sync" });
			syncTimer = window.setTimeout(() => {
				if (active && latestSequenceRef.current < 0) {
					setConnectionMessage("Waiting for the host display…");
					setShowRetry(true);
				}
			}, 4_000);
			pingTimer = window.setInterval(() => {
				sendSocketMessage(socket, {
					type: "ping",
					timestamp: Date.now(),
				});
			}, 5_000);
		};

		socket.onmessage = (messageEvent) => {
			if (typeof messageEvent.data !== "string") return;
			let payload: unknown;
			try {
				payload = JSON.parse(messageEvent.data);
			} catch {
				return;
			}
			const parsed = RoomToSpectatorMessageSchema.safeParse(payload);
			if (!parsed.success) return;
			const message = parsed.data;
			if (message.type === "spectator-snapshot") {
				deliveryCountRef.current += 1;
				if (pauseSnapshots) return;
				if (dropSnapshots && deliveryCountRef.current % 3 === 0) return;
				const deliver = () => {
					if (!active || message.sequence <= latestSequenceRef.current) return;
					latestSequenceRef.current = message.sequence;
					const receivedAt = Date.now();
					const measuredOffset = receivedAt - message.hostTimestamp;
					hostClockOffsetRef.current =
						hostClockOffsetRef.current === null
							? measuredOffset
							: hostClockOffsetRef.current * 0.9 + measuredOffset * 0.1;
					const localSnapshot = {
						...message,
						hostTimestamp: message.hostTimestamp + hostClockOffsetRef.current,
					};
					latestSnapshotRef.current = localSnapshot;
					snapshotReceivedAtRef.current = receivedAt;
					bridgeRef.current.send({
						type: "apply-spectator-snapshot",
						snapshot: localSnapshot,
					});
					setSnapshot(localSnapshot);
					setDisplayedTimeMs(localSnapshot.timeRemainingMs);
					setConnectionMessage("");
					setShowRetry(false);
					const rateWindow = rateWindowRef.current;
					rateWindow.count += 1;
					const elapsed = receivedAt - rateWindow.startedAt;
					if (elapsed >= 1_000) {
						setSnapshotRate(Math.round((rateWindow.count * 1_000) / elapsed));
						rateWindowRef.current = { startedAt: receivedAt, count: 0 };
					}
				};
				if (latencySimulationMs > 0)
					window.setTimeout(deliver, latencySimulationMs);
				else deliver();
			} else if (message.type === "spectator-event") {
				bridgeRef.current.send({
					type: "apply-spectator-event",
					event: message.event,
				});
			} else if (message.type === "host-unavailable") {
				connectionRef.current = "Host unavailable";
				setConnection("Host unavailable");
				setConnectionMessage(message.message);
				setShowRetry(true);
			} else if (message.type === "pong") {
				setLatencyMs(
					Math.max(0, Math.round((Date.now() - message.timestamp) / 2)),
				);
			} else if (message.type === "error") {
				setConnectionMessage(message.message);
			}
		};

		socket.onclose = (event) => {
			if (!active) return;
			const nextConnection =
				event.code === 4001 ? "Host unavailable" : "Reconnecting";
			connectionRef.current = nextConnection;
			setConnection(nextConnection);
			setConnectionMessage(
				event.reason || "Connection lost. Reconnecting automatically…",
			);
			const delay = Math.min(8_000, 500 * 2 ** Math.min(reconnectAttempt, 4));
			if (reconnectAttempt >= 4) setShowRetry(true);
			retryTimer = window.setTimeout(
				() => setReconnectAttempt((attempt) => attempt + 1),
				delay,
			);
		};
		socket.onerror = () => {
			connectionRef.current = "Connection error";
			setConnection("Connection error");
			setConnectionMessage("Could not reach this room.");
		};

		return () => {
			active = false;
			if (retryTimer) window.clearTimeout(retryTimer);
			if (syncTimer) window.clearTimeout(syncTimer);
			if (pingTimer) window.clearInterval(pingTimer);
			socket.close();
			socketRef.current = null;
		};
	}, [
		room,
		reconnectAttempt,
		latencySimulationMs,
		dropSnapshots,
		pauseSnapshots,
	]);

	useEffect(() => {
		const timer = window.setInterval(() => {
			const latest = latestSnapshotRef.current;
			if (
				connectionRef.current !== "Connected" ||
				!latest ||
				latest.phase !== "playing"
			)
				return;
			setDisplayedTimeMs((current) =>
				correctTimer(
					current,
					latest.timeRemainingMs,
					Date.now() - snapshotReceivedAtRef.current,
				),
			);
		}, 100);
		return () => window.clearInterval(timer);
	}, []);

	useEffect(
		() =>
			bridgeRef.current.onEvent((event) => {
				if (event.type === "spectator-debug")
					setInterpolationBufferSize(event.bufferSize);
			}),
		[],
	);

	useEffect(() => {
		const updateFullscreen = () =>
			setFullscreen(document.fullscreenElement !== null);
		document.addEventListener("fullscreenchange", updateFullscreen);
		return () =>
			document.removeEventListener("fullscreenchange", updateFullscreen);
	}, []);

	function toggleSound() {
		const next = !muted;
		bridgeRef.current.send({ type: "set-muted", muted: next, persist: false });
		if (!next) bridgeRef.current.send({ type: "unlock-audio" });
		setMuted(next);
		writeSpectatorMuted(next);
	}

	async function toggleFullscreen() {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else await stageRef.current?.requestFullscreen?.();
		} catch {
			setConnectionMessage("Fullscreen is unavailable in this browser.");
		}
	}

	function retrySync() {
		if (socketRef.current?.readyState === WebSocket.OPEN) {
			latestSequenceRef.current = -1;
			bridgeRef.current.send({ type: "reset-spectator-sync" });
			sendSocketMessage(socketRef.current, { type: "request-sync" });
			setConnectionMessage("Requesting fresh game state…");
			setShowRetry(false);
		} else {
			setReconnectAttempt((attempt) => attempt + 1);
		}
	}

	if (!room)
		return (
			<main className="empty-state spectator-empty">
				<Link to="/" className="brand-mark">
					<BrandMark dark />
				</Link>
				<h1>Room code missing.</h1>
				<p>Open the Spectator Display link from the host screen.</p>
			</main>
		);

	const scores = new Map(
		snapshot?.scores.map((score) => [score.playerId, score.score]) ?? [],
	);
	const phase = snapshot?.phase ?? "lobby";
	const seconds = Math.max(0, Math.ceil(displayedTimeMs / 1000));

	return (
		<main ref={stageRef} className={`spectator-shell phase-${phase}`}>
			<header className="spectator-header">
				<div className="spectator-brand">
					<BrandMark dark />
					<span className="spectator-brand-mode">Office Mayhem</span>
				</div>
				<div className="spectator-room">
					<span>ROOM</span>
					<strong>{room}</strong>
				</div>
				<div
					className={`spectator-connection ${connection === "Connected" ? "is-connected" : ""}`}
				>
					<i />
					{connection}
				</div>
			</header>

			<section className="spectator-stage">
				<PhaserGame bridge={bridgeRef.current} mode="spectator" />
				<section className="spectator-hud" aria-label="Match status">
					<div className="spectator-scoreboard">
						{snapshot?.players.map((player) => (
							<div
								key={player.playerId}
								className={`spectator-score color-${player.color}`}
							>
								<span>P{player.playerNumber}</span>
								<strong>
									{(scores.get(player.playerId) ?? 0)
										.toString()
										.padStart(3, "0")}
								</strong>
							</div>
						))}
					</div>
					<div className="spectator-timer">
						<span>{phase === "playing" ? "TIME" : "MATCH"}</span>
						<strong>
							{phase === "playing" ? `${seconds}` : phase.toUpperCase()}
						</strong>
					</div>
				</section>

				{phase === "lobby" ? (
					<div className="spectator-lobby">
						<div>
							<span className="spectator-kicker">ROOM {room}</span>
							<h1>Waiting for host to start</h1>
							<p>
								{snapshot?.players.length
									? `${snapshot.players.length} player${snapshot.players.length === 1 ? "" : "s"} connected`
									: "Players join from the host screen"}
							</p>
						</div>
						<div className="spectator-player-grid">
							{snapshot?.players.map((player) => (
								<div
									key={player.playerId}
									className={`spectator-player-card color-${player.color}`}
								>
									<strong>P{player.playerNumber}</strong>
									<span>{player.color}</span>
									<small>{player.ready ? "READY" : "GETTING READY"}</small>
								</div>
							))}
						</div>
					</div>
				) : null}

				{phase === "results" && snapshot?.standings?.length ? (
					<SpectatorResults standings={snapshot.standings} />
				) : null}

				{connectionMessage ? (
					<aside
						className="spectator-network-overlay"
						aria-live="polite"
						aria-atomic="true"
					>
						<span>{connectionMessage}</span>
						{showRetry ? (
							<button type="button" onClick={retrySync}>
								Retry
							</button>
						) : null}
					</aside>
				) : null}
			</section>

			<nav className="spectator-controls" aria-label="Spectator controls">
				<button type="button" onClick={toggleFullscreen}>
					{fullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
				</button>
				<button type="button" onClick={toggleSound} aria-pressed={!muted}>
					{muted ? "Enable Sound" : "Mute Sound"}
				</button>
				{showRetry ? (
					<button type="button" onClick={retrySync}>
						Reconnect
					</button>
				) : null}
				{import.meta.env.DEV ? (
					<details className="spectator-debug">
						<summary>Sync tools</summary>
						<label>
							Latency
							<select
								value={latencySimulationMs}
								onChange={(event) =>
									setLatencySimulationMs(Number(event.currentTarget.value))
								}
							>
								<option value={0}>Off</option>
								<option value={50}>50 ms</option>
								<option value={150}>150 ms</option>
							</select>
						</label>
						<label>
							<input
								type="checkbox"
								checked={dropSnapshots}
								onChange={(event) =>
									setDropSnapshots(event.currentTarget.checked)
								}
							/>
							Drop every third snapshot
						</label>
						<label>
							<input
								type="checkbox"
								checked={pauseSnapshots}
								onChange={(event) =>
									setPauseSnapshots(event.currentTarget.checked)
								}
							/>
							Pause delivery
						</label>
						<button type="button" onClick={retrySync}>
							Force resync
						</button>
						<output>
							{snapshotRate} snapshots/s · sequence {latestSequenceRef.current}{" "}
							· buffer {interpolationBufferSize} · latency {latencyMs} ms
						</output>
					</details>
				) : null}
			</nav>
		</main>
	);
}

function SpectatorResults({ standings }: { standings: MatchStanding[] }) {
	const winner = standings[0];
	return (
		<div className="spectator-results">
			<span className="spectator-kicker">OFFICE MAYHEM COMPLETE</span>
			<h1>P{winner?.playerNumber} wins!</h1>
			<p>{winner?.score ?? 0} points</p>
			<ol>
				{standings.map((standing) => (
					<li key={standing.playerId} className={`color-${standing.color}`}>
						<strong>
							#{standing.rank} · P{standing.playerNumber}
						</strong>
						<span>{standing.score} pts</span>
					</li>
				))}
			</ol>
			<small>Waiting for host to start the next round</small>
		</div>
	);
}

function readSpectatorMuted() {
	if (typeof window === "undefined") return true;
	try {
		return window.localStorage.getItem(SPECTATOR_MUTED_KEY) !== "false";
	} catch {
		return true;
	}
}

function writeSpectatorMuted(muted: boolean) {
	try {
		window.localStorage.setItem(SPECTATOR_MUTED_KEY, String(muted));
	} catch {
		/* Private browsing may disable preference persistence. */
	}
}
