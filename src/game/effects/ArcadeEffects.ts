import Phaser from "phaser";
import { ARCADE_COLORS, EFFECT_LIMITS } from "../art/tokens";
import type { ProjectileType, PropType } from "../types";

type EffectKind =
	| "dot"
	| "paper"
	| "coffee"
	| "ceramic"
	| "spark"
	| "water"
	| "leaf";

export class ArcadeEffects {
	private readonly transients = new Set<
		Phaser.GameObjects.Image | Phaser.GameObjects.Text
	>();
	private readonly lastTrailAt = new WeakMap<object, number>();
	private hitStopActive = false;

	constructor(
		private readonly scene: Phaser.Scene,
		private readonly reducedMotion: boolean,
	) {}

	trail(
		projectile: Phaser.Physics.Matter.Image,
		type: ProjectileType,
		now: number,
	) {
		if (this.reducedMotion) return;
		const last = this.lastTrailAt.get(projectile) ?? 0;
		if (now - last < EFFECT_LIMITS.trailIntervalMs) return;
		this.lastTrailAt.set(projectile, now);
		const kind: EffectKind =
			type === "paper-ball"
				? "paper"
				: type === "coffee-mug"
					? "coffee"
					: "spark";
		this.piece(kind, projectile.x, projectile.y, {
			alpha: 0.7,
			duration: 240,
			scale: type === "stapler" ? 0.7 : 0.45,
			vx: Phaser.Math.Between(-18, 18),
			vy: Phaser.Math.Between(12, 35),
		});
	}

	impact(
		x: number,
		y: number,
		heavy: boolean,
		color: number = ARCADE_COLORS.white,
	) {
		this.burst("dot", x, y, heavy ? 14 : 8, color, heavy ? 210 : 150);
		this.shake(heavy ? 150 : 75, heavy ? 0.012 : 0.005);
		this.hitStop(heavy ? 44 : 24);
	}

	particles(
		kind: EffectKind,
		x: number,
		y: number,
		quantity: number,
		tint: number,
		speed = 170,
	) {
		this.burst(kind, x, y, quantity, tint, speed);
	}

	destroyProp(type: PropType, x: number, y: number) {
		const kind: EffectKind =
			type === "monitor"
				? "spark"
				: type === "printer" || type === "document-stack"
					? "paper"
					: type === "plant"
						? "leaf"
						: "water";
		const tint =
			type === "monitor"
				? ARCADE_COLORS.gold
				: type === "plant"
					? ARCADE_COLORS.green
					: type === "water-cooler"
						? 0x4cc9f0
						: ARCADE_COLORS.white;
		this.burst(kind, x, y, EFFECT_LIMITS.debrisPerImpact, tint, 220);
		if (type === "printer")
			this.burst("paper", x, y - 18, 10, ARCADE_COLORS.white, 170);
		this.shake(180, 0.014);
		this.hitStop(52);
	}

	score(x: number, y: number, score: number, color: number) {
		const popup = this.scene.add
			.text(x, y, `+${score}`, {
				color: `#${color.toString(16).padStart(6, "0")}`,
				fontFamily: "Arial Black, system-ui, sans-serif",
				fontSize: "30px",
				fontStyle: "bold",
				stroke: "#172033",
				strokeThickness: 7,
			})
			.setOrigin(0.5)
			.setDepth(30);
		this.track(popup);
		this.scene.tweens.add({
			targets: popup,
			y: y - (this.reducedMotion ? 12 : 62),
			scale: 1.18,
			alpha: 0,
			duration: this.reducedMotion ? 200 : 720,
			ease: "Quint.Out",
			onComplete: () => this.remove(popup),
		});
	}

	confetti() {
		if (this.reducedMotion) return;
		for (let index = 0; index < 44; index += 1) {
			const colors = [
				ARCADE_COLORS.blue,
				ARCADE_COLORS.red,
				ARCADE_COLORS.green,
				ARCADE_COLORS.yellow,
			];
			this.piece(
				index % 3 === 0 ? "paper" : "dot",
				Phaser.Math.Between(120, 1160),
				Phaser.Math.Between(60, 170),
				{
					tint: colors[index % colors.length],
					duration: Phaser.Math.Between(900, 1500),
					scale: Phaser.Math.FloatBetween(0.55, 1.1),
					vx: Phaser.Math.Between(-90, 90),
					vy: Phaser.Math.Between(240, 420),
				},
			);
		}
	}

	destroy() {
		for (const transient of this.transients) transient.destroy();
		this.transients.clear();
	}

	private burst(
		kind: EffectKind,
		x: number,
		y: number,
		quantity: number,
		tint: number,
		speed: number,
	) {
		for (let index = 0; index < quantity; index += 1) {
			const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
			const velocity = Phaser.Math.Between(speed * 0.45, speed);
			this.piece(kind, x, y, {
				tint,
				duration: Phaser.Math.Between(360, 720),
				scale: Phaser.Math.FloatBetween(0.55, 1.2),
				vx: Math.cos(angle) * velocity,
				vy: Math.sin(angle) * velocity,
			});
		}
	}

	private piece(
		kind: EffectKind,
		x: number,
		y: number,
		options: {
			alpha?: number;
			duration: number;
			scale: number;
			tint?: number;
			vx: number;
			vy: number;
		},
	) {
		if (this.transients.size >= EFFECT_LIMITS.transients) return;
		const image = this.scene.add
			.image(x, y, `fx-${kind}`)
			.setDepth(24)
			.setAlpha(options.alpha ?? 1)
			.setScale(options.scale)
			.setAngle(Phaser.Math.Between(-180, 180));
		if (options.tint) image.setTint(options.tint);
		this.track(image);
		this.scene.tweens.add({
			targets: image,
			x: x + options.vx * 0.55,
			y: y + options.vy * 0.55 + 70,
			angle: image.angle + Phaser.Math.Between(-220, 220),
			alpha: 0,
			duration: this.reducedMotion
				? Math.min(180, options.duration)
				: options.duration,
			ease: "Quad.Out",
			onComplete: () => this.remove(image),
		});
	}

	private shake(duration: number, intensity: number) {
		if (!this.reducedMotion) this.scene.cameras.main.shake(duration, intensity);
	}

	private hitStop(duration: number) {
		if (this.reducedMotion || this.hitStopActive) return;
		// Spectator scenes keep their physics world paused permanently;
		// resuming it here would leave the engine running forever.
		if (!this.scene.matter.world.enabled) return;
		this.hitStopActive = true;
		this.scene.matter.world.pause();
		this.scene.time.delayedCall(duration, () => {
			this.scene.matter.world.resume();
			this.hitStopActive = false;
		});
	}

	private track<T extends Phaser.GameObjects.Image | Phaser.GameObjects.Text>(
		value: T,
	) {
		this.transients.add(value);
		return value;
	}

	private remove(value: Phaser.GameObjects.Image | Phaser.GameObjects.Text) {
		this.transients.delete(value);
		value.destroy();
	}
}
