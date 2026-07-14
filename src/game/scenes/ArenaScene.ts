import Phaser from "phaser";
import type { GameBridge } from "../bridge/GameBridge";
import type { ReactToGameEvent } from "../bridge/game-events";
import {
	GAME_HEIGHT,
	GAME_WIDTH,
	PLATFORM_LAYOUT,
	STATIONS,
} from "../config/arena";
import {
	MAX_ACTIVE_PROJECTILES,
	nextProjectileType,
	PROJECTILE_DEFINITIONS,
} from "../config/projectiles";
import { PROP_DEFINITIONS, PROP_LAYOUT } from "../config/props";
import { mapAimAngle, mapThrowSpeed, smoothAim } from "../systems/aim";
import { clamp } from "../systems/math";
import { canScoreAgainst, hitScore, propScore } from "../systems/scoring";
import type {
	MatchPhase,
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

const PLAYER_HEX = {
	blue: 0x44d8e4,
	red: 0xff665a,
	green: 0x74e6b2,
	yellow: 0xffd166,
} as const;

type ProjectileMetadata = {
	projectileId: string;
	ownerPlayerId: string;
	projectileType: ProjectileType;
	createdAt: number;
	scoredPlayerIds: Set<string>;
	destroyedPropIds: Set<string>;
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
	normalizedX: number;
	angle: number;
	cooldownUntil: number;
	throwCount: number;
	nextType: ProjectileType;
	ready: boolean;
	stats: PlayerRoundStats;
};

type CollisionPair = { bodyA: { label?: string }; bodyB: { label?: string } };

export class ArenaScene extends Phaser.Scene {
	private readonly bridge: GameBridge;
	private readonly allowSinglePlayer: boolean;
	private readonly players = new Map<string, PlayerState>();
	private readonly projectiles = new Map<string, ProjectileState>();
	private readonly props = new Map<string, PropState>();
	private phase: MatchPhase = "lobby";
	private matchEndsAt = 0;
	private lastTimerSecond = -1;
	private countdownEvent?: Phaser.Time.TimerEvent;
	private countdownText?: Phaser.GameObjects.Text;
	private particles?: Phaser.GameObjects.Particles.ParticleEmitter;
	private performanceText?: Phaser.GameObjects.Text;
	private lastPerformanceUpdate = 0;
	private removeBridgeListener?: () => void;

	constructor(bridge: GameBridge, allowSinglePlayer: boolean) {
		super({ key: "ArenaScene" });
		this.bridge = bridge;
		this.allowSinglePlayer = allowSinglePlayer;
	}

	create() {
		this.buildArena();
		this.buildProps();
		this.particles = this.add.particles(0, 0, "particle", {
			lifespan: 480,
			speed: { min: 80, max: 230 },
			angle: { min: 0, max: 360 },
			scale: { start: 1.1, end: 0 },
			quantity: 8,
			emitting: false,
			maxParticles: 80,
		});
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
		this.matter.world.on("collisionstart", this.handleCollision, this);
		this.input.keyboard?.on("keydown", this.handleKeyboard, this);
		this.events.once("shutdown", this.shutdown, this);
		this.bridge.emit({ type: "game-ready" });
	}

	update() {
		if (this.phase === "playing") this.updateTimer();
		const now = this.time.now;
		for (const player of this.players.values()) {
			player.angle = smoothAim(
				player.angle,
				mapAimAngle(
					player.normalizedX,
					STATIONS[player.assignment.playerNumber].aim,
				),
			);
			this.drawAim(player);
			const cooldown = Math.max(0, player.cooldownUntil - now);
			player.projectileLabel.setText(
				cooldown > 0
					? `COOLDOWN ${(cooldown / 1000).toFixed(1)}s`
					: `NEXT ${projectileName(player.nextType)}`,
			);
			player.projectileLabel.setColor(cooldown > 0 ? "#8ea2a5" : "#edf7f5");
		}
		for (const [projectileId, projectile] of this.projectiles) {
			const definition =
				PROJECTILE_DEFINITIONS[projectile.metadata.projectileType];
			const body = projectile.body;
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
	}

	private buildArena() {
		const background = this.add.graphics().setDepth(-10);
		background.fillStyle(0x081016, 1);
		background.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
		background.fillStyle(0x14232b, 1);
		background.fillRect(0, 525, GAME_WIDTH, 195);
		background.fillStyle(0x1a3137, 0.8);
		background.fillRect(0, 0, GAME_WIDTH, 140);
		background.lineStyle(2, 0x2e5960, 0.7);
		for (let x = 90; x < GAME_WIDTH; x += 170) {
			background.strokeRect(x, 26, 118, 86);
			background.lineBetween(x + 59, 26, x + 59, 112);
		}
		background.lineStyle(1, 0x31535b, 0.3);
		for (let x = 0; x <= GAME_WIDTH; x += 44)
			background.lineBetween(x, 525, x, GAME_HEIGHT);
		for (let y = 555; y <= GAME_HEIGHT; y += 35)
			background.lineBetween(0, y, GAME_WIDTH, y);

		for (const platform of PLATFORM_LAYOUT) {
			this.add
				.rectangle(
					platform.x,
					platform.y,
					platform.width,
					platform.height,
					0x33545a,
					1,
				)
				.setDepth(1);
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
		for (const wall of [
			{ x: -12, y: GAME_HEIGHT / 2, width: 24, height: GAME_HEIGHT },
			{
				x: GAME_WIDTH + 12,
				y: GAME_HEIGHT / 2,
				width: 24,
				height: GAME_HEIGHT,
			},
		]) {
			this.matter.add.rectangle(wall.x, wall.y, wall.width, wall.height, {
				isStatic: true,
				label: "world",
				collisionFilter: {
					category: COLLISION_CATEGORY.WORLD,
					mask: COLLISION_CATEGORY.PROJECTILE,
				},
			});
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
				.circle(station.x, station.y + 38, 52, tint, 0.09)
				.setStrokeStyle(2, tint, 0.35)
				.setDepth(0);
			this.add
				.text(station.x, station.y + 86, `P${station.playerNumber} STATION`, {
					color: "#5e7a80",
					fontFamily: "DM Mono, monospace",
					fontSize: "10px",
					letterSpacing: 2,
				})
				.setOrigin(0.5)
				.setDepth(2);
		}
		this.add
			.text(42, 34, "FLICK ARENA // OFFICE BATTLE", {
				color: "#74e6b2",
				fontFamily: "DM Mono, monospace",
				fontSize: "13px",
				letterSpacing: 3,
			})
			.setDepth(4);
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
				break;
			case "player-calibration":
				this.setPlayerLabel(
					command.playerId,
					command.calibrated ? "CALIBRATED" : "CALIBRATE",
				);
				break;
			case "orientation": {
				const player = this.players.get(command.playerId);
				if (player) player.normalizedX = clamp(command.normalizedX, -1, 1);
				break;
			}
			case "flick":
				this.launchForPlayer(command.playerId, command.intensity);
				break;
			case "start-match":
				this.startMatch();
				break;
			case "reset-match":
				this.resetMatch();
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
					color: `#${tint.toString(16).padStart(6, "0")}`,
					fontFamily: "DM Mono, monospace",
					fontSize: "12px",
					letterSpacing: 1,
				},
			)
			.setOrigin(0.5)
			.setDepth(7);
		const projectileLabel = this.add
			.text(station.x, station.y + 58, "", {
				color: "#edf7f5",
				fontFamily: "DM Mono, monospace",
				fontSize: "10px",
				letterSpacing: 1,
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
			normalizedX: 0,
			angle: station.aim.defaultAngle,
			cooldownUntil: 0,
			throwCount: 0,
			nextType,
			ready: false,
			stats: emptyStats(),
		};
		this.players.set(assignment.playerId, player);
		this.setPlayerLabel(assignment.playerId, "CALIBRATE");
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
		graphic.clear();
		graphic.lineStyle(2, tint, 0.18);
		graphic.lineBetween(
			station.x,
			station.y,
			station.x + Math.cos(player.angle) * 164,
			station.y + Math.sin(player.angle) * 164,
		);
		for (let index = 1; index <= 7; index += 1) {
			const distance = index * 31;
			graphic.fillStyle(tint, 0.32 - index * 0.025);
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
				if (index === labels.length - 1) this.startPlaying();
			},
		});
	}

	private startPlaying() {
		this.countdownText?.setVisible(false);
		this.phase = "playing";
		this.matchEndsAt = this.time.now + 60_000;
		this.lastTimerSecond = -1;
		this.bridge.emit({ type: "phase-changed", phase: this.phase });
		this.bridge.emit({ type: "timer-changed", timeRemainingMs: 60_000 });
	}

	private showCountdown(label: string) {
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
			duration: 550,
			ease: "Back.Out",
		});
	}

	private updateTimer() {
		const timeRemainingMs = Math.max(0, this.matchEndsAt - this.time.now);
		const second = Math.ceil(timeRemainingMs / 1000);
		if (second !== this.lastTimerSecond) {
			this.lastTimerSecond = second;
			this.bridge.emit({ type: "timer-changed", timeRemainingMs });
		}
		if (timeRemainingMs <= 0) this.endMatch();
	}

	private launchForPlayer(playerId: string, intensity: number) {
		const player = this.players.get(playerId);
		if (
			!player ||
			this.phase !== "playing" ||
			this.time.now < player.cooldownUntil
		)
			return;
		if (this.projectiles.size >= MAX_ACTIVE_PROJECTILES) return;
		const projectileType = player.nextType;
		const definition = PROJECTILE_DEFINITIONS[projectileType];
		const projectileId = crypto.randomUUID();
		const station = STATIONS[player.assignment.playerNumber];
		const x = station.x + Math.cos(player.angle) * 44;
		const y = station.y + Math.sin(player.angle) * 44;
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
		const speed = mapThrowSpeed(intensity) * 24 * definition.speedMultiplier;
		body.setVelocity(
			Math.cos(player.angle) * speed,
			Math.sin(player.angle) * speed,
		);
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
			createdAt: this.time.now,
			scoredPlayerIds: new Set([playerId]),
			destroyedPropIds: new Set(),
		};
		this.projectiles.set(projectileId, { body, metadata });
		player.stats.throws += 1;
		player.throwCount += 1;
		player.nextType = nextProjectileType(
			player.throwCount,
			player.assignment.playerNumber,
		);
		player.cooldownUntil = this.time.now + 650;
		this.bridge.emit({ type: "projectile-thrown", playerId, projectileType });
		this.bridge.emit({
			type: "stats-changed",
			playerId,
			stats: { ...player.stats },
		});
		this.tweens.add({
			targets: player.sprite,
			scaleX: 1.18,
			scaleY: 0.86,
			duration: 100,
			yoyo: true,
			ease: "Quad.Out",
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
		}
	}

	private handlePlayerHit(projectileId: string, targetPlayerId: string) {
		const projectile = this.projectiles.get(projectileId);
		const target = this.players.get(targetPlayerId);
		if (
			!projectile ||
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
		this.emitScore(attacker);
		this.bridge.emit({
			type: "player-hit",
			attackerPlayerId: attacker.assignment.playerId,
			targetPlayerId,
			score,
		});
		this.spawnBurst(
			target.sprite.x,
			target.sprite.y,
			PLAYER_HEX[target.assignment.color],
			10,
		);
		target.sprite.setTint(0xffffff);
		this.tweens.add({
			targets: target.sprite,
			scale: 1.2,
			duration: 110,
			yoyo: true,
			onComplete: () => target.sprite.clearTint(),
		});
		this.cameras.main.shake(
			projectile.metadata.projectileType === "stapler" ? 150 : 80,
			projectile.metadata.projectileType === "stapler" ? 0.012 : 0.005,
		);
	}

	private handlePropHit(projectileId: string, propId: string) {
		const projectile = this.projectiles.get(projectileId);
		const prop = this.props.get(propId);
		if (
			!projectile ||
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
		prop.body.setTint(0xffb070);
		this.tweens.add({
			targets: prop.body,
			x: prop.body.x + 5,
			duration: 55,
			yoyo: true,
			repeat: 2,
			onComplete: () => prop.body.clearTint(),
		});
		this.spawnBurst(prop.body.x, prop.body.y, 0xffb070, 7);
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
		}
		this.spawnBurst(prop.body.x, prop.body.y, 0xffd166, 18);
		this.tweens.add({
			targets: prop.body,
			alpha: 0,
			scale: 1.25,
			duration: 220,
			onComplete: () => prop.body.destroy(),
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

	private spawnBurst(x: number, y: number, color: number, quantity: number) {
		if (!this.particles) return;
		this.particles.setParticleTint(color);
		this.particles.explode(Math.min(quantity, 20), x, y);
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
			player.cooldownUntil = 0;
			this.emitScore(player);
		}
	}

	private resetMatch() {
		this.resetRoundState();
		this.phase = "lobby";
		this.matchEndsAt = 0;
		this.lastTimerSecond = -1;
		this.countdownText?.setVisible(false);
		this.bridge.emit({ type: "phase-changed", phase: this.phase });
		this.bridge.emit({ type: "timer-changed", timeRemainingMs: 0 });
	}

	private endMatch() {
		if (this.phase !== "playing") return;
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
		this.bridge.emit({ type: "phase-changed", phase: this.phase });
		this.bridge.emit({ type: "timer-changed", timeRemainingMs: 0 });
		this.bridge.emit({ type: "match-ended", standings });
		const winner = this.players.get(standings[0]?.playerId ?? "");
		if (winner)
			this.tweens.add({
				targets: winner.sprite,
				scale: 1.24,
				duration: 360,
				yoyo: true,
				repeat: 2,
			});
		this.spawnBurst(GAME_WIDTH / 2, 220, 0x74e6b2, 20);
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
			player.normalizedX = clamp(
				player.normalizedX + action.direction * 0.18,
				-1,
				1,
			);
		if (action.throw) this.launchForPlayer(player.assignment.playerId, 0.78);
	}

	private shutdown() {
		this.removeBridgeListener?.();
		this.matter.world.off("collisionstart", this.handleCollision, this);
		this.input.keyboard?.off("keydown", this.handleKeyboard, this);
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
