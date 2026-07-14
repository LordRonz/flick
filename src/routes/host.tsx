import { createFileRoute, Link } from "@tanstack/react-router";
import QRCode from "qrcode";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { PhaserGame } from "../components/PhaserGame";
import { GameBridge } from "../game/bridge/GameBridge";
import type { GameToReactEvent } from "../game/bridge/game-events";
import type {
	LobbyPlayer,
	MatchPhase,
	MatchStanding,
	PlayerAssignment,
} from "../game/types";
import { RoomToHostMessageSchema } from "../realtime/protocol";
import {
	createSocketUrl,
	sendSocketMessage,
} from "../realtime/websocket-client";

export const Route = createFileRoute("/host")({
	validateSearch: z.object({ room: z.string().catch("") }),
	component: HostPage,
});

const isDevelopment = import.meta.env.DEV;

function HostPage() {
	const { room } = Route.useSearch();
	const bridgeRef = useRef(new GameBridge());
	const socketRef = useRef<WebSocket | null>(null);
	const [socketState, setSocketState] = useState("Connecting");
	const [players, setPlayers] = useState<LobbyPlayer[]>([]);
	const [scores, setScores] = useState<Record<string, number>>({});
	const [phase, setPhase] = useState<MatchPhase>("lobby");
	const [timeRemainingMs, setTimeRemainingMs] = useState(0);
	const [standings, setStandings] = useState<MatchStanding[]>([]);
	const [qrData, setQrData] = useState("");

	// biome-ignore lint/correctness/useExhaustiveDependencies: The socket lifecycle is keyed by room; upsertPlayer only uses stable state setters.
	useEffect(() => {
		if (!room || typeof WebSocket === "undefined") return;
		const controllerUrl = `${window.location.origin}/controller?room=${encodeURIComponent(room)}`;
		void QRCode.toDataURL(controllerUrl, {
			width: 180,
			margin: 1,
			color: { dark: "#c9fff1", light: "#11181d" },
		})
			.then(setQrData)
			.catch(() => setQrData(""));
		const socket = new WebSocket(
			createSocketUrl(`/api/rooms/${room}/socket`, { role: "host" }),
		);
		socketRef.current = socket;
		socket.onopen = () => setSocketState("Connected");
		socket.onmessage = (event) => {
			if (typeof event.data !== "string") return;
			let payload: unknown;
			try {
				payload = JSON.parse(event.data);
			} catch {
				return;
			}
			const parsed = RoomToHostMessageSchema.safeParse(payload);
			if (!parsed.success) return;
			const message = parsed.data;
			if (message.type === "player-connected") {
				upsertPlayer(message.player);
				bridgeRef.current.send({
					type: "player-joined",
					player: message.player,
				});
			} else if (message.type === "player-disconnected") {
				setPlayers((current) =>
					current.map((player) =>
						player.playerId === message.playerId
							? { ...player, connected: false, ready: false }
							: player,
					),
				);
				bridgeRef.current.send({
					type: "player-left",
					playerId: message.playerId,
				});
			} else if (message.type === "lobby-state") {
				setPlayers(message.players);
				for (const player of message.players) {
					if (player.connected) {
						bridgeRef.current.send({ type: "player-joined", player });
						bridgeRef.current.send({
							type: "player-ready",
							playerId: player.playerId,
							ready: player.ready,
						});
						bridgeRef.current.send({
							type: "player-calibration",
							playerId: player.playerId,
							calibrated: player.calibrated,
						});
					} else {
						bridgeRef.current.send({
							type: "player-left",
							playerId: player.playerId,
						});
					}
				}
			} else if (message.type === "controller-input") {
				const input = message.input;
				if (input.type === "ready") {
					setPlayers((current) =>
						current.map((player) =>
							player.playerId === message.playerId
								? { ...player, ready: input.ready }
								: player,
						),
					);
					bridgeRef.current.send({
						type: "player-ready",
						playerId: message.playerId,
						ready: input.ready,
					});
				} else if (input.type === "calibration-status") {
					setPlayers((current) =>
						current.map((player) =>
							player.playerId === message.playerId
								? { ...player, calibrated: input.calibrated }
								: player,
						),
					);
					bridgeRef.current.send({
						type: "player-calibration",
						playerId: message.playerId,
						calibrated: input.calibrated,
					});
				} else if (input.type === "orientation") {
					bridgeRef.current.send({
						type: "orientation",
						playerId: message.playerId,
						normalizedX: input.normalizedX,
					});
				} else if (input.type === "flick") {
					bridgeRef.current.send({
						type: "flick",
						playerId: message.playerId,
						intensity: input.intensity,
					});
				}
			}
		};
		socket.onclose = () => setSocketState("Disconnected");
		socket.onerror = () => setSocketState("Error");
		return () => {
			socket.close();
			socketRef.current = null;
		};
	}, [room]);

	useEffect(() => {
		return bridgeRef.current.onEvent((event) =>
			handleGameEvent(
				event,
				socketRef,
				setPhase,
				setTimeRemainingMs,
				setScores,
				setStandings,
			),
		);
	}, []);

	function upsertPlayer(player: LobbyPlayer | PlayerAssignment) {
		setPlayers((current) => {
			const existing = current.find(
				(candidate) => candidate.playerId === player.playerId,
			);
			if (!existing)
				return [
					...current,
					"ready" in player
						? player
						: { ...player, ready: false, calibrated: false, connected: true },
				].sort((a, b) => a.playerNumber - b.playerNumber);
			return current.map((candidate) =>
				candidate.playerId === player.playerId
					? { ...candidate, ...player, connected: true }
					: candidate,
			);
		});
	}

	function startMatch() {
		const connected = players.filter((player) => player.connected);
		const ready = connected.filter((player) => player.ready);
		if (!isDevelopment && (connected.length < 2 || ready.length < 2)) return;
		if (
			isDevelopment &&
			connected.length > 0 &&
			connected.length < 2 &&
			ready.length === 0
		) {
			bridgeRef.current.send({ type: "start-match" });
			return;
		}
		if (connected.length >= 2 && ready.length < 2) return;
		bridgeRef.current.send({ type: "start-match" });
	}

	function resetMatch() {
		bridgeRef.current.send({ type: "reset-match" });
		setStandings([]);
	}

	function simulateFlick() {
		bridgeRef.current.send({
			type: "flick",
			playerId:
				players.find((player) => player.connected)?.playerId ?? "keyboard-p1",
			intensity: 0.8,
		});
	}

	if (!room) return <EmptyRoom />;
	const connectedCount = players.filter((player) => player.connected).length;
	const seconds = Math.ceil(timeRemainingMs / 1000);
	const canStart = phase === "lobby" || phase === "results";

	return (
		<main className="host-shell">
			<header className="app-header">
				<Link to="/" className="brand-mark">
					<span className="brand-dot" />
					FLICK
				</Link>
				<div className="header-status">
					<span className="status-dot" /> HOST <strong>{socketState}</strong>
				</div>
				<div className="header-help">
					{phase.toUpperCase()} <span>·</span> ARROWS / SPACE DEBUG
				</div>
			</header>
			<section className="host-layout">
				<div className="game-panel">
					<div className="game-panel-header">
						<div>
							<span className="panel-label">ROOM</span>
							<strong>{room}</strong>
						</div>
						<div className="match-status">
							<span className="panel-label">
								{phase === "playing" ? "TIME" : "MATCH"}
							</span>
							<strong>
								{phase === "playing" ? `${seconds}s` : phase.toUpperCase()}
							</strong>
						</div>
					</div>
					<div className="canvas-frame">
						<PhaserGame
							bridge={bridgeRef.current}
							allowSinglePlayer={isDevelopment}
						/>
					</div>
					<div className="scoreboard-strip">
						{players
							.filter((player) => player.connected)
							.map((player) => (
								<ScoreCard
									key={player.playerId}
									player={player}
									score={scores[player.playerId] ?? 0}
								/>
							))}
						{connectedCount === 0 ? (
							<span className="empty-lobby-copy">
								Scan the QR code to take a station.
							</span>
						) : null}
					</div>
					<div className="game-footer">
						<span>OBJECTIVE: OUTSCORE THE OFFICE</span>
						<span>60 SECOND LOCAL BATTLE</span>
					</div>
				</div>
				<aside className="host-rail">
					<div className="rail-heading">
						<div>
							<span className="panel-label">JOIN THE ARENA</span>
							<h1>Flick your way in.</h1>
						</div>
						<span className="connection-count">
							{connectedCount.toString().padStart(2, "0")} / 04
						</span>
					</div>
					<div className="qr-wrap">
						{qrData ? (
							<img src={qrData} alt={`QR code to join room ${room}`} />
						) : (
							<div className="qr-fallback">QR</div>
						)}
						<p>Scan with an iPhone or Android camera</p>
					</div>
					<div className="rail-list">
						<StatusRow label="ROOM CODE" value={room} accent />
						<StatusRow
							label="HOST"
							value={socketState}
							active={socketState === "Connected"}
						/>
						<StatusRow
							label="PHASE"
							value={phase.toUpperCase()}
							active={phase === "playing"}
						/>
					</div>
					<div className="lobby-players">
						{players.map((player) => (
							<LobbyRow
								key={player.playerId}
								player={player}
								score={scores[player.playerId] ?? 0}
							/>
						))}
						{players.length === 0 ? (
							<p className="rail-hint">
								Waiting for players. A game needs two ready phones.
							</p>
						) : null}
					</div>
					{phase === "results" ? <Results standings={standings} /> : null}
					<div className="host-actions">
						<button
							className="simulate-button"
							type="button"
							onClick={startMatch}
							disabled={!canStart}
						>
							{isDevelopment && connectedCount < 2
								? "Start Demo Round"
								: "Start Round"}
						</button>
						{isDevelopment ? (
							<button
								className="secondary-host-button"
								type="button"
								onClick={simulateFlick}
								disabled={phase !== "playing"}
							>
								✦ Simulate Flick
							</button>
						) : null}
						{phase === "results" ? (
							<button
								className="secondary-host-button"
								type="button"
								onClick={resetMatch}
							>
								Play Again
							</button>
						) : null}
					</div>
					<p className="rail-hint">
						{isDevelopment
							? "Dev mode: keyboard fallback and one-player demo are enabled."
							: "Players must enable motion, calibrate, and mark ready before the round can start."}
					</p>
				</aside>
			</section>
		</main>
	);
}

