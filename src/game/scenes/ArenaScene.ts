import Phaser from "phaser";
import type {
	SpectatorPresentationEvent,
	SpectatorSnapshot,
} from "../../realtime/protocol";
import {
	PresentationEventDeduplicator,
	SnapshotBuffer,
	SPECTATOR_INTERPOLATION_DELAY_MS,
} from "../../spectator/sync";
import { ARCADE_COLORS, ARCADE_MOTION, PLAYER_HEX } from "../art/tokens";
import { ArcadeAudio, type ArcadeSoundCue } from "../audio/ArcadeAudio";
import type { GameBridge } from "../bridge/GameBridge";
import type { ReactToGameEvent } from "../bridge/game-events";
import {
	GAME_HEIGHT,
	GAME_WIDTH,
	PLATFORM_LAYOUT,
	STATIONS,
	WORLD_BOUNDARIES,
} from "../config/arena";
import { type FlickSource, THROW_COOLDOWN_MS } from "../config/controls";
import {
	MAX_ACTIVE_PROJECTILES,
	nextProjectileType,
	PROJECTILE_DEFINITIONS,
} from "../config/projectiles";
import { PROP_DEFINITIONS, PROP_LAYOUT } from "../config/props";
import { ArcadeEffects } from "../effects/ArcadeEffects";
import { launchVelocity, mapAimAngle, smoothAim } from "../systems/aim";
import { clamp } from "../systems/math";
import { canScoreAgainst, hitScore, propScore } from "../systems/scoring";
import type {
	GameMode,
	MatchPhase,
	MatchStanding,
	PlayerAssignment,
	PlayerRoundStats,
	ProjectileType,
	PropType,
} from "../types";

const COLLISION_CATEGORY = {
	WORLD: 0x0001,
	PROJECTILE: 0x0002,
	PLAYER: 0x0004,
	PROP: 0x0008,
	SENSOR: 0x0010,
} as const;

const PROJECTILE_AUDIO: Record<
	ProjectileType,
	{ throw: ArcadeSoundCue; impact: ArcadeSoundCue }
> = {
	"paper-ball": { throw: "paper-throw", impact: "light-impact" },
	"coffee-mug": { throw: "mug-throw", impact: "medium-impact" },
	stapler: { throw: "stapler-throw", impact: "heavy-impact" },
};

type ProjectileMetadata = {
	projectileId: string;
	ownerPlayerId: string;
	projectileType: ProjectileType;
	practice: boolean;
	createdAt: number;
	scoredPlayerIds: Set<string>;
	destroyedPropIds: Set<string>;
	lastWorldImpactAt: number;
};

type ProjectileState = {
	body: Phaser.Physics.Matter.Image;
	metadata: ProjectileMetadata;
};

type PropState = {
	propId: string;
	type: PropType;
	body: Phaser.Physics.Matter.Image;
	health: number;
	destroyed: boolean;
};

type PlayerState = {
	assignment: PlayerAssignment;
	sprite: Phaser.Physics.Matter.Image;
	aimGraphic: Phaser.GameObjects.Graphics;
	label: Phaser.GameObjects.Text;
	projectileLabel: Phaser.GameObjects.Text;
	normalizedAim: number;
	aimActiveUntil: number;
	angle: number;
	cooldownUntil: number;
	throwCount: number;
	nextType: ProjectileType;
	currentType: ProjectileType;
	ready: boolean;
	stats: PlayerRoundStats;
};

type CollisionPair = { bodyA: { label?: string }; bodyB: { label?: string } };

export class ArenaScene extends Phaser.Scene {
	private readonly bridge: GameBridge;
	private readonly mode: GameMode;
	private readonly allowSinglePlayer: boolean;
	private readonly players = new Map<string, PlayerState>();
	private readonly projectiles = new Map<string, ProjectileState>();
	private readonly props = new Map<string, PropState>();
	private readonly audio = new ArcadeAudio();
	private phase: MatchPhase = "lobby";
	private reducedMotion = false;
	private matchEndsAt = 0;
	private lastTimerSecond = -1;
	private countdownEvent?: Phaser.Time.TimerEvent;
	private countdownText?: Phaser.GameObjects.Text;
	private countdownValue?: 3 | 2 | 1 | "FLICK";
	private effects?: ArcadeEffects;
	private performanceText?: Phaser.GameObjects.Text;
	private lastPerformanceUpdate = 0;
	private removeBridgeListener?: () => void;
	private spectatorCount = 0;
	private spectatorSequence = 0;
	private lastSnapshotAt = 0;
	private finalStandings: MatchStanding[] = [];
	private readonly spectatorBuffer = new SnapshotBuffer();
	private readonly spectatorEvents = new PresentationEventDeduplicator();
	private lastSpectatorDebugAt = 0;

	constructor(bridge: GameBridge, mode: GameMode, allowSinglePlayer: boolean) {
		super({ key: "ArenaScene" });
		this.bridge = bridge;
		this.mode = mode;
		this.allowSinglePlayer = allowSinglePlayer;
	}

	create() {
		this.reducedMotion =
			window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
		this.audio.preloadSoundtrack();
		this.effects = new ArcadeEffects(this, this.reducedMotion);
		this.buildArena();
		this.buildProps();
		if (import.meta.env.DEV) {
			this.performanceText = this.add
				.text(GAME_WIDTH - 24, 26, "", {
					color: "#8ea2a5",
					fontFamily: "DM Mono, monospace",
					fontSize: "10px",
					align: "right",
				})
				.setOrigin(1, 0)
				.setDepth(20);
		}
		this.removeBridgeListener = this.bridge.onCommand((command) =>
			this.handleCommand(command),
		);
		if (this.mode === "host") {
			this.matter.world.on("collisionstart", this.handleCollision, this);
			this.input.keyboard?.on("keydown", this.handleKeyboard, this);
		} else {
			this.matter.world.pause();
		}
		this.events.once("shutdown", this.shutdown, this);
		this.bridge.emit({ type: "game-ready" });
	}

