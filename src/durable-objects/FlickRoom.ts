import { DurableObject } from "cloudflare:workers";
import type { FlickEnv } from "../cloudflare-env";
import type {
	LobbyPlayer,
	PlayerAssignment,
	PlayerNumber,
} from "../game/types";
import { isFreshInputTimestamp } from "../realtime/input-validation";
import {
	colorForPlayerNumber,
	findFirstFreePlayerNumber,
} from "../realtime/player-slots";
import {
	type ControllerMessage,
	ControllerMessageSchema,
	type HostToRoomMessage,
	HostToRoomMessageSchema,
	MAX_HOST_MESSAGE_BYTES,
	MAX_MESSAGE_BYTES,
	parseJsonMessage,
	type RoomToHostMessage,
	SpectatorToRoomMessageSchema,
} from "../realtime/protocol";
import {
	canAcceptSpectator,
	MAX_SPECTATORS,
} from "../realtime/spectator-policy";

const MAX_CONTROLLERS = 4;
export { MAX_SPECTATORS };
const RECONNECT_GRACE_MS = 15_000;
const CLOSE_HOST_LEFT = 4001;

type ConnectionAttachment =
	| { role: "host"; connectedAt: number }
	| {
			role: "controller";
			sessionId: string;
			player: PlayerAssignment;
			connectedAt: number;
	  }
	| {
			role: "spectator";
			spectatorId: string;
			connectedAt: number;
	  };

type StoredPlayerSession = {
	player: PlayerAssignment;
	ready: boolean;
	motionEnabled: boolean;
	disconnectedAt?: number;
};

export class FlickRoom extends DurableObject {
	private readonly state: DurableObjectState;
	private readonly lastControllerTimestamps = new Map<string, number>();

	constructor(ctx: DurableObjectState, _env: FlickEnv) {
		super(ctx, _env);
		this.state = ctx;
	}

	async fetch(request: Request) {
		const url = new URL(request.url);
		if (url.pathname === "/__init" && request.method === "POST")
			return this.initialize();
		if (!(await this.state.storage.get<boolean>("initialized")))
			return new Response("Room does not exist.", { status: 404 });
		if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
			return new Response("WebSocket upgrade required.", { status: 426 });

		const role = url.searchParams.get("role");
		if (role !== "host" && role !== "controller" && role !== "spectator")
			return new Response("Role must be host, controller, or spectator.", {
				status: 400,
			});
		if (role === "host") {
			// A host that dropped without a close frame (network loss) leaves a
			// zombie socket behind; evict it so the reconnecting host can take
			// over instead of hammering 409s until TCP times out.
			const existingHost = this.socketFor("host");
			existingHost?.close(4003, "Host reconnected elsewhere.");
		}
		if (
			(role === "controller" || role === "spectator") &&
			!this.socketFor("host")
		)
			return new Response("Host is not connected.", { status: 409 });
		if (
			role === "spectator" &&
			!canAcceptSpectator(this.spectatorSockets().length)
		)
			return new Response("Spectator display limit reached.", { status: 409 });

		const pair = new WebSocketPair();
		const clientSocket = pair[0];
		const serverSocket = pair[1];
		let attachment: ConnectionAttachment;

		if (role === "controller") {
			const sessionId = this.sessionId(url.searchParams.get("sessionId"));
			// Same-session reconnects (page reload after a network drop) must
			// replace the old zombie socket, not be rejected because of it.
			const existingController = this.socketFor("controller", sessionId);
			existingController?.close(4002, "Session reconnected elsewhere.");
			const assignment = await this.assignmentForSession(sessionId);
			if (!assignment)
				return new Response("Four controllers are already connected.", {
					status: 409,
				});
			attachment = {
				role,
				connectedAt: Date.now(),
				sessionId,
				player: assignment.player,
			};
			await this.state.storage.put(this.sessionKey(sessionId), {
				...assignment,
				disconnectedAt: undefined,
			});
		} else if (role === "spectator") {
			attachment = {
				role,
				spectatorId: crypto.randomUUID(),
				connectedAt: Date.now(),
			};
		} else {
			attachment = { role, connectedAt: Date.now() };
		}

		this.state.acceptWebSocket(serverSocket);
		serverSocket.serializeAttachment(attachment);

		if (role === "host") {
			await this.sendLobbyState(serverSocket);
			this.send(serverSocket, { type: "spectator-count", count: 0 });
		} else if (attachment.role === "controller") {
			this.send(serverSocket, {
				type: "assignment",
				player: attachment.player,
			});
			this.send(this.socketFor("host"), {
				type: "player-connected",
				player: attachment.player,
			});
			await this.sendLobbyState(this.socketFor("host"));
			await this.sendLobbyState(serverSocket);
		} else if (attachment.role === "spectator") {
			this.send(this.socketFor("host"), {
				type: "spectator-connected",
				spectatorId: attachment.spectatorId,
			});
			this.sendSpectatorCount();
			this.requestSpectatorSync(attachment.spectatorId);
		}

		return new Response(null, { status: 101, webSocket: clientSocket });
	}

	webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
		const raw =
			typeof message === "string" ? message : new TextDecoder().decode(message);
		const attachment = this.attachment(socket);
		if (!attachment) return;
		const maxBytes =
			attachment.role === "host" ? MAX_HOST_MESSAGE_BYTES : MAX_MESSAGE_BYTES;
		if (new TextEncoder().encode(raw).byteLength > maxBytes) {
			this.send(socket, { type: "error", message: "Message too large." });
			return;
		}

		if (attachment.role === "controller") {
			const parsed = parseJsonMessage(raw, ControllerMessageSchema);
			if (!parsed || !attachment.player || !attachment.sessionId) {
				this.send(socket, {
					type: "error",
					message: "Invalid controller message.",
				});
				return;
			}
			if (!this.acceptFreshInput(attachment.sessionId, parsed)) {
				this.send(socket, {
					type: "error",
					message: "Stale controller input.",
				});
				return;
			}
			void this.persistControllerState(attachment.sessionId, parsed);
			const hostMessage: RoomToHostMessage = {
				type: "controller-input",
				playerId: attachment.player.playerId,
				input: parsed,
			};
			this.send(this.socketFor("host"), hostMessage);
			return;
		}

		if (attachment.role === "spectator") {
			const parsed = parseJsonMessage(raw, SpectatorToRoomMessageSchema);
			if (!parsed) {
				this.send(socket, {
					type: "error",
					message: "Spectator displays are read-only.",
				});
				return;
			}
			if (parsed.type === "request-sync")
				this.requestSpectatorSync(attachment.spectatorId);
			else
				this.send(socket, {
					type: "pong",
					timestamp: parsed.timestamp,
					serverTimestamp: Date.now(),
				});
			return;
		}