function handleGameEvent(
	event: GameToReactEvent,
	socketRef: { current: WebSocket | null },
	setPhase: (phase: MatchPhase) => void,
	setTimeRemainingMs: (value: number) => void,
	setScores: Dispatch<SetStateAction<Record<string, number>>>,
	setStandings: (value: MatchStanding[]) => void,
) {
	if (event.type === "phase-changed") {
		setPhase(event.phase);
		sendSocketMessage(socketRef.current, {
			type: "match-state",
			phase: event.phase,
		});
	} else if (event.type === "timer-changed") {
		setTimeRemainingMs(event.timeRemainingMs);
		if (event.timeRemainingMs === 60_000 || event.timeRemainingMs === 0)
			sendSocketMessage(socketRef.current, {
				type: "match-state",
				phase: event.timeRemainingMs === 0 ? "results" : "playing",
				timeRemainingMs: event.timeRemainingMs,
			});
	} else if (event.type === "score-changed") {
		setScores((current) => ({ ...current, [event.playerId]: event.score }));
		if (isUuid(event.playerId))
			sendSocketMessage(socketRef.current, {
				type: "score-update",
				playerId: event.playerId,
				score: event.score,
			});
	} else if (event.type === "projectile-thrown" && isUuid(event.playerId)) {
		sendSocketMessage(socketRef.current, {
			type: "flick-accepted",
			playerId: event.playerId,
			projectileType: event.projectileType,
		});
	} else if (
		event.type === "player-hit" &&
		isUuid(event.attackerPlayerId) &&
		isUuid(event.targetPlayerId)
	) {
		sendSocketMessage(socketRef.current, {
			type: "hit-confirmed",
			attackerPlayerId: event.attackerPlayerId,
			targetPlayerId: event.targetPlayerId,
			score: event.score,
		});
		sendSocketMessage(socketRef.current, {
			type: "player-hit",
			attackerPlayerId: event.attackerPlayerId,
			targetPlayerId: event.targetPlayerId,
		});
	} else if (event.type === "prop-destroyed" && isUuid(event.playerId)) {
		sendSocketMessage(socketRef.current, {
			type: "prop-destroyed",
			playerId: event.playerId,
			propType: event.propType,
			score: event.score,
		});
	} else if (event.type === "match-ended") {
		setStandings(event.standings);
		sendSocketMessage(socketRef.current, {
			type: "round-result",
			standings: event.standings.filter((standing) =>
				isUuid(standing.playerId),
			),
		});
	}
}