	update() {
		if (this.mode === "spectator") {
			const snapshot = this.spectatorBuffer.sample(
				Date.now() - SPECTATOR_INTERPOLATION_DELAY_MS,
			);
			if (snapshot) this.renderSpectatorSnapshot(snapshot);
			if (
				import.meta.env.DEV &&
				this.time.now - this.lastSpectatorDebugAt >= 500
			) {
				this.lastSpectatorDebugAt = this.time.now;
				this.bridge.emit({
					type: "spectator-debug",
					lastSequence: this.spectatorBuffer.latestSequence,
					bufferSize: this.spectatorBuffer.size,
				});
			}
			return;
		}
		if (this.phase === "playing") {
			this.clearCountdown();
			this.updateTimer();
		}
		const now = this.time.now;
		for (const player of this.players.values()) {
			player.angle = smoothAim(
				player.angle,
				mapAimAngle(
					player.normalizedAim,
					STATIONS[player.assignment.playerNumber].aim,
				),
			);
			this.drawAim(player);
			if (!this.reducedMotion && this.time.now >= player.cooldownUntil) {
				const poseAngle =
					player.aimActiveUntil > now ? player.normalizedAim * 5 : 0;
				player.sprite.setAngle(
					Phaser.Math.Linear(player.sprite.angle, poseAngle, 0.14),
				);
			}
			const cooldown = Math.max(0, player.cooldownUntil - now);
			player.projectileLabel.setText(
				cooldown > 0
					? `${projectileName(player.currentType)} • COOLDOWN ${(cooldown / 1000).toFixed(1)}s`
					: `${projectileName(player.currentType)} • NEXT ${projectileName(player.nextType)}`,
			);
			player.projectileLabel.setColor(cooldown > 0 ? "#8ea2a5" : "#edf7f5");
		}
		for (const [projectileId, projectile] of this.projectiles) {
			const definition =
				PROJECTILE_DEFINITIONS[projectile.metadata.projectileType];
			const body = projectile.body;
			this.effects?.trail(body, projectile.metadata.projectileType, now);
			const tooOld =
				this.time.now - projectile.metadata.createdAt > definition.lifetimeMs;
			const tooFar =
				body.x < -160 ||
				body.x > GAME_WIDTH + 160 ||
				body.y < -160 ||
				body.y > GAME_HEIGHT + 160;
			if (tooOld || tooFar) this.destroyProjectile(projectileId);
		}
		if (this.performanceText && now - this.lastPerformanceUpdate > 500) {
			this.lastPerformanceUpdate = now;
			this.performanceText.setText(
				`FPS ${Math.round(this.game.loop.actualFps)}\nPROJECTILES ${this.projectiles.size}/${MAX_ACTIVE_PROJECTILES}\nBODIES ${this.matter.world.getAllBodies().length}`,
			);
		}
		const snapshotInterval =
			this.phase === "playing" || this.phase === "countdown" ? 1000 / 15 : 500;
		if (
			this.spectatorCount > 0 &&
			now - this.lastSnapshotAt >= snapshotInterval
		) {
			this.lastSnapshotAt = now;
			this.emitSpectatorSnapshot();
		}
	}

	private buildArena() {
		const background = this.add.graphics().setDepth(-10);
		background.fillStyle(ARCADE_COLORS.sky).fillRect(0, 0, GAME_WIDTH, 350);
		background.fillStyle(ARCADE_COLORS.skyLight).fillCircle(1080, 80, 78);
		for (let index = 0; index < 12; index += 1) {
			const width = 58 + (index % 3) * 22;
			const height = 70 + (index % 4) * 28;
			const x = index * 118 - 20;
			background
				.fillStyle(index % 2 ? 0x6ba7ca : 0x5795bb)
				.fillRect(x, 350 - height, width, height);
			background.fillStyle(0xdff6ff, 0.72);
			for (let y = 294; y < 338; y += 15)
				for (let wx = x + 10; wx < x + width - 8; wx += 17)
					background.fillRect(wx, y, 7, 6);
		}
		background.fillStyle(ARCADE_COLORS.wall).fillRect(0, 0, GAME_WIDTH, 48);
		background.fillRect(0, 350, GAME_WIDTH, 210);
		background
			.fillStyle(ARCADE_COLORS.wallShade)
			.fillRect(0, 350, GAME_WIDTH, 16);
		background.lineStyle(10, ARCADE_COLORS.ink);
		for (let x = 34; x < GAME_WIDTH; x += 250) {
			background.strokeRoundedRect(x, 55, 218, 290, 8);
			background.lineBetween(x + 109, 55, x + 109, 345);
		}
		background.fillStyle(ARCADE_COLORS.floor).fillRect(0, 560, GAME_WIDTH, 160);
		background
			.fillStyle(ARCADE_COLORS.floorDark)
			.fillRect(0, 560, GAME_WIDTH, 18);
		background.lineStyle(2, 0x7185a7, 0.55);
		for (let x = -80; x <= GAME_WIDTH + 80; x += 92)
			background.lineBetween(x, 720, x + 80, 560);
		background.lineStyle(2, 0x465775, 0.65);
		for (let y = 600; y <= GAME_HEIGHT; y += 40)
			background.lineBetween(0, y, GAME_WIDTH, y);

		this.add
			.text(48, 24, "FLICK ARENA", {
				color: "#172033",
				fontFamily: "Arial Black, system-ui, sans-serif",
				fontSize: "24px",
				fontStyle: "bold",
			})
			.setDepth(4);
		this.add
			.text(260, 31, "OFFICE MAYHEM", {
				color: "#5b6d8c",
				fontFamily: "system-ui, sans-serif",
				fontSize: "13px",
				fontStyle: "bold",
				letterSpacing: 2,
			})
			.setDepth(4);

		for (const platform of PLATFORM_LAYOUT) {
			const isCeiling = platform.y < 100;
			const platformArt = this.add.graphics().setDepth(2);
			platformArt
				.fillStyle(ARCADE_COLORS.ink)
				.fillRoundedRect(
					platform.x - platform.width / 2 - 4,
					platform.y - platform.height / 2 - 4,
					platform.width + 8,
					platform.height + 8,
					7,
				);
			platformArt
				.fillStyle(
					isCeiling
						? ARCADE_COLORS.inkSoft
						: platform.y > 650
							? 0x33415e
							: 0xc7895a,
				)
				.fillRoundedRect(
					platform.x - platform.width / 2,
					platform.y - platform.height / 2,
					platform.width,
					platform.height,
					5,
				);
			platformArt
				.fillStyle(0xffffff, isCeiling ? 0.12 : 0.34)
				.fillRoundedRect(
					platform.x - platform.width / 2 + 8,
					platform.y - platform.height / 2 + 4,
					platform.width - 16,
					4,
					2,
				);
			this.matter.add.rectangle(
				platform.x,
				platform.y,
				platform.width,
				platform.height,
				{
					isStatic: true,
					label: "world",
					collisionFilter: {
						category: COLLISION_CATEGORY.WORLD,
						mask: COLLISION_CATEGORY.PROJECTILE,
					},
				},
			);
		}
		for (const boundary of WORLD_BOUNDARIES) {
			this.matter.add.rectangle(
				boundary.x,
				boundary.y,
				boundary.width,
				boundary.height,
				{
					isStatic: true,
					label: "world",
					collisionFilter: {
						category: COLLISION_CATEGORY.WORLD,
						mask: COLLISION_CATEGORY.PROJECTILE,
					},
				},
			);
		}

		for (const station of Object.values(STATIONS)) {
			const tint =
				PLAYER_HEX[
					station.playerNumber === 1
						? "blue"
						: station.playerNumber === 2
							? "red"
							: station.playerNumber === 3
								? "green"
								: "yellow"
				];
			this.add
				.ellipse(station.x, station.y + 45, 142, 58, ARCADE_COLORS.ink, 0.24)
				.setDepth(1);
			this.add
				.ellipse(station.x, station.y + 39, 132, 48, tint, 0.32)
				.setStrokeStyle(5, ARCADE_COLORS.ink, 0.95)
				.setDepth(2);
			this.add
				.text(station.x, station.y + 38, `P${station.playerNumber}`, {
					color: "#172033",
					fontFamily: "Arial Black, system-ui, sans-serif",
					fontSize: "20px",
					fontStyle: "bold",
				})
				.setOrigin(0.5)
				.setDepth(3);
		}
	}

