import { createFileRoute, Link } from "@tanstack/react-router";
import QRCode from "qrcode";
import type { Dispatch, KeyboardEvent, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { PhaserGame } from "../components/PhaserGame";
import {
	type AudioLevels,
	DEFAULT_AUDIO_LEVELS,
	playUiCue,
	readAudioPreferences,
} from "../game/audio/ArcadeAudio";
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
const CONFETTI_PIECES = [
	"c1",
	"c2",
	"c3",
	"c4",
	"c5",
	"c6",
	"c7",
	"c8",
	"c9",
	"c10",
	"c11",
	"c12",
	"c13",
	"c14",
	"c15",
	"c16",
	"c17",
	"c18",
] as const;

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
	const [muted, setMuted] = useState(false);
	const [reconnectAttempt, setReconnectAttempt] = useState(0);
	const [audioLevels, setAudioLevels] = useState<AudioLevels>({
		...DEFAULT_AUDIO_LEVELS,
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: Socket retry is keyed by room and reconnect attempt; upsertPlayer only uses stable state setters.
	useEffect(() => {
		if (!room || typeof WebSocket === "undefined") return;
		let active = true;
		let retryTimer: number | undefined;
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
							type: "player-motion-status",
							playerId: player.playerId,
							enabled: player.motionEnabled,
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
				} else if (input.type === "motion-status") {
					setPlayers((current) =>
						current.map((player) =>
							player.playerId === message.playerId
								? { ...player, motionEnabled: input.enabled }
								: player,
						),
					);
					bridgeRef.current.send({
						type: "player-motion-status",
						playerId: message.playerId,
						enabled: input.enabled,
					});
				} else if (input.type === "aim") {
					bridgeRef.current.send({
						type: "aim",
						playerId: message.playerId,
						normalizedAim: input.normalizedAim,
					});
				} else if (input.type === "flick") {
					bridgeRef.current.send({
						type: "flick",
						playerId: message.playerId,
						intensity: input.intensity,
						source: input.source,
					});
				}
			}
		};
		socket.onclose = () => {
			if (!active) return;
			setSocketState("Reconnecting");
			retryTimer = window.setTimeout(
				() => setReconnectAttempt((attempt) => attempt + 1),
				650,
			);
		};
		socket.onerror = () => {
			setSocketState("Error");
			playUiCue("ui-error");
		};
		return () => {
			active = false;
			if (retryTimer) window.clearTimeout(retryTimer);
			socket.close();
			socketRef.current = null;
		};
	}, [room, reconnectAttempt]);

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

	useEffect(() => {
		const preferences = readAudioPreferences();
		setMuted(preferences.muted);
		setAudioLevels(preferences.levels);
		bridgeRef.current.send({ type: "set-muted", muted: preferences.muted });
		bridgeRef.current.send({
			type: "set-audio-levels",
			levels: preferences.levels,
		});
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
						: {
								...player,
								ready: false,
								motionEnabled: false,
								connected: true,
							},
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
		const hasEnoughPlayers = isDevelopment || connected.length >= 2;
		const allPlayersReady =
			connected.length < 2 || ready.length === connected.length;
		if (!hasEnoughPlayers || !allPlayersReady) return;
		bridgeRef.current.send({ type: "start-match" });
	}

	function resetMatch() {
		bridgeRef.current.send({ type: "reset-match" });
		setStandings([]);
	}

	function playAgain() {
		bridgeRef.current.send({ type: "reset-match" });
		setStandings([]);
		bridgeRef.current.send({ type: "start-match" });
	}

	function toggleMuted() {
		const next = !muted;
		setMuted(next);
		bridgeRef.current.send({ type: "set-muted", muted: next });
	}

	function updateAudioLevel(key: keyof AudioLevels, value: number) {
		const next = { ...audioLevels, [key]: value };
		setAudioLevels(next);
		bridgeRef.current.send({ type: "set-audio-levels", levels: next });
	}

	function simulateFlick() {
		bridgeRef.current.send({
			type: "flick",
			playerId:
				players.find((player) => player.connected)?.playerId ?? "keyboard-p1",
			intensity: 0.8,
			source: "button",
		});
	}

	if (!room) return <EmptyRoom />;
	const connectedPlayers = players.filter((player) => player.connected);
	const connectedCount = connectedPlayers.length;
	const readyCount = connectedPlayers.filter((player) => player.ready).length;
	const allPlayersReady = connectedCount > 0 && readyCount === connectedCount;
	const seconds = Math.ceil(timeRemainingMs / 1000);
	const canStart =
		phase === "lobby" &&
		(isDevelopment
			? connectedCount < 2 || allPlayersReady
			: connectedCount >= 2 && allPlayersReady);
	const startLabel =
		isDevelopment && connectedCount < 2
			? "Start Demo Round"
			: connectedCount < 2
				? "Need 2 Players"
				: !allPlayersReady
					? `Waiting for ${connectedCount - readyCount}`
					: "Start Round";
	const readinessCopy =
		connectedCount === 0
			? "Waiting for players. Scan the QR code to join."
			: connectedCount < 2
				? "One more player is needed for a full match."
				: allPlayersReady
					? "Everyone’s ready. Start when the room is watching."
					: `${readyCount} of ${connectedCount} players ready.`;
	const finalMoments = phase === "playing" && seconds <= 10;

	return (
		<main className={`host-shell ${finalMoments ? "is-final-moments" : ""}`}>
			<header className="app-header">
				<Link to="/" className="brand-mark">
					<span className="brand-dot" />
					FLICK
				</Link>
				<div className="header-status">
					<span className="status-dot" /> HOST <strong>{socketState}</strong>
				</div>
				<div className="header-help">
					{phase.toUpperCase()} <span>·</span> OFFICE MAYHEM
				</div>
				<button
					className="sound-toggle"
					type="button"
					onClick={toggleMuted}
					onMouseEnter={() => playUiCue("ui-hover")}
					onFocus={() => playUiCue("ui-hover")}
					aria-pressed={muted}
					aria-label={muted ? "Turn sound on" : "Mute sound"}
				>
					{muted ? "Sound off" : "Sound on"}
				</button>
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
						{phase === "results" ? (
							<ResultsOverlay
								standings={standings}
								onPlayAgain={playAgain}
								onBackToLobby={resetMatch}
							/>
						) : null}
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
					<div className="host-actions">
						{phase === "lobby" ? (
							<button
								className="simulate-button"
								type="button"
								onClick={startMatch}
								onMouseEnter={() => playUiCue("ui-hover")}
								onFocus={() => playUiCue("ui-hover")}
								disabled={!canStart}
							>
								{startLabel}
							</button>
						) : null}
						{isDevelopment ? (
							<button
								className="secondary-host-button"
								type="button"
								onClick={simulateFlick}
								onMouseEnter={() => playUiCue("ui-hover")}
								onFocus={() => playUiCue("ui-hover")}
								disabled={phase !== "playing"}
							>
								✦ Simulate Flick
							</button>
						) : null}
					</div>
					<details className="audio-settings">
						<summary>Audio mix</summary>
						{(["master", "music", "effects"] as const).map((key) => (
							<label key={key}>
								<span>{key}</span>
								<input
									type="range"
									min="0"
									max="1"
									step="0.05"
									value={audioLevels[key]}
									onChange={(event) =>
										updateAudioLevel(key, Number(event.currentTarget.value))
									}
								/>
							</label>
						))}
					</details>
					<p className="rail-hint">{readinessCopy}</p>
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
			practice: false,
		});
	} else if (event.type === "practice-throw" && isUuid(event.playerId)) {
		sendSocketMessage(socketRef.current, {
			type: "flick-accepted",
			playerId: event.playerId,
			projectileType: event.projectileType,
			practice: true,
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
						? `${player.motionEnabled ? "PHYSICAL FLICK" : "BUTTON THROW"} · ${player.ready ? "READY" : "NOT READY"}`
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

function ResultsOverlay({
	standings,
	onPlayAgain,
	onBackToLobby,
}: {
	standings: MatchStanding[];
	onPlayAgain: () => void;
	onBackToLobby: () => void;
}) {
	const dialogRef = useRef<HTMLDivElement>(null);
	const primaryActionRef = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		const previouslyFocused = document.activeElement as HTMLElement | null;
		primaryActionRef.current?.focus();
		return () => previouslyFocused?.focus();
	}, []);

	function trapDialogFocus(event: KeyboardEvent<HTMLDivElement>) {
		if (event.key !== "Tab") return;
		const controls = Array.from(
			dialogRef.current?.querySelectorAll<HTMLButtonElement>(
				"button:not(:disabled)",
			) ?? [],
		);
		const first = controls[0];
		const last = controls.at(-1);
		if (!first || !last) return;
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	if (standings.length === 0) return null;
	const winner = standings[0];
	return (
		<div
			ref={dialogRef}
			className="results-overlay"
			role="dialog"
			aria-modal="true"
			aria-labelledby="results-title"
			onKeyDown={trapDialogFocus}
		>
			<div className="results-sheet">
				<div
					className={`winner-mascot color-${winner?.color ?? "blue"}`}
					aria-hidden="true"
				>
					<span>P{winner?.playerNumber}</span>
				</div>
				<div className="results-confetti" aria-hidden="true">
					{CONFETTI_PIECES.map((piece) => (
						<i key={piece} />
					))}
				</div>
				<span className="results-kicker">OFFICE MAYHEM COMPLETE</span>
				<h2 id="results-title">P{winner?.playerNumber} wins the office</h2>
				<p className="results-score">{winner?.score ?? 0} points</p>
				<ol className="results-list" aria-label="Final ranking">
					{standings.map((standing) => (
						<li
							key={standing.playerId}
							className={`result-row color-${standing.color}`}
						>
							<strong>
								#{standing.rank} · P{standing.playerNumber}
							</strong>
							<span>{standing.score} pts</span>
							<small>
								{standing.playerHits} hits · {standing.propsDestroyed} props ·{" "}
								{standing.throws} throws
							</small>
						</li>
					))}
				</ol>
				<div className="results-actions">
					<button
						ref={primaryActionRef}
						type="button"
						className="simulate-button"
						onClick={onPlayAgain}
						onMouseEnter={() => playUiCue("ui-hover")}
						onFocus={() => playUiCue("ui-hover")}
					>
						Play Again
					</button>
					<button
						type="button"
						className="secondary-host-button"
						onClick={onBackToLobby}
						onMouseEnter={() => playUiCue("ui-hover")}
						onFocus={() => playUiCue("ui-hover")}
					>
						Back to Lobby
					</button>
				</div>
			</div>
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