function isUuid(value: string) {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		value,
	);
}

function ScoreCard({ player, score }: { player: LobbyPlayer; score: number }) {
	return (
		<div className={`score-card color-${player.color}`}>
			<span>P{player.playerNumber}</span>
			<strong>{score.toString().padStart(3, "0")}</strong>
		</div>
	);
}

function LobbyRow({ player, score }: { player: LobbyPlayer; score: number }) {
	return (
		<div className={`lobby-row color-${player.color}`}>
			<span className="player-badge">P{player.playerNumber}</span>
			<div>
				<strong>{player.color.toUpperCase()} PLAYER</strong>
				<small>
					{player.connected
						? player.calibrated
							? "CALIBRATED"
							: "CONNECTED"
						: "RECONNECTING"}
				</small>
			</div>
			<span className="lobby-score">{score}</span>
			<i
				className={
					player.ready && player.connected ? "ready-dot is-ready" : "ready-dot"
				}
			/>
		</div>
	);
}

function Results({ standings }: { standings: MatchStanding[] }) {
	if (standings.length === 0) return null;
	return (
		<div className="results-card">
			<span className="panel-label">FINAL RANKING</span>
			{standings.map((standing) => (
				<div key={standing.playerId} className="result-row">
					<strong>
						#{standing.rank} P{standing.playerNumber}
					</strong>
					<span>
						{standing.score} pts · {standing.playerHits} hits ·{" "}
						{standing.propsDestroyed} props
					</span>
				</div>
			))}
		</div>
	);
}

function StatusRow({
	label,
	value,
	active = false,
	accent = false,
}: {
	label: string;
	value: string;
	active?: boolean;
	accent?: boolean;
}) {
	return (
		<div className="status-row">
			<span>{label}</span>
			<strong
				className={`${active ? "is-active" : ""} ${accent ? "is-accent" : ""}`}
			>
				<i />
				{value}
			</strong>
		</div>
	);
}

function EmptyRoom() {
	return (
		<main className="empty-state">
			<Link to="/" className="brand-mark">
				<span className="brand-dot" />
				FLICK
			</Link>
			<h1>Create a game first.</h1>
			<Link to="/" className="text-link">
				Back home
			</Link>
		</main>
	);
}
