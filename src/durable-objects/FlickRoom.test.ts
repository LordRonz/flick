import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
	DurableObject: class {},
}));

import { FlickRoom, MAX_SPECTATORS } from "./FlickRoom";

class FakeSocket {
	readyState = 1;
	attachment: unknown;
	readonly sent: string[] = [];
	closeCode?: number;
	closeReason?: string;

	serializeAttachment(value: unknown) {
		this.attachment = value;
	}

	deserializeAttachment() {
		return this.attachment;
	}

	send(value: string) {
		this.sent.push(value);
	}

	close(code?: number, reason?: string) {
		this.readyState = 3;
		this.closeCode = code;
		this.closeReason = reason;
	}
}

class FakeWebSocketPair {
	readonly 0 = new FakeSocket();
	readonly 1 = new FakeSocket();
}

class FakeStorage {
	private readonly values = new Map<string, unknown>([["initialized", true]]);

	async get<T>(key: string) {
		return this.values.get(key) as T | undefined;
	}

	async put(key: string, value: unknown) {
		this.values.set(key, value);
	}

	async delete(key: string) {
		this.values.delete(key);
	}

	async list<T>({ prefix }: { prefix: string }) {
		return new Map(
			Array.from(this.values.entries()).filter(([key]) =>
				key.startsWith(prefix),
			),
		) as Map<string, T>;
	}
}

class FakeState {
	readonly storage = new FakeStorage();
	readonly sockets: FakeSocket[] = [];

	acceptWebSocket(socket: WebSocket) {
		this.sockets.push(socket as unknown as FakeSocket);
	}

	getWebSockets() {
		return this.sockets.filter(
			(socket) => socket.readyState === 1,
		) as unknown as WebSocket[];
	}
}

describe("FlickRoom spectator integration", () => {
	let state: FakeState;
	let room: FlickRoom;

	beforeEach(() => {
		state = new FakeState();
		Object.assign(globalThis, {
			WebSocketPair: FakeWebSocketPair,
			WebSocket: { OPEN: 1 },
		});
		room = new FlickRoom(state as unknown as DurableObjectState, {} as never);
	});

	it("connects spectators, updates host count, and preserves controller slots", async () => {
		const host = await connect(room, state, "host");
		await connect(room, state, "spectator");
		await connect(room, state, "spectator");

		expect(messages(host, "spectator-connected")).toHaveLength(2);
		expect(messages(host, "spectator-count").at(-1)).toMatchObject({
			count: 2,
		});
		expect(messages(host, "spectator-sync-request")).toHaveLength(2);

		for (let index = 0; index < 4; index += 1) {
			const controller = await connect(
				room,
				state,
				"controller",
				`sessionId=00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
			);
			expect(messages(controller, "assignment")).toHaveLength(1);
		}
	});

	it("enforces spectator limit without consuming another socket", async () => {
		await connect(room, state, "host");
		for (let index = 0; index < MAX_SPECTATORS; index += 1)
			await connect(room, state, "spectator");
		const before = state.sockets.length;
		const response = await room.fetch(socketRequest("spectator"));
		expect(response.status).toBe(409);
		expect(state.sockets).toHaveLength(before);
	});

	it("rejects spectator input and relays snapshots and events", async () => {
		const host = await connect(room, state, "host");
		const spectator = await connect(room, state, "spectator");
		room.webSocketMessage(
			spectator as unknown as WebSocket,
			JSON.stringify({
				type: "aim",
				normalizedAim: 0.5,
				timestamp: Date.now(),
			}),
		);
		expect(messages(spectator, "error").at(-1)).toMatchObject({
			message: "Spectator displays are read-only.",
		});

		room.webSocketMessage(
			host as unknown as WebSocket,
			JSON.stringify({
				type: "spectator-snapshot",
				sequence: 1,
				hostTimestamp: Date.now(),
				phase: "playing",
				timeRemainingMs: 20_000,
				players: [],
				projectiles: [],
				props: [],
				scores: [],
			}),
		);
		room.webSocketMessage(
			host as unknown as WebSocket,
			JSON.stringify({
				type: "spectator-event",
				event: {
					type: "countdown",
					eventId: "00000000-0000-4000-8000-000000000099",
					value: 3,
				},
			}),
		);
		expect(messages(spectator, "spectator-snapshot")).toHaveLength(1);
		expect(messages(spectator, "spectator-event")).toHaveLength(1);
	});

	it("notifies and closes spectators when host disconnects", async () => {
		const host = await connect(room, state, "host");
		const spectator = await connect(room, state, "spectator");
		host.readyState = 3;
		room.webSocketClose(host as unknown as WebSocket);
		expect(messages(spectator, "host-unavailable")).toHaveLength(1);
		expect(spectator.closeCode).toBe(4001);
		expect(spectator.closeReason).toBe("Host disconnected.");
	});
});

async function connect(
	room: FlickRoom,
	state: FakeState,
	role: "host" | "controller" | "spectator",
	extraSearch = "",
) {
	const before = state.sockets.length;
	try {
		await room.fetch(socketRequest(role, extraSearch));
	} catch (error) {
		if (!(error instanceof RangeError)) throw error;
	}
	expect(state.sockets.length).toBe(before + 1);
	const socket = state.sockets.at(-1);
	if (!socket) throw new Error("WebSocket was not accepted.");
	return socket;
}

function socketRequest(role: string, extraSearch = "") {
	const suffix = extraSearch ? `&${extraSearch}` : "";
	return new Request(
		`https://flick.test/api/rooms/ABC123/socket?role=${role}${suffix}`,
		{ headers: { Upgrade: "websocket" } },
	);
}

function messages(socket: FakeSocket, type: string) {
	return socket.sent
		.map((raw) => JSON.parse(raw) as Record<string, unknown>)
		.filter((message) => message.type === type);
}
