import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Crown,
	Maximize2,
	Minimize2,
	Play,
	Volume2,
	VolumeX,
} from "lucide-react";
import QRCode from "qrcode";
import type { Dispatch, KeyboardEvent, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { BrandMark } from "../components/BrandMark";
import { PhaserGame } from "../components/PhaserGame";
import {
	type AudioLevels,
	DEFAULT_AUDIO_LEVELS,
	playUiCue,
	readAudioPreferences,
} from "../game/audio/ArcadeAudio";
import { GameBridge } from "../game/bridge/GameBridge";
import type { GameToReactEvent } from "../game/bridge/game-events";
import {
	createSoloBot,
	createSoloBotMove,
	isSoloBot,
	playerLabel,
	SOLO_BOT_AIM_LEAD_MS,
	shouldRemoveSoloBot,
} from "../game/solo-bot";
import { buildRoundAwards, successfulThrowRate } from "../game/systems/results";
import { isLeaderBountyActive, uniqueLeaderId } from "../game/systems/scoring";
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
import { createSpectatorUrl } from "../spectator/link";

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
	const gamePanelRef = useRef<HTMLDivElement>(null);
	const phaseRef = useRef<MatchPhase>("lobby");
	const [socketState, setSocketState] = useState("Connecting");
	const [players, setPlayers] = useState<LobbyPlayer[]>([]);
	const [soloBot, setSoloBot] = useState<LobbyPlayer | null>(null);
	const [scores, setScores] = useState<Record<string, number>>({});
	const [phase, setPhase] = useState<MatchPhase>("lobby");
	const [timeRemainingMs, setTimeRemainingMs] = useState(0);
	const [standings, setStandings] = useState<MatchStanding[]>([]);
	const [qrData, setQrData] = useState("");
	const [spectatorQrData, setSpectatorQrData] = useState("");
	const [spectatorUrl, setSpectatorUrl] = useState("");
	const [spectatorCount, setSpectatorCount] = useState(0);
	const [spectatorQrOpen, setSpectatorQrOpen] = useState(false);
	const [spectatorFeedback, setSpectatorFeedback] = useState("");
	const [muted, setMuted] = useState(false);
	const [isFullscreen, setIsFullscreen] = useState(false);
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
		const nextSpectatorUrl = createSpectatorUrl(window.location.origin, room);
		setSpectatorUrl(nextSpectatorUrl);
		void QRCode.toDataURL(controllerUrl, {
			width: 180,
			margin: 1,
			color: { dark: "#c9fff1", light: "#11181d" },
		})
			.then(setQrData)
			.catch(() => setQrData(""));
		void QRCode.toDataURL(nextSpectatorUrl, {
			width: 180,
			margin: 1,
			color: { dark: "#172033", light: "#fffaf0" },
		})
			.then(setSpectatorQrData)
			.catch(() => setSpectatorQrData(""));
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
			} else if (message.type === "spectator-count") {
				setSpectatorCount(message.count);
				bridgeRef.current.send({
					type: "set-spectator-count",
					count: message.count,
				});
			} else if (message.type === "spectator-sync-request") {
				bridgeRef.current.send({
					type: "request-spectator-snapshot",
					spectatorId: message.spectatorId,
				});
			} else if (message.type === "error") {
				console.warn("Room rejected a host message:", message.message);
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
				phaseRef,
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

	useEffect(() => {
		const handleFullscreenChange = () =>
			setIsFullscreen(document.fullscreenElement === gamePanelRef.current);
		document.addEventListener("fullscreenchange", handleFullscreenChange);
		return () =>
			document.removeEventListener("fullscreenchange", handleFullscreenChange);
	}, []);

	useEffect(() => {
		if (!soloBot) return;
		const connectedHumans = players.filter((player) => player.connected);
		if (!shouldRemoveSoloBot(soloBot, connectedHumans)) return;
		bridgeRef.current.send({ type: "player-left", playerId: soloBot.playerId });
		setSoloBot(null);
	}, [players, soloBot]);

	useEffect(() => {
		if (!soloBot || phase !== "playing") return;
		let active = true;
		let timer: number | undefined;
		const takeTurn = () => {
			const move = createSoloBotMove();
			bridgeRef.current.send({
				type: "aim",
				playerId: soloBot.playerId,
				normalizedAim: move.normalizedAim,
			});
			timer = window.setTimeout(() => {
				if (!active) return;
				bridgeRef.current.send({
					type: "flick",
					playerId: soloBot.playerId,
					intensity: move.intensity,
					source: "button",
				});
				timer = window.setTimeout(takeTurn, move.delayMs);
			}, SOLO_BOT_AIM_LEAD_MS);
		};
		timer = window.setTimeout(takeTurn, 400);
		return () => {
			active = false;
			if (timer) window.clearTimeout(timer);
		};
	}, [phase, soloBot]);

	const humanConnectedPlayers = players.filter((player) => player.connected);
	const displayPlayers = soloBot
		? [...players, soloBot].sort((a, b) => a.playerNumber - b.playerNumber)
		: players;
	const connectedPlayers = displayPlayers.filter((player) => player.connected);
	const connectedPlayerKey = connectedPlayers
		.map((player) => player.playerId)
		.sort()
		.join(",");
	const leaderId = uniqueLeaderId(
		connectedPlayers.map((player) => ({
			playerId: player.playerId,
			score: scores[player.playerId] ?? 0,
		})),
	);
	const leaderPlayerNumber =
		connectedPlayers.find((player) => player.playerId === leaderId)
			?.playerNumber ?? null;
	const leaderBountyLive =
		phase === "playing" && isLeaderBountyActive(timeRemainingMs);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Connected-player membership intentionally retriggers the broadcast so controllers joining mid-round receive the current target.
	useEffect(() => {
		if (socketState !== "Connected") return;
		sendSocketMessage(socketRef.current, {
			type: "leader-state",
			leaderPlayerId: leaderId,
			leaderPlayerNumber,
			bountyActive: leaderBountyLive,
		});
	}, [
		connectedPlayerKey,
		leaderBountyLive,
		leaderId,
		leaderPlayerNumber,
		socketState,
	]);

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
		const allPlayersReady =
			connected.length > 0 && ready.length === connected.length;
		if (connected.length === 0 && !isDevelopment) return;
		if (connected.length > 0 && !allPlayersReady) return;
		if (connected.length === 1) {
			const bot = createSoloBot(connected);
			if (!bot) return;
			bridgeRef.current.send({ type: "player-joined", player: bot });
			bridgeRef.current.send({
				type: "player-ready",
				playerId: bot.playerId,
				ready: true,
			});
			setSoloBot(bot);
		}
		bridgeRef.current.send({ type: "start-match" });
	}

	function resetMatch() {
		bridgeRef.current.send({ type: "reset-match" });
		if (soloBot) {
			bridgeRef.current.send({
				type: "player-left",
				playerId: soloBot.playerId,
			});
			setSoloBot(null);
		}
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

	async function toggleFullscreen() {
		try {
			if (document.fullscreenElement === gamePanelRef.current) {
				await document.exitFullscreen();
			} else {
				await gamePanelRef.current?.requestFullscreen();
			}
		} catch {
			playUiCue("ui-error");
		}
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

	async function copySpectatorLink() {
		if (!spectatorUrl) return;
		try {
			if (navigator.clipboard?.writeText)
				await navigator.clipboard.writeText(spectatorUrl);
			else if (!copyTextFallback(spectatorUrl)) throw new Error("copy failed");
			setSpectatorFeedback("Spectator link copied");
		} catch {
			setSpectatorFeedback("Could not copy spectator link");
			playUiCue("ui-error");
		}
		window.setTimeout(() => setSpectatorFeedback(""), 2200);
	}

	function openSpectatorDisplay() {
		if (!spectatorUrl) return;
		window.open(spectatorUrl, "_blank", "noopener,noreferrer");
	}

	if (!room) return <EmptyRoom />;
	const connectedCount = humanConnectedPlayers.length;
	const readyCount = humanConnectedPlayers.filter(
		(player) => player.ready,
	).length;
	const allPlayersReady = connectedCount > 0 && readyCount === connectedCount;
	const seconds = Math.ceil(timeRemainingMs / 1000);
	const canStart =
		phase === "lobby" &&
		((connectedCount >= 1 && allPlayersReady) ||
			(isDevelopment && connectedCount === 0));
	const { startLabel, readinessCopy, readinessHeading } =
		buildLobbyPresentation({
			connectedCount,
			readyCount,
			allPlayersReady,
			isDevelopment,
		});
	const finalMoments = phase === "playing" && seconds <= 10;
	return (
		<main
			className={`host-shell phase-${phase} ${finalMoments ? "is-final-moments" : ""}`}
		>
			<header className="app-header">
				<Link to="/" className="brand-mark">
					<BrandMark />
				</Link>
				<div className="header-status">
					<span className="status-dot" /> HOST <strong>{socketState}</strong>
				</div>
				<div className="header-help">
					{phase.toUpperCase()} <span>·</span> OFFICE MAYHEM
				</div>
			</header>
			<section className="host-layout">
				<div className="game-panel" ref={gamePanelRef}>
					<div className="canvas-frame">
						<PhaserGame
							bridge={bridgeRef.current}
							allowSinglePlayer={isDevelopment}
						/>
						<section className="arena-hud" aria-label="Live match information">
							<div className="arena-room-chip">
								<span>ROOM</span>
								<strong>{room}</strong>
							</div>
							<section className="arena-scoreboard" aria-label="Scoreboard">
								{displayPlayers
									.filter((player) => player.connected)
									.map((player) => (
										<ScoreCard
											key={player.playerId}
											player={player}
											score={scores[player.playerId] ?? 0}
											isLeader={player.playerId === leaderId}
											bountyLive={leaderBountyLive}
										/>
									))}
								{connectedPlayers.length === 0 ? (
									<span className="arena-waiting-copy">
										Waiting for players
									</span>
								) : null}
							</section>
							<div className="arena-status-cluster">
								<div className="match-status">
									<span>{phase === "playing" ? "TIME" : "MATCH"}</span>
									<strong>
										{phase === "playing" ? `${seconds}s` : phase.toUpperCase()}
									</strong>
								</div>
								<div className="arena-view-controls">
									{isDevelopment && phase === "playing" ? (
										<button
											className="arena-text-button"
											type="button"
											onClick={simulateFlick}
											title="Simulate a flick"
										>
											✦ FLICK
										</button>
									) : null}
									<button
										className="arena-icon-button"
										type="button"
										onClick={toggleMuted}
										aria-pressed={muted}
										aria-label={muted ? "Turn sound on" : "Mute sound"}
										title={muted ? "Turn sound on" : "Mute sound"}
									>
										{muted ? (
											<VolumeX aria-hidden="true" />
										) : (
											<Volume2 aria-hidden="true" />
										)}
									</button>
									<button
										className="arena-icon-button"
										type="button"
										onClick={toggleFullscreen}
										aria-label={
											isFullscreen ? "Exit fullscreen" : "Enter fullscreen"
										}
										title={
											isFullscreen ? "Exit fullscreen" : "Enter fullscreen"
										}
									>
										{isFullscreen ? (
											<Minimize2 aria-hidden="true" />
										) : (
											<Maximize2 aria-hidden="true" />
										)}
									</button>
								</div>
							</div>
						</section>
						{phase === "lobby" ? (
							<section
								className="arena-lobby-control"
								aria-labelledby="round-control-title"
							>
								<div className="arena-lobby-copy" aria-live="polite">
									<strong id="round-control-title">{readinessHeading}</strong>
									<p id="round-control-guidance">{readinessCopy}</p>
								</div>
								<button
									className="simulate-button host-start-button"
									type="button"
									onClick={startMatch}
									onMouseEnter={() => playUiCue("ui-hover")}
									onFocus={() => playUiCue("ui-hover")}
									disabled={!canStart}
									aria-describedby="round-control-guidance"
								>
									<Play aria-hidden="true" />
									<span>{startLabel}</span>
								</button>
							</section>
						) : null}
						{phase === "results" ? (
							<ResultsOverlay
								standings={standings}
								onPlayAgain={playAgain}
								onBackToLobby={resetMatch}
							/>
						) : null}
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
						<strong className="qr-label">Controller QR</strong>
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
						<StatusRow
							label="SPECTATOR DISPLAYS"
							value={spectatorCount.toString()}
							active={spectatorCount > 0}
						/>
					</div>
					<div className="lobby-summary">
						<strong>Players</strong>
						<span>
							{connectedCount} {connectedCount === 1 ? "phone" : "phones"} ·{" "}
							{readyCount} ready{soloBot ? " · Bot active" : ""}
						</span>
					</div>
					<div className="lobby-players">
						{displayPlayers.map((player) => (
							<LobbyRow
								key={player.playerId}
								player={player}
								score={scores[player.playerId] ?? 0}
							/>
						))}
						{displayPlayers.length === 0 ? (
							<p className="rail-hint">
								Waiting for a player. One ready phone can play against the bot.
							</p>
						) : null}
					</div>
					<section
						className="spectator-share"
						aria-labelledby="spectator-title"
					>
						<div className="spectator-share-heading">
							<div>
								<span className="panel-label">PUBLIC SCREEN</span>
								<h2 id="spectator-title">Spectator Display</h2>
							</div>
							<strong>{spectatorCount}</strong>
						</div>
						<p>
							Open this read-only view on a television, projector, or second
							laptop.
						</p>
						<div className="spectator-share-actions">
							<button
								className="secondary-host-button"
								type="button"
								onClick={copySpectatorLink}
								aria-label="Copy Spectator Link"
							>
								Copy Spectator Link
							</button>
							<button
								className="secondary-host-button"
								type="button"
								onClick={openSpectatorDisplay}
								aria-label="Open Spectator Display in a new tab"
							>
								Open Spectator Display
							</button>
							<button
								className="secondary-host-button"
								type="button"
								onClick={() => setSpectatorQrOpen((open) => !open)}
								aria-expanded={spectatorQrOpen}
								aria-controls="spectator-qr"
							>
								{spectatorQrOpen ? "Hide Spectator QR" : "Show Spectator QR"}
							</button>
						</div>
						<output className="spectator-feedback" aria-live="polite">
							{spectatorFeedback}
						</output>
						{spectatorQrOpen ? (
							<div className="spectator-qr" id="spectator-qr">
								<strong>Spectator QR</strong>
								{spectatorQrData ? (
									<img
										src={spectatorQrData}
										alt={`Spectator QR code for room ${room}`}
									/>
								) : (
									<div className="qr-fallback">QR</div>
								)}
							</div>
						) : null}
					</section>
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
				</aside>
			</section>
		</main>
	);
}

function buildLobbyPresentation({
	connectedCount,
	readyCount,
	allPlayersReady,
	isDevelopment,
}: {
	connectedCount: number;
	readyCount: number;
	allPlayersReady: boolean;
	isDevelopment: boolean;
}) {
	if (connectedCount === 0)
		return isDevelopment
			? {
					startLabel: "Start Round",
					readinessHeading: "Start when ready",
					readinessCopy: "Start now or wait for more players to join.",
				}
			: {
					startLabel: "Need a Player",
					readinessHeading: "Waiting for players",
					readinessCopy: "Waiting for players. Scan the QR code to join.",
				};
	if (!allPlayersReady)
		return {
			startLabel: `Waiting for ${connectedCount - readyCount}`,
			readinessHeading: `${readyCount} of ${connectedCount} ready`,
			readinessCopy:
				connectedCount === 1
					? "Ready up to play solo against the bot."
					: `${readyCount} of ${connectedCount} players ready.`,
		};
	if (connectedCount === 1)
		return {
			startLabel: "Start vs Bot",
			readinessHeading: "Solo match ready",
			readinessCopy:
				"Ready to face the office bot. A second phone can still join instead.",
		};
	return {
		startLabel: "Start Round",
		readinessHeading: "Room ready",
		readinessCopy: "Everyone’s ready. Start when the room is watching.",
	};
}

function handleGameEvent(
	event: GameToReactEvent,
	socketRef: { current: WebSocket | null },
	phaseRef: { current: MatchPhase },
	setPhase: (phase: MatchPhase) => void,
	setTimeRemainingMs: (value: number) => void,
	setScores: Dispatch<SetStateAction<Record<string, number>>>,
	setStandings: (value: MatchStanding[]) => void,
) {
	if (event.type === "spectator-snapshot") {
		sendSocketMessage(socketRef.current, event.snapshot);
	} else if (event.type === "spectator-presentation") {
		sendSocketMessage(socketRef.current, {
			type: "spectator-event",
			event: event.event,
		});
	} else if (event.type === "phase-changed") {
		phaseRef.current = event.phase;
		setPhase(event.phase);
		sendSocketMessage(socketRef.current, {
			type: "match-state",
			phase: event.phase,
		});
	} else if (event.type === "timer-changed") {
		setTimeRemainingMs(event.timeRemainingMs);
		// The scene emits this once per second; relay it with the current
		// phase so controllers tick their timer without inferring phase from
		// magic timer values (which broke Back to Lobby).
		sendSocketMessage(socketRef.current, {
			type: "match-state",
			phase: phaseRef.current,
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
			bankShot: event.bankShot,
			leaderBounty: event.leaderBounty,
		});
		sendSocketMessage(socketRef.current, {
			type: "player-hit",
			attackerPlayerId: event.attackerPlayerId,
			targetPlayerId: event.targetPlayerId,
		});
	} else if (event.type === "prop-hit" && isUuid(event.playerId)) {
		sendSocketMessage(socketRef.current, {
			type: "prop-hit-confirmed",
			playerId: event.playerId,
			propType: event.propType,
			score: event.score,
			destroyed: event.destroyed,
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

function copyTextFallback(value: string) {
	const input = document.createElement("textarea");
	input.value = value;
	input.setAttribute("readonly", "");
	input.style.position = "fixed";
	input.style.opacity = "0";
	document.body.appendChild(input);
	input.select();
	try {
		return document.execCommand("copy");
	} finally {
		input.remove();
	}
}

function ScoreCard({
	player,
	score,
	isLeader,
	bountyLive,
}: {
	player: LobbyPlayer;
	score: number;
	isLeader: boolean;
	bountyLive: boolean;
}) {
	return (
		<div
			className={`score-card color-${player.color} ${isLeader ? "is-leader" : ""}`}
		>
			<span className="score-card-player">{playerLabel(player)}</span>
			<strong>{score.toString().padStart(3, "0")}</strong>
			{isLeader ? (
				<span className="leader-badge">
					<Crown aria-hidden="true" />
					{bountyLive ? "TARGET +25" : "LEADER"}
				</span>
			) : null}
		</div>
	);
}

function LobbyRow({ player, score }: { player: LobbyPlayer; score: number }) {
	const bot = isSoloBot(player.playerId);
	return (
		<div className={`lobby-row color-${player.color}`}>
			<span className="player-badge">
				{bot ? "AI" : `P${player.playerNumber}`}
			</span>
			<div>
				<strong>
					{bot ? "OFFICE BOT" : `${player.color.toUpperCase()} PLAYER`}
				</strong>
				<small>
					{bot
						? "CASUAL CPU · READY"
						: player.connected
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
	const winners = standings.filter((standing) => standing.rank === 1);
	const sharedWin = winners.length > 1;
	const winnerLabel = winners
		.map((standing) => playerLabel(standing))
		.join(" + ");
	const awards = buildRoundAwards(standings);
	const nextPlace = standings.find((standing) => standing.rank > 1);
	const scoreGap = Math.max(0, (winner?.score ?? 0) - (nextPlace?.score ?? 0));
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
					<span>{sharedWin ? "TIE" : winner ? playerLabel(winner) : ""}</span>
				</div>
				<div className="results-confetti" aria-hidden="true">
					{CONFETTI_PIECES.map((piece) => (
						<i key={piece} />
					))}
				</div>
				<span className="results-kicker">OFFICE MAYHEM COMPLETE</span>
				<h2 id="results-title">
					{sharedWin
						? `${winnerLabel} share the office`
						: `${winnerLabel} wins the office`}
				</h2>
				<p className="results-score">{winner?.score ?? 0} points</p>
				{sharedWin ? (
					<p className="results-rematch-copy">
						Shared top score — run it back to settle the office.
					</p>
				) : nextPlace ? (
					<p className="results-rematch-copy">
						Only {scoreGap} points separated {winnerLabel} and{" "}
						{playerLabel(nextPlace)}.
					</p>
				) : null}
				<ol className="results-list" aria-label="Final ranking">
					{standings.map((standing) => (
						<li
							key={standing.playerId}
							className={`result-row color-${standing.color}`}
						>
							<strong>
								#{standing.rank} · {playerLabel(standing)}
							</strong>
							<span>{standing.score} pts</span>
							<small>
								{standing.playerHits}{" "}
								{standing.playerHits === 1 ? "hit" : "hits"} ·{" "}
								{standing.propsDestroyed} smashed ·{" "}
								{Math.round(successfulThrowRate(standing) * 100)}% connected
							</small>
						</li>
					))}
				</ol>
				{awards.length ? (
					<section className="results-highlights" aria-label="Round highlights">
						{awards.map((award) => (
							<div
								key={`${award.label}-${award.playerId}`}
								className={`result-award color-${award.color}`}
							>
								<span>{playerLabel(award)}</span>
								<strong>{award.label}</strong>
								<small>{award.detail}</small>
							</div>
						))}
					</section>
				) : null}
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
				<BrandMark />
			</Link>
			<h1>Create a game first.</h1>
			<Link to="/" className="text-link">
				Back home
			</Link>
		</main>
	);
}