	private buildProps() {
		for (const layout of PROP_LAYOUT)
			this.createProp(layout.type, layout.x, layout.y);
	}

	private createProp(type: PropType, x: number, y: number) {
		const definition = PROP_DEFINITIONS[type];
		const propId = `prop-${type}`;
		const shape =
			definition.collisionShape === "circle"
				? {
						type: "circle",
						radius: Math.min(definition.width, definition.height) / 2,
					}
				: {
						type: "rectangle",
						width: definition.width,
						height: definition.height,
					};
		const body = this.matter.add
			.image(x, y, definition.textureKey, undefined, {
				label: `prop:${propId}`,
				shape,
				isStatic: definition.isStatic,
				restitution: 0.15,
				collisionFilter: {
					category: COLLISION_CATEGORY.PROP,
					mask: COLLISION_CATEGORY.PROJECTILE,
				},
			})
			.setDepth(4);
		this.props.set(propId, {
			propId,
			type,
			body,
			health: definition.maxHealth,
			destroyed: false,
		});
	}

	private handleCommand(command: ReactToGameEvent) {
		switch (command.type) {
			case "player-joined":
				this.createPlayer(command.player);
				this.audio.play("player-join");
				break;
			case "player-left":
				this.removePlayer(command.playerId);
				break;
			case "player-ready":
				{
					const player = this.players.get(command.playerId);
					if (player) player.ready = command.ready;
				}
				this.setPlayerLabel(
					command.playerId,
					command.ready ? "READY" : "NOT READY",
				);
				if (command.ready) this.audio.play("player-ready");
				break;
			case "player-motion-status":
				this.setPlayerLabel(
					command.playerId,
					command.enabled ? "PHYSICAL FLICK" : "BUTTON THROW",
				);
				break;
			case "aim": {
				const player = this.players.get(command.playerId);
				if (player) {
					player.normalizedAim = clamp(command.normalizedAim, -1, 1);
					player.aimActiveUntil = this.time.now + 280;
				}
				break;
			}
			case "flick": {
				if (this.phase === "lobby") {
					this.launchForPlayer(
						command.playerId,
						command.intensity,
						command.source,
						true,
					);
				} else if (this.phase === "playing") {
					this.launchForPlayer(
						command.playerId,
						command.intensity,
						command.source,
					);
				}
				break;
			}
			case "start-match":
				this.startMatch();
				break;
			case "set-muted":
				this.audio.setMuted(command.muted, command.persist);
				break;
			case "unlock-audio":
				this.audio.unlock();
				break;
			case "set-audio-levels":
				this.audio.setLevels(command.levels);
				break;
			case "reset-match":
				this.resetMatch();
				break;
			case "set-spectator-count":
				this.spectatorCount = Math.max(0, command.count);
				if (this.spectatorCount > 0) this.emitSpectatorSnapshot();
				break;
			case "request-spectator-snapshot":
				if (this.mode === "host")
					this.emitSpectatorSnapshot(command.spectatorId);
				break;
			case "reset-spectator-sync":
				if (this.mode === "spectator") {
					this.spectatorBuffer.clear();
					this.spectatorEvents.clear();
				}
				break;
			case "apply-spectator-snapshot":
				if (this.mode === "spectator")
					this.spectatorBuffer.push(command.snapshot);
				break;
			case "apply-spectator-event":
				if (
					this.mode === "spectator" &&
					this.spectatorEvents.accept(command.event)
				)
					this.playSpectatorPresentation(command.event);
				break;
		}
	}

	private createPlayer(assignment: PlayerAssignment) {
		if (this.players.has(assignment.playerId)) return;
		const station = STATIONS[assignment.playerNumber];
		const sprite = this.matter.add
			.image(station.x, station.y, `player-${assignment.color}`, undefined, {
				label: `player:${assignment.playerId}`,
				isStatic: true,
				isSensor: true,
				collisionFilter: {
					category: COLLISION_CATEGORY.PLAYER,
					mask: COLLISION_CATEGORY.PROJECTILE,
				},
			})
			.setDepth(6);
		const tint = PLAYER_HEX[assignment.color];
		const aimGraphic = this.add.graphics().setDepth(3);
		const label = this.add
			.text(
				station.x,
				station.y - 64,
				`P${assignment.playerNumber}  ${assignment.color.toUpperCase()}`,
				{
					color: "#172033",
					backgroundColor: `#${tint.toString(16).padStart(6, "0")}`,
					fontFamily: "Arial Black, system-ui, sans-serif",
					fontSize: "13px",
					fontStyle: "bold",
					padding: { x: 10, y: 5 },
				},
			)
			.setOrigin(0.5)
			.setDepth(7);
		const projectileLabel = this.add
			.text(station.x, station.y + 58, "", {
				color: "#172033",
				fontFamily: "system-ui, sans-serif",
				fontSize: "12px",
				fontStyle: "bold",
			})
			.setOrigin(0.5)
			.setDepth(7);
		const nextType = nextProjectileType(0, assignment.playerNumber);
		const player: PlayerState = {
			assignment,
			sprite,
			aimGraphic,
			label,
			projectileLabel,
			normalizedAim: 0,
			aimActiveUntil: 0,
			angle: station.aim.defaultAngle,
			cooldownUntil: 0,
			throwCount: 0,
			nextType,
			currentType: nextType,
			ready: false,
			stats: emptyStats(),
		};
		this.players.set(assignment.playerId, player);
		this.setPlayerLabel(assignment.playerId, "BUTTON THROW");
		if (!this.reducedMotion && this.mode === "host")
			this.tweens.add({
				targets: sprite,
				y: station.y - 5,
				duration: 820 + assignment.playerNumber * 70,
				ease: "Sine.InOut",
				yoyo: true,
				repeat: -1,
			});
	}