		const parsed = parseJsonMessage(
			raw,
			HostToRoomMessageSchema,
			MAX_HOST_MESSAGE_BYTES,
		);
		if (!parsed) {
			this.send(socket, { type: "error", message: "Invalid host message." });
			return;
		}
		if (parsed.type === "spectator-snapshot")
			this.relaySnapshotToSpectators(parsed);
		else if (parsed.type === "spectator-event") this.relayToSpectators(parsed);
		else this.relayToControllers(parsed);
	}

	async webSocketClose(socket: WebSocket) {
		const attachment = this.attachment(socket);
		if (attachment?.role === "host") {
			for (const controller of this.controllerSockets()) {
				// Server-initiated closes never re-enter webSocketClose, so mark
				// the sessions disconnected here or their slots leak forever.
				const controllerAttachment = this.attachment(controller);
				if (controllerAttachment?.role === "controller")
					await this.persistDisconnect(
						controllerAttachment.sessionId,
						controllerAttachment.player.playerId,
					);
				controller.close(CLOSE_HOST_LEFT, "Host disconnected.");
			}
			for (const spectator of this.spectatorSockets()) {
				this.send(spectator, {
					type: "host-unavailable",
					message: "Host display disconnected.",
				});
				spectator.close(CLOSE_HOST_LEFT, "Host disconnected.");
			}
			return;
		}
		if (
			attachment?.role === "controller" &&
			attachment.player &&
			attachment.sessionId
		) {
			void this.persistDisconnect(
				attachment.sessionId,
				attachment.player.playerId,
			);
			return;
		}
		if (attachment?.role === "spectator") {
			this.send(this.socketFor("host"), {
				type: "spectator-disconnected",
				spectatorId: attachment.spectatorId,
			});
			this.sendSpectatorCount(socket);
		}
	}

	webSocketError(socket: WebSocket) {
		void this.webSocketClose(socket);
	}

	private async initialize() {
		if (await this.state.storage.get<boolean>("initialized"))
			return new Response("Room already initialized.", { status: 409 });
		await this.state.storage.put("initialized", true);
		return new Response(null, { status: 201 });
	}

	private sessionId(candidate: string | null) {
		return candidate && /^[0-9a-f-]{36}$/i.test(candidate)
			? candidate
			: crypto.randomUUID();
	}

	private async assignmentForSession(sessionId: string) {
		const existing = await this.state.storage.get<StoredPlayerSession>(
			this.sessionKey(sessionId),
		);
		const now = Date.now();
		if (
			existing &&
			(!existing.disconnectedAt ||
				now - existing.disconnectedAt <= RECONNECT_GRACE_MS)
		)
			return existing;
		if (existing) await this.state.storage.delete(this.sessionKey(sessionId));

		const occupiedNumbers = new Set<PlayerNumber>();
		for (const socket of this.controllerSockets()) {
			const attachment = this.attachment(socket);
			const player =
				attachment?.role === "controller" ? attachment.player : undefined;
			if (player) occupiedNumbers.add(player.playerNumber);
		}
		const sessions = await this.state.storage.list<StoredPlayerSession>({
			prefix: "player-session:",
		});
		for (const [key, record] of sessions) {
			if (
				record.disconnectedAt &&
				now - record.disconnectedAt > RECONNECT_GRACE_MS
			) {
				await this.state.storage.delete(key);
				continue;
			}
			if (!record.disconnectedAt)
				occupiedNumbers.add(record.player.playerNumber);
			if (
				record.disconnectedAt &&
				now - record.disconnectedAt <= RECONNECT_GRACE_MS
			)
				occupiedNumbers.add(record.player.playerNumber);
		}

		const playerNumber = findFirstFreePlayerNumber(occupiedNumbers);
		if (!playerNumber || this.controllerSockets().length >= MAX_CONTROLLERS)
			return null;
		const player: PlayerAssignment = {
			playerId: crypto.randomUUID(),
			playerNumber,
			color: colorForPlayerNumber(playerNumber),
		};
		return {
			player,
			ready: false,
			motionEnabled: false,
		} satisfies StoredPlayerSession;
	}

	private async persistControllerState(
		sessionId: string,
		input: ControllerMessage,
	) {
		const key = this.sessionKey(sessionId);
		const current = await this.state.storage.get<StoredPlayerSession>(key);
		if (!current) return;
		if (input.type === "ready" && typeof input.ready === "boolean")
			current.ready = input.ready;
		if (input.type === "motion-status") current.motionEnabled = input.enabled;
		await this.state.storage.put(key, current);
		await this.sendLobbyState(this.socketFor("host"));
		await this.sendLobbyState(this.socketFor("controller", sessionId));
	}

	private async persistDisconnect(sessionId: string, playerId: string) {
		const key = this.sessionKey(sessionId);
		const current = await this.state.storage.get<StoredPlayerSession>(key);
		if (current)
			await this.state.storage.put(key, {
				...current,
				disconnectedAt: Date.now(),
			});
		this.send(this.socketFor("host"), {
			type: "player-disconnected",
			playerId,
		});
		await this.sendLobbyState(this.socketFor("host"));
	}

	private async sendLobbyState(socket: WebSocket | undefined) {
		if (!socket) return;
		const now = Date.now();
		const connected = new Map<string, PlayerAssignment>();
		for (const controller of this.controllerSockets()) {
			const attachment = this.attachment(controller);
			const player =
				attachment?.role === "controller" ? attachment.player : undefined;
			if (player) connected.set(player.playerId, player);
		}
		const players: LobbyPlayer[] = [];
		const sessions = await this.state.storage.list<StoredPlayerSession>({
			prefix: "player-session:",
		});
		for (const [key, record] of sessions) {
			if (
				record.disconnectedAt &&
				now - record.disconnectedAt > RECONNECT_GRACE_MS
			) {
				await this.state.storage.delete(key);
				continue;
			}
			players.push({
				...record.player,
				ready: record.ready,
				motionEnabled: record.motionEnabled ?? false,
				connected: connected.has(record.player.playerId),
			});
		}
		players.sort((a, b) => a.playerNumber - b.playerNumber);
		this.send(socket, {
			type: "lobby-state",
			players: players.slice(0, MAX_CONTROLLERS),
		});
	}

	private relayToControllers(message: HostToRoomMessage) {
		const targetPlayerIds = new Set<string>();
		if (
			message.type === "flick-accepted" ||
			message.type === "score-update" ||
			message.type === "prop-destroyed"
		)
			targetPlayerIds.add(message.playerId);
		if (message.type === "hit-confirmed")
			targetPlayerIds.add(message.attackerPlayerId);
		if (message.type === "player-hit")
			targetPlayerIds.add(message.targetPlayerId);
		for (const controller of this.controllerSockets()) {
			const attachment = this.attachment(controller);
			const playerId =
				attachment?.role === "controller"
					? attachment.player.playerId
					: undefined;
			if (
				targetPlayerIds.size === 0 ||
				(playerId && targetPlayerIds.has(playerId))
			)
				this.send(controller, message);
		}
	}

	private relaySnapshotToSpectators(
		message: Extract<HostToRoomMessage, { type: "spectator-snapshot" }>,
	) {
		if (message.targetSpectatorId) {
			this.send(this.spectatorSocket(message.targetSpectatorId), message);
			return;
		}
		this.relayToSpectators(message);
	}

	private relayToSpectators(message: HostToRoomMessage) {
		for (const spectator of this.spectatorSockets())
			this.send(spectator, message);
	}

	private requestSpectatorSync(spectatorId: string) {
		this.send(this.socketFor("host"), {
			type: "spectator-sync-request",
			spectatorId,
		});
	}

	private sendSpectatorCount(exclude?: WebSocket) {
		const count = this.spectatorSockets().filter(
			(socket) => socket !== exclude && socket.readyState === WebSocket.OPEN,
		).length;
		this.send(this.socketFor("host"), { type: "spectator-count", count });
	}

	private sessionKey(sessionId: string) {
		return `player-session:${sessionId}`;
	}

	private acceptFreshInput(sessionId: string, input: ControllerMessage) {
		if (input.type !== "aim" && input.type !== "flick") return true;
		// Keyed per message type so a flick landing in the same millisecond as
		// an aim update is not rejected as a replay.
		const key = `${sessionId}:${input.type}`;
		const previous = this.lastControllerTimestamps.get(key);
		if (!isFreshInputTimestamp(input.timestamp, previous)) return false;
		this.lastControllerTimestamps.set(key, input.timestamp);
		return true;
	}

	private controllerSockets() {
		return this.state
			.getWebSockets()
			.filter(
				(socket: WebSocket) => this.attachment(socket)?.role === "controller",
			);
	}

	private spectatorSockets() {
		return this.state
			.getWebSockets()
			.filter(
				(socket: WebSocket) => this.attachment(socket)?.role === "spectator",
			);
	}

	private spectatorSocket(spectatorId: string) {
		return this.spectatorSockets().find((socket) => {
			const attachment = this.attachment(socket);
			return (
				attachment?.role === "spectator" &&
				attachment.spectatorId === spectatorId
			);
		});
	}

	private socketFor(role: ConnectionAttachment["role"], sessionId?: string) {
		return this.state.getWebSockets().find((socket: WebSocket) => {
			const attachment = this.attachment(socket);
			if (attachment?.role !== role) return false;
			if (!sessionId) return true;
			return (
				attachment.role === "controller" && attachment.sessionId === sessionId
			);
		});
	}

	private attachment(socket: WebSocket) {
		const value = socket.deserializeAttachment();
		if (
			!value ||
			typeof value !== "object" ||
			!("role" in value) ||
			!("connectedAt" in value)
		)
			return null;
		if (
			(value.role !== "host" &&
				value.role !== "controller" &&
				value.role !== "spectator") ||
			typeof value.connectedAt !== "number"
		)
			return null;
		return value as ConnectionAttachment;
	}

	private send(
		socket: WebSocket | undefined,
		message: HostToRoomMessage | RoomToHostMessage | Record<string, unknown>,
	) {
		if (!socket || socket.readyState !== WebSocket.OPEN) return;
		socket.send(JSON.stringify(message));
	}
}