	private removePlayer(playerId: string) {
		const player = this.players.get(playerId);
		if (!player) return;
		player.sprite.destroy();
		player.aimGraphic.destroy();
		player.label.destroy();
		player.projectileLabel.destroy();
		this.players.delete(playerId);
	}

	private setPlayerLabel(playerId: string, status: string) {
		const player = this.players.get(playerId);
		if (player)
			player.label.setText(`P${player.assignment.playerNumber}  ${status}`);
	}

	private drawAim(player: PlayerState) {
		const station = STATIONS[player.assignment.playerNumber];
		const tint = PLAYER_HEX[player.assignment.color];
		const graphic = player.aimGraphic;
		const isActive = player.aimActiveUntil > this.time.now;
		graphic.clear();
		graphic.lineStyle(isActive ? 3 : 2, tint, isActive ? 0.76 : 0.2);
		graphic.lineBetween(
			station.x,
			station.y,
			station.x + Math.cos(player.angle) * 164,
			station.y + Math.sin(player.angle) * 164,
		);
		for (let index = 1; index <= 7; index += 1) {
			const distance = index * 31;
			graphic.fillStyle(
				tint,
				(isActive ? 0.62 : 0.32) - index * (isActive ? 0.035 : 0.025),
			);
			graphic.fillCircle(
				station.x + Math.cos(player.angle) * distance,
				station.y + Math.sin(player.angle) * distance,
				4,
			);
		}
	}

	private startMatch() {
		if (this.phase === "countdown" || this.phase === "playing") return;
		if (this.players.size === 0 && this.allowSinglePlayer)
			this.ensureKeyboardPlayer();
		if (this.players.size < (this.allowSinglePlayer ? 1 : 2)) return;
		if (
			this.players.size >= 2 &&
			!Array.from(this.players.values()).every((player) => player.ready)
		)
			return;
		this.audio.unlock();
		this.audio.primeSoundtrack();
		this.audio.play("ui");
		this.resetRoundState();
		this.phase = "countdown";
		this.bridge.emit({ type: "phase-changed", phase: this.phase });
		const labels = ["3", "2", "1", "FLICK!"];
		let index = 0;
		this.showCountdown(labels[index] ?? "3");
		this.countdownEvent = this.time.addEvent({
			delay: 750,
			repeat: labels.length - 1,
			callback: () => {
				index += 1;
				this.showCountdown(labels[index] ?? "FLICK!");
				if (index === labels.length - 1) {
					this.time.delayedCall(350, () => this.startPlaying());
				}
			},
		});
	}

	private startPlaying() {
		this.clearCountdown();
		this.phase = "playing";
		this.audio.startSoundtrack();
		this.matchEndsAt = this.time.now + 60_000;
		this.lastTimerSecond = -1;
		this.bridge.emit({ type: "phase-changed", phase: this.phase });
		this.bridge.emit({ type: "timer-changed", timeRemainingMs: 60_000 });
	}

	private clearCountdown() {
		this.countdownValue = undefined;
		const countdown = this.countdownText;
		this.countdownText = undefined;
		const countdowns = this.children.list.filter(
			(child): child is Phaser.GameObjects.Text =>
				child === countdown ||
				(child instanceof Phaser.GameObjects.Text && child.text === "FLICK!"),
		);
		for (const item of countdowns) {
			this.tweens.killTweensOf(item);
			item.setText("").setVisible(false).setActive(false).setAlpha(0);
			item.removeFromDisplayList();
			item.removeFromUpdateList();
			item.destroy();
		}
	}

	private showCountdown(label: string) {
		this.countdownValue =
			label === "FLICK!" ? "FLICK" : (Number(label) as 3 | 2 | 1);
		this.audio.play(label === "FLICK!" ? "round-start" : "countdown");
		if (this.mode === "host")
			this.emitSpectatorPresentation({
				type: "countdown",
				eventId: crypto.randomUUID(),
				value: label === "FLICK!" ? "FLICK" : (Number(label) as 3 | 2 | 1),
			});
		if (!this.countdownText) {
			this.countdownText = this.add
				.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, label, {
					color: "#edf7f5",
					fontFamily: "Space Grotesk, sans-serif",
					fontSize: "104px",
					fontStyle: "bold",
					stroke: "#44d8e4",
					strokeThickness: 4,
				})
				.setOrigin(0.5)
				.setDepth(20);
		}
		this.countdownText
			.setText(label)
			.setVisible(true)
			.setScale(0.45)
			.setAlpha(1);
		this.tweens.add({
			targets: this.countdownText,
			scale: 1,
			duration: this.reducedMotion ? 1 : 550,
			ease: "Quint.Out",
		});
	}

	private updateTimer() {
		const timeRemainingMs = Math.max(0, this.matchEndsAt - this.time.now);
		const second = Math.ceil(timeRemainingMs / 1000);
		if (second !== this.lastTimerSecond) {
			this.lastTimerSecond = second;
			this.bridge.emit({ type: "timer-changed", timeRemainingMs });
			if (second > 0 && second <= 10) this.audio.play("final-countdown");
		}
		if (timeRemainingMs <= 0) this.endMatch();
	}

	private launchForPlayer(
		playerId: string,
		intensity: number,
		source: FlickSource,
		practice = false,
	) {
		const player = this.players.get(playerId);
		if (
			!player ||
			(practice ? this.phase !== "lobby" : this.phase !== "playing") ||
			this.time.now < player.cooldownUntil
		)
			return;
		if (this.projectiles.size >= MAX_ACTIVE_PROJECTILES) return;
		player.cooldownUntil = this.time.now + THROW_COOLDOWN_MS;
		if (this.reducedMotion) {
			this.performLaunch(playerId, intensity, source, practice);
			return;
		}
		player.sprite.setScale(1.08, 0.9).setAngle(player.normalizedAim * 7);
		this.time.delayedCall(ARCADE_MOTION.fast, () =>
			this.performLaunch(playerId, intensity, source, practice),
		);
	}

	private performLaunch(
		playerId: string,
		intensity: number,
		source: FlickSource,
		practice: boolean,
	) {
		const player = this.players.get(playerId);
		if (!player) return;
		if (
			(practice ? this.phase !== "lobby" : this.phase !== "playing") ||
			this.projectiles.size >= MAX_ACTIVE_PROJECTILES
		) {
			player.sprite.setScale(1).setAngle(0);
			return;
		}
		const projectileType = player.nextType;
		const definition = PROJECTILE_DEFINITIONS[projectileType];
		const projectileId = crypto.randomUUID();
		const station = STATIONS[player.assignment.playerNumber];
		const launchAngle = mapAimAngle(player.normalizedAim, station.aim);
		player.angle = launchAngle;
		const x = station.x + Math.cos(launchAngle) * 44;
		const y = station.y + Math.sin(launchAngle) * 44;
		const shape =
			definition.bodyShape === "circle"
				? { type: "circle", radius: definition.radius ?? 12 }
				: {
						type: "rectangle",
						width: definition.width,
						height: definition.height,
					};
		const body = this.matter.add
			.image(x, y, definition.textureKey, undefined, {
				label: `projectile:${projectileId}`,
				shape,
				mass: definition.mass,
				restitution: definition.restitution,
				friction: definition.friction,
				frictionAir: definition.frictionAir,
				collisionFilter: {
					category: COLLISION_CATEGORY.PROJECTILE,
					mask:
						COLLISION_CATEGORY.WORLD |
						COLLISION_CATEGORY.PLAYER |
						COLLISION_CATEGORY.PROP,
				},
			})
			.setDepth(5);
		const velocity = launchVelocity(
			launchAngle,
			intensity,
			definition.speedMultiplier,
		);
		body.setVelocity(velocity.x, velocity.y);
		body.setAngularVelocity(
			Phaser.Math.FloatBetween(
				definition.angularVelocityRange.min,
				definition.angularVelocityRange.max,
			),
		);
		const metadata: ProjectileMetadata = {
			projectileId,
			ownerPlayerId: playerId,
			projectileType,
			practice,
			createdAt: this.time.now,
			scoredPlayerIds: new Set([playerId]),
			destroyedPropIds: new Set(),
			lastWorldImpactAt: 0,
		};
		this.projectiles.set(projectileId, { body, metadata });
		this.audio.play(PROJECTILE_AUDIO[projectileType].throw);
		if (practice) {
			this.bridge.emit({
				type: "practice-throw",
				playerId,
				projectileType,
				source,
			});
		} else {
			player.stats.throws += 1;
			player.throwCount += 1;
			player.currentType = projectileType;
			player.nextType = nextProjectileType(
				player.throwCount,
				player.assignment.playerNumber,
			);
			this.bridge.emit({
				type: "projectile-thrown",
				playerId,
				projectileType,
				source,
			});
			if (isUuid(playerId))
				this.emitSpectatorPresentation({
					type: "projectile-thrown",
					eventId: crypto.randomUUID(),
					playerId,
					projectileId,
					projectileType,
					intensity: clamp(intensity, 0, 1),
				});
			this.bridge.emit({
				type: "stats-changed",
				playerId,
				stats: { ...player.stats },
			});
		}
		if (!this.reducedMotion)
			this.tweens.add({
				targets: player.sprite,
				scaleX: 0.82,
				scaleY: 1.16,
				angle: player.normalizedAim * -4,
				duration: ARCADE_MOTION.fast,
				ease: "Quint.Out",
				onComplete: () =>
					this.tweens.add({
						targets: player.sprite,
						scaleX: 1,
						scaleY: 1,
						angle: 0,
						duration: ARCADE_MOTION.feedback,
						ease: "Back.Out",
					}),
			});
	}

	private handleCollision(event: { pairs?: CollisionPair[] }) {
		for (const pair of event.pairs ?? []) {
			const labelA = pair.bodyA.label ?? "";
			const labelB = pair.bodyB.label ?? "";
			const projectileLabel = labelA.startsWith("projectile:")
				? labelA
				: labelB.startsWith("projectile:")
					? labelB
					: "";
			const otherLabel = projectileLabel === labelA ? labelB : labelA;
			if (!projectileLabel) continue;
			const projectileId = projectileLabel.slice("projectile:".length);
			if (otherLabel.startsWith("player:"))
				this.handlePlayerHit(projectileId, otherLabel.slice("player:".length));
			if (otherLabel.startsWith("prop:"))
				this.handlePropHit(projectileId, otherLabel.slice("prop:".length));
			if (otherLabel === "world") this.handleWorldHit(projectileId);
		}
	}

	private handleWorldHit(projectileId: string) {
		const projectile = this.projectiles.get(projectileId);
		if (
			!projectile ||
			this.time.now - projectile.metadata.lastWorldImpactAt < 120
		)
			return;
		projectile.metadata.lastWorldImpactAt = this.time.now;
		this.audio.play("platform-impact");
		this.effects?.particles(
			projectile.metadata.projectileType === "paper-ball" ? "paper" : "dot",
			projectile.body.x,
			projectile.body.y,
			projectile.metadata.projectileType === "stapler" ? 7 : 4,
			ARCADE_COLORS.white,
			110,
		);
	}

	private handlePlayerHit(projectileId: string, targetPlayerId: string) {
		const projectile = this.projectiles.get(projectileId);
		const target = this.players.get(targetPlayerId);
		if (
			!projectile ||
			projectile.metadata.practice ||
			!target ||
			!canScoreAgainst(projectile.metadata.scoredPlayerIds, targetPlayerId)
		)
			return;
		projectile.metadata.scoredPlayerIds.add(targetPlayerId);
		const attacker = this.players.get(projectile.metadata.ownerPlayerId);
		if (!attacker) return;
		const score = hitScore(projectile.metadata.projectileType);
		attacker.stats.score += score;
		attacker.stats.playerHits += 1;
		this.audio.play(
			PROJECTILE_AUDIO[projectile.metadata.projectileType].impact,
		);
		this.audio.play("player-hit");
		this.emitScore(attacker);
		this.bridge.emit({
			type: "player-hit",
			attackerPlayerId: attacker.assignment.playerId,
			targetPlayerId,
			score,
		});
		if (isUuid(attacker.assignment.playerId) && isUuid(targetPlayerId))
			this.emitSpectatorPresentation({
				type: "player-hit",
				eventId: crypto.randomUUID(),
				attackerPlayerId: attacker.assignment.playerId,
				targetPlayerId,
				projectileType: projectile.metadata.projectileType,
				score,
				impactX: target.sprite.x,
				impactY: target.sprite.y,
				impactStrength: Math.hypot(
					projectile.body.body?.velocity.x ?? 0,
					projectile.body.body?.velocity.y ?? 0,
				),
			});
		this.effects?.impact(
			target.sprite.x,
			target.sprite.y,
			projectile.metadata.projectileType === "stapler",
			PLAYER_HEX[target.assignment.color],
		);
		this.effects?.score(
			target.sprite.x,
			target.sprite.y - 42,
			score,
			PLAYER_HEX[attacker.assignment.color],
		);
		target.sprite.setTint(0xffffff);
		this.tweens.add({
			targets: target.sprite,
			x:
				target.sprite.x +
				((projectile.body.body?.velocity.x ?? 0) >= 0 ? 18 : -18),
			scaleX: 1.22,
			scaleY: 0.82,
			duration: 130,
			yoyo: true,
			onComplete: () => target.sprite.clearTint(),
		});
	}

	private handlePropHit(projectileId: string, propId: string) {
		const projectile = this.projectiles.get(projectileId);
		const prop = this.props.get(propId);
		if (
			!projectile ||
			projectile.metadata.practice ||
			!prop ||
			prop.destroyed ||
			projectile.metadata.destroyedPropIds.has(propId)
		)
			return;
		projectile.metadata.destroyedPropIds.add(propId);
		const definition = PROP_DEFINITIONS[prop.type];
		prop.health -=
			definition.maxHealth > 0
				? PROJECTILE_DEFINITIONS[projectile.metadata.projectileType].propDamage
				: 1;
		this.audio.play(
			PROJECTILE_AUDIO[projectile.metadata.projectileType].impact,
		);
		this.emitSpectatorPresentation({
			type: "prop-damaged",
			eventId: crypto.randomUUID(),
			propId,
			propType: prop.type,
			impactX: prop.body.x,
			impactY: prop.body.y,
		});
		prop.body.setTint(0xffb070);
		prop.body.setTexture(`${definition.textureKey}-damaged`);
		this.tweens.add({
			targets: prop.body,
			x: prop.body.x + 5,
			duration: 55,
			yoyo: true,
			repeat: 2,
			onComplete: () => {
				if (!prop.destroyed) prop.body.setTint(0xd6ad96);
			},
		});
		this.effects?.particles("dot", prop.body.x, prop.body.y, 7, 0xffb070);
		if (prop.health > 0) return;
		prop.destroyed = true;
		const attacker = this.players.get(projectile.metadata.ownerPlayerId);
		if (attacker) {
			const score = propScore(prop.type);
			attacker.stats.score += score;
			attacker.stats.propsDestroyed += 1;
			this.emitScore(attacker);
			this.bridge.emit({
				type: "prop-destroyed",
				playerId: attacker.assignment.playerId,
				propType: prop.type,
				score,
			});
			if (isUuid(attacker.assignment.playerId))
				this.emitSpectatorPresentation({
					type: "prop-destroyed",
					eventId: crypto.randomUUID(),
					playerId: attacker.assignment.playerId,
					propId,
					propType: prop.type,
					score,
					impactX: prop.body.x,
					impactY: prop.body.y,
				});
			this.effects?.score(
				prop.body.x,
				prop.body.y - 36,
				score,
				PLAYER_HEX[attacker.assignment.color],
			);
		}
		this.audio.play(`${prop.type}-break`);
		this.effects?.destroyProp(prop.type, prop.body.x, prop.body.y);
		prop.body
			.setTexture(`${definition.textureKey}-broken`)
			.clearTint()
			.setCollidesWith(0);
		this.tweens.add({
			targets: prop.body,
			scaleX: 1.18,
			scaleY: 0.72,
			y: prop.body.y + 12,
			duration: 260,
			ease: "Quint.Out",
		});
	}

	private emitScore(player: PlayerState) {
		this.bridge.emit({
			type: "score-changed",
			playerId: player.assignment.playerId,
			score: player.stats.score,
		});
		this.bridge.emit({
			type: "stats-changed",
			playerId: player.assignment.playerId,
			stats: { ...player.stats },
		});
	}

	private destroyProjectile(projectileId: string) {
		const projectile = this.projectiles.get(projectileId);
		if (!projectile) return;
		projectile.body.destroy();
		this.projectiles.delete(projectileId);
	}

	private resetRoundState() {
		this.countdownEvent?.remove(false);
		this.countdownEvent = undefined;
		for (const projectileId of this.projectiles.keys())
			this.destroyProjectile(projectileId);
		for (const prop of this.props.values()) {
			prop.body.destroy();
		}
		this.props.clear();
		this.buildProps();
		for (const player of this.players.values()) {
			player.stats = emptyStats();
			player.throwCount = 0;
			player.nextType = nextProjectileType(0, player.assignment.playerNumber);
			player.currentType = player.nextType;
			player.cooldownUntil = 0;
			this.emitScore(player);
		}
	}

	private resetMatch() {
		this.audio.stopSoundtrack();
		this.resetRoundState();
		this.phase = "lobby";
		this.matchEndsAt = 0;
		this.lastTimerSecond = -1;
		this.finalStandings = [];
		this.countdownText?.setVisible(false);
		this.bridge.emit({ type: "phase-changed", phase: this.phase });
		this.bridge.emit({ type: "timer-changed", timeRemainingMs: 0 });
	}

	private endMatch() {
		if (this.phase !== "playing") return;
		this.audio.stopSoundtrack();
		this.phase = "results";
		const standings = Array.from(this.players.values())
			.sort(
				(a, b) =>
					b.stats.score - a.stats.score ||
					a.assignment.playerNumber - b.assignment.playerNumber,
			)
			.map((player, index) => ({
				...player.assignment,
				...player.stats,
				rank: index + 1,
			}));
		this.finalStandings = standings;
		this.bridge.emit({ type: "phase-changed", phase: this.phase });
		this.bridge.emit({ type: "timer-changed", timeRemainingMs: 0 });
		this.bridge.emit({ type: "match-ended", standings });
		const networkStandings = standings.filter((standing) =>
			isUuid(standing.playerId),
		);
		this.emitSpectatorPresentation({
			type: "match-ended",
			eventId: crypto.randomUUID(),
			standings: networkStandings,
		});
		this.audio.play("round-end");
		this.time.delayedCall(180, () => this.audio.play("winner"));
		const winner = this.players.get(standings[0]?.playerId ?? "");
		if (winner && !this.reducedMotion) {
			this.tweens.add({
				targets: winner.sprite,
				y: winner.sprite.y - 32,
				angle: 8,
				scale: 1.18,
				duration: 300,
				yoyo: true,
				repeat: 3,
			});
		}
		if (!this.reducedMotion)
			for (const player of this.players.values())
				if (player !== winner)
					this.tweens.add({
						targets: player.sprite,
						angle: player.assignment.playerNumber % 2 ? -5 : 5,
						y: player.sprite.y + 8,
						duration: 420,
						yoyo: true,
						repeat: 1,
					});
		if (!this.reducedMotion) this.effects?.confetti();
	}

	private ensureKeyboardPlayer() {
		if (!this.players.has("keyboard-p1"))
			this.createPlayer({
				playerId: "keyboard-p1",
				playerNumber: 1,
				color: "blue",
			});
		return this.players.get("keyboard-p1");
	}

	private handleKeyboard(event: KeyboardEvent) {
		const code = event.code || event.key;
		const mapping: Record<
			string,
			{ player: string; direction?: number; throw?: boolean }
		> = {
			KeyA: { player: "keyboard-p1", direction: -1 },
			KeyD: { player: "keyboard-p1", direction: 1 },
			KeyW: { player: "keyboard-p1", throw: true },
			Space: { player: "keyboard-p1", throw: true },
			ArrowLeft: { player: "keyboard-p2", direction: -1 },
			ArrowRight: { player: "keyboard-p2", direction: 1 },
			ArrowUp: { player: "keyboard-p2", throw: true },
			KeyJ: { player: "keyboard-p3", direction: -1 },
			KeyL: { player: "keyboard-p3", direction: 1 },
			KeyI: { player: "keyboard-p3", throw: true },
			Numpad4: { player: "keyboard-p4", direction: -1 },
			Numpad6: { player: "keyboard-p4", direction: 1 },
			Numpad8: { player: "keyboard-p4", throw: true },
		};
		const action = mapping[code];
		if (!action) return;
		event.preventDefault();
		let player = this.players.get(action.player);
		if (!player && this.allowSinglePlayer && action.player === "keyboard-p1")
			player = this.ensureKeyboardPlayer();
		if (!player) return;
		if (action.direction)
			player.normalizedAim = clamp(
				player.normalizedAim + action.direction * 0.18,
				-1,
				1,
			);
		if (action.direction) player.aimActiveUntil = this.time.now + 280;
		if (action.throw)
			this.launchForPlayer(player.assignment.playerId, 0.78, "button");
	}

	private emitSpectatorSnapshot(targetSpectatorId?: string) {
		if (
			this.mode !== "host" ||
			(this.spectatorCount === 0 && !targetSpectatorId)
		)
			return;
		const snapshot = this.createSpectatorSnapshot(targetSpectatorId);
		this.bridge.emit({
			type: "spectator-snapshot",
			snapshot,
			...(targetSpectatorId ? { targetSpectatorId } : {}),
		});
	}

	private createSpectatorSnapshot(
		targetSpectatorId?: string,
	): SpectatorSnapshot {
		const timeRemainingMs =
			this.phase === "playing"
				? Math.max(0, this.matchEndsAt - this.time.now)
				: 0;
		const standings = this.finalStandings.filter((standing) =>
			isUuid(standing.playerId),
		);
		return {
			type: "spectator-snapshot",
			sequence: this.spectatorSequence++,
			hostTimestamp: Date.now(),
			phase: this.phase,
			timeRemainingMs,
			...(this.countdownValue !== undefined
				? { countdownValue: this.countdownValue }
				: {}),
			players: Array.from(this.players.values())
				.filter((player) => isUuid(player.assignment.playerId))
				.map((player) => {
					const cooldownRemainingMs = Math.max(
						0,
						player.cooldownUntil - this.time.now,
					);
					const standing = standings.find(
						(candidate) => candidate.playerId === player.assignment.playerId,
					);
					return {
						...player.assignment,
						stationId: `station-${player.assignment.playerNumber}`,
						x: player.sprite.x,
						y: player.sprite.y,
						rotation: player.sprite.rotation,
						aimAngle: player.angle,
						cooldownRemainingMs,
						animationState:
							this.phase === "results"
								? standing?.rank === 1
									? ("winning" as const)
									: ("losing" as const)
								: cooldownRemainingMs > 0
									? ("throwing" as const)
									: player.aimActiveUntil > this.time.now
										? ("aiming" as const)
										: ("idle" as const),
						ready: player.ready,
					};
				}),
			projectiles: Array.from(this.projectiles.values())
				.filter(
					(projectile) =>
						isUuid(projectile.metadata.projectileId) &&
						isUuid(projectile.metadata.ownerPlayerId),
				)
				.map((projectile) => ({
					projectileId: projectile.metadata.projectileId,
					ownerPlayerId: projectile.metadata.ownerPlayerId,
					projectileType: projectile.metadata.projectileType,
					x: projectile.body.x,
					y: projectile.body.y,
					rotation: projectile.body.rotation,
					velocityX: projectile.body.body?.velocity.x ?? 0,
					velocityY: projectile.body.body?.velocity.y ?? 0,
				})),
			props: Array.from(this.props.values()).map((prop) => {
				const maxHealth = PROP_DEFINITIONS[prop.type].maxHealth;
				return {
					propId: prop.propId,
					propType: prop.type,
					x: prop.body.x,
					y: prop.body.y,
					rotation: prop.body.rotation,
					health: Math.max(0, prop.health),
					maxHealth,
					destroyed: prop.destroyed,
					damageState: prop.destroyed
						? 3
						: Math.min(2, Math.max(0, maxHealth - prop.health)),
				};
			}),
			scores: Array.from(this.players.values())
				.filter((player) => isUuid(player.assignment.playerId))
				.map((player) => ({
					playerId: player.assignment.playerId,
					score: player.stats.score,
				})),
			...(standings.length > 0 ? { standings } : {}),
			...(targetSpectatorId ? { targetSpectatorId } : {}),
		};
	}

	private renderSpectatorSnapshot(snapshot: SpectatorSnapshot) {
		if (this.mode !== "spectator") return;
		this.phase = snapshot.phase;
		if (this.phase === "playing") this.clearCountdown();
		if (
			this.phase === "countdown" &&
			snapshot.countdownValue !== undefined &&
			snapshot.countdownValue !== this.countdownValue
		)
			this.showCountdown(
				snapshot.countdownValue === "FLICK"
					? "FLICK!"
					: String(snapshot.countdownValue),
			);
		this.finalStandings = snapshot.standings ?? [];
		const playerIds = new Set(
			snapshot.players.map((player) => player.playerId),
		);
		for (const playerId of this.players.keys())
			if (!playerIds.has(playerId)) this.removePlayer(playerId);
		const scores = new Map(
			snapshot.scores.map((score) => [score.playerId, score.score]),
		);
		for (const state of snapshot.players) {
			if (!this.players.has(state.playerId)) this.createPlayer(state);
			const player = this.players.get(state.playerId);
			if (!player) continue;
			player.sprite.setPosition(state.x, state.y).setRotation(state.rotation);
			player.angle = state.aimAngle;
			player.cooldownUntil = this.time.now + state.cooldownRemainingMs;
			player.ready = state.ready;
			player.aimActiveUntil =
				state.animationState === "aiming" ? this.time.now + 250 : 0;
			player.label.setText(
				`P${state.playerNumber}  ${state.ready ? "READY" : state.color.toUpperCase()}`,
			);
			player.projectileLabel.setText(
				`SCORE ${(scores.get(state.playerId) ?? 0).toString().padStart(3, "0")}`,
			);
			this.drawAim(player);
		}

		const projectileIds = new Set(
			snapshot.projectiles.map((projectile) => projectile.projectileId),
		);
		for (const projectileId of this.projectiles.keys())
			if (!projectileIds.has(projectileId))
				this.destroyProjectile(projectileId);
		for (const state of snapshot.projectiles) {
			if (!this.projectiles.has(state.projectileId))
				this.createSpectatorProjectile(state);
			this.projectiles
				.get(state.projectileId)
				?.body.setPosition(state.x, state.y)
				.setRotation(state.rotation);
		}

		for (const state of snapshot.props) {
			const prop = this.props.get(state.propId);
			if (!prop) continue;
			prop.health = state.health;
			prop.destroyed = state.destroyed;
			prop.body
				.setPosition(state.x, state.y)
				.setRotation(state.rotation)
				.setTexture(
					state.destroyed
						? `${PROP_DEFINITIONS[state.propType].textureKey}-broken`
						: state.damageState > 0
							? `${PROP_DEFINITIONS[state.propType].textureKey}-damaged`
							: PROP_DEFINITIONS[state.propType].textureKey,
				)
				.setVisible(true);
		}
	}

	private createSpectatorProjectile(
		state: SpectatorSnapshot["projectiles"][number],
	) {
		const definition = PROJECTILE_DEFINITIONS[state.projectileType];
		const body = this.matter.add
			.image(state.x, state.y, definition.textureKey, undefined, {
				label: `spectator-projectile:${state.projectileId}`,
				isStatic: true,
				isSensor: true,
				collisionFilter: { category: 0, mask: 0 },
			})
			.setDepth(5)
			.setRotation(state.rotation);
		this.projectiles.set(state.projectileId, {
			body,
			metadata: {
				projectileId: state.projectileId,
				ownerPlayerId: state.ownerPlayerId,
				projectileType: state.projectileType,
				practice: false,
				createdAt: this.time.now,
				scoredPlayerIds: new Set(),
				destroyedPropIds: new Set(),
				lastWorldImpactAt: 0,
			},
		});
	}

	private emitSpectatorPresentation(event: SpectatorPresentationEvent) {
		if (this.mode !== "host" || this.spectatorCount === 0) return;
		this.bridge.emit({ type: "spectator-presentation", event });
	}

	private playSpectatorPresentation(event: SpectatorPresentationEvent) {
		switch (event.type) {
			case "projectile-thrown":
				this.audio.play(PROJECTILE_AUDIO[event.projectileType].throw);
				break;
			case "player-hit": {
				this.audio.play(PROJECTILE_AUDIO[event.projectileType].impact);
				this.audio.play("player-hit");
				const target = this.players.get(event.targetPlayerId);
				this.effects?.impact(
					event.impactX,
					event.impactY,
					event.projectileType === "stapler",
					target ? PLAYER_HEX[target.assignment.color] : ARCADE_COLORS.white,
				);
				this.effects?.score(
					event.impactX,
					event.impactY - 42,
					event.score,
					ARCADE_COLORS.white,
				);
				if (target) {
					target.sprite.setTint(0xffffff);
					this.time.delayedCall(160, () => target.sprite.clearTint());
				}
				break;
			}
			case "prop-damaged":
				this.audio.play("medium-impact");
				this.effects?.particles(
					"dot",
					event.impactX,
					event.impactY,
					7,
					0xffb070,
				);
				break;
			case "prop-destroyed":
				this.audio.play(`${event.propType}-break`);
				this.effects?.destroyProp(event.propType, event.impactX, event.impactY);
				this.effects?.score(
					event.impactX,
					event.impactY - 36,
					event.score,
					ARCADE_COLORS.white,
				);
				break;
			case "countdown":
				this.showCountdown(
					event.value === "FLICK" ? "FLICK!" : String(event.value),
				);
				break;
			case "match-ended":
				this.audio.play("round-end");
				this.time.delayedCall(180, () => this.audio.play("winner"));
				if (!this.reducedMotion) this.effects?.confetti();
				break;
		}
	}

	private shutdown() {
		this.removeBridgeListener?.();
		this.matter.world.off("collisionstart", this.handleCollision, this);
		this.input.keyboard?.off("keydown", this.handleKeyboard, this);
		this.audio.destroy();
		this.effects?.destroy();
	}
}

function emptyStats(): PlayerRoundStats {
	return { score: 0, throws: 0, playerHits: 0, propsDestroyed: 0 };
}

function projectileName(type: ProjectileType) {
	if (type === "paper-ball") return "PAPER";
	if (type === "coffee-mug") return "MUG";
	return "STAPLER";
}

function isUuid(value: string) {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		value,
	);
}
