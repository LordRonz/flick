export type ArcadeSoundCue =
	| "countdown"
	| "document-stack-break"
	| "final-countdown"
	| "heavy-impact"
	| "light-impact"
	| "medium-impact"
	| "monitor-break"
	| "mug-throw"
	| "paper-throw"
	| "plant-break"
	| "platform-impact"
	| "player-hit"
	| "player-join"
	| "player-ready"
	| "printer-break"
	| "round-end"
	| "round-start"
	| "stapler-throw"
	| "ui"
	| "ui-error"
	| "ui-hover"
	| "room-full"
	| "water-cooler-break"
	| "winner";

export type AudioLevels = { master: number; music: number; effects: number };

export type AudioPreferences = {
	muted: boolean;
	levels: AudioLevels;
};

export const DEFAULT_AUDIO_LEVELS: AudioLevels = {
	master: 0.9,
	music: 0.55,
	effects: 0.9,
};

const SOUNDTRACK_PATH = "/soundtrack.mp3";
const AUDIO_STORAGE_KEY = "flick-audio:v2";
const SFX_PATHS: Record<ArcadeSoundCue, string> = {
	ui: "/assets/audio/ui/click.wav",
	"ui-hover": "/assets/audio/ui/hover.wav",
	"ui-error": "/assets/audio/ui/error.wav",
	"room-full": "/assets/audio/ui/room-full.wav",
	"player-join": "/assets/audio/ui/player-join.wav",
	"player-ready": "/assets/audio/ui/player-ready.wav",
	countdown: "/assets/audio/match/countdown.wav",
	"final-countdown": "/assets/audio/match/final-countdown.wav",
	"round-start": "/assets/audio/match/round-start.wav",
	"round-end": "/assets/audio/match/round-end.wav",
	winner: "/assets/audio/match/winner.wav",
	"paper-throw": "/assets/audio/throws/paper-ball.wav",
	"mug-throw": "/assets/audio/throws/coffee-mug.wav",
	"stapler-throw": "/assets/audio/throws/stapler.wav",
	"light-impact": "/assets/audio/impacts/paper-light.wav",
	"medium-impact": "/assets/audio/impacts/mug-medium.wav",
	"heavy-impact": "/assets/audio/impacts/stapler-heavy.wav",
	"player-hit": "/assets/audio/impacts/player-hit.wav",
	"platform-impact": "/assets/audio/impacts/platform.wav",
	"monitor-break": "/assets/audio/destruction/monitor.wav",
	"printer-break": "/assets/audio/destruction/printer.wav",
	"plant-break": "/assets/audio/destruction/plant.wav",
	"water-cooler-break": "/assets/audio/destruction/water-cooler.wav",
	"document-stack-break": "/assets/audio/destruction/paper-stack.wav",
};

const BASE_VOLUME: Partial<Record<ArcadeSoundCue, number>> = {
	"heavy-impact": 0.78,
	"stapler-throw": 0.74,
	"light-impact": 0.58,
	"paper-throw": 0.5,
	ui: 0.46,
	"ui-hover": 0.34,
	"ui-error": 0.58,
	"room-full": 0.62,
	"platform-impact": 0.5,
};

const COOLDOWN_MS: Partial<Record<ArcadeSoundCue, number>> = {
	"light-impact": 45,
	"heavy-impact": 70,
	"player-hit": 80,
	ui: 35,
	"ui-hover": 70,
	"platform-impact": 70,
};

export type UiSoundCue = "ui-error" | "ui-hover" | "room-full";

const uiPools = new Map<UiSoundCue, HTMLAudioElement[]>();

export function readAudioPreferences(): AudioPreferences {
	const fallback = { muted: false, levels: { ...DEFAULT_AUDIO_LEVELS } };
	if (typeof window === "undefined") return fallback;
	try {
		const stored = JSON.parse(
			window.localStorage.getItem(AUDIO_STORAGE_KEY) ?? "null",
		) as { muted?: boolean; levels?: Partial<AudioLevels> } | null;
		if (!stored) return fallback;
		return {
			muted: stored.muted ?? false,
			levels: {
				master: clamp01(stored.levels?.master ?? DEFAULT_AUDIO_LEVELS.master),
				music: clamp01(stored.levels?.music ?? DEFAULT_AUDIO_LEVELS.music),
				effects: clamp01(
					stored.levels?.effects ?? DEFAULT_AUDIO_LEVELS.effects,
				),
			},
		};
	} catch {
		return fallback;
	}
}

export function playUiCue(cue: UiSoundCue) {
	const preferences = readAudioPreferences();
	if (preferences.muted || !globalThis.Audio) return;
	let pool = uiPools.get(cue);
	if (!pool) {
		pool = Array.from({ length: 2 }, () => {
			const sound = new Audio(SFX_PATHS[cue]);
			sound.preload = "auto";
			return sound;
		});
		uiPools.set(cue, pool);
	}
	const sound =
		pool.find((candidate) => candidate.paused || candidate.ended) ?? pool[0];
	if (!sound) return;
	sound.pause();
	sound.currentTime = 0;
	sound.volume =
		(BASE_VOLUME[cue] ?? 0.5) *
		preferences.levels.master *
		preferences.levels.effects;
	void sound.play().catch(() => undefined);
}

export class ArcadeAudio {
	private muted = false;
	private levels: AudioLevels = { ...DEFAULT_AUDIO_LEVELS };
	private soundtrack?: HTMLAudioElement;
	private soundtrackPrimed = false;
	private soundtrackWanted = false;
	private soundtrackFadeToken = 0;
	private readonly pools = new Map<ArcadeSoundCue, HTMLAudioElement[]>();
	private readonly lastPlayedAt = new Map<ArcadeSoundCue, number>();
	private readonly handleVisibilityChange = () => {
		const soundtrack = this.soundtrack;
		if (!soundtrack) return;
		if (document.hidden) {
			this.soundtrackFadeToken += 1;
			soundtrack.pause();
			return;
		}
		if (this.muted) return;
		if (this.soundtrackWanted) this.resumeSoundtrack(true);
		else if (this.soundtrackPrimed) this.resumeSoundtrack(false);
	};

	constructor() {
		this.restorePreferences();
		if (typeof document !== "undefined")
			document.addEventListener(
				"visibilitychange",
				this.handleVisibilityChange,
			);
	}

	setMuted(muted: boolean, persist = true) {
		this.muted = muted;
		if (persist) this.persistPreferences();
		if (muted) {
			for (const pool of this.pools.values())
				for (const sound of pool) sound.pause();
			if (this.soundtrack)
				this.fadeSoundtrack(0, 120, () => this.soundtrack?.pause());
			return;
		}
		if (this.soundtrackWanted) this.resumeSoundtrack(true);
		else if (this.soundtrackPrimed) this.resumeSoundtrack(false);
	}

	setLevels(levels: Partial<AudioLevels>) {
		this.levels = {
			master: clamp01(levels.master ?? this.levels.master),
			music: clamp01(levels.music ?? this.levels.music),
			effects: clamp01(levels.effects ?? this.levels.effects),
		};
		this.persistPreferences();
		if (this.soundtrack && !this.muted)
			this.soundtrack.volume = this.musicVolume();
	}

	preloadSoundtrack() {
		for (const cue of Object.keys(SFX_PATHS) as ArcadeSoundCue[])
			this.ensurePool(cue);
		this.ensureSoundtrack()?.load();
	}

	primeSoundtrack() {
		const soundtrack = this.ensureSoundtrack();
		if (!soundtrack) return;
		this.soundtrackFadeToken += 1;
		this.soundtrackPrimed = true;
		this.soundtrackWanted = false;
		soundtrack.currentTime = 0;
		soundtrack.volume = 0;
		if (!this.muted) this.resumeSoundtrack(false);
	}

	startSoundtrack() {
		const soundtrack = this.ensureSoundtrack();
		if (!soundtrack) return;
		const startFromBeginning = this.soundtrackPrimed;
		this.soundtrackPrimed = false;
		this.soundtrackWanted = true;
		if (startFromBeginning) soundtrack.currentTime = 0;
		if (!this.muted) this.resumeSoundtrack(true);
	}

	stopSoundtrack({ rewind = true }: { rewind?: boolean } = {}) {
		this.soundtrackPrimed = false;
		this.soundtrackWanted = false;
		if (!this.soundtrack) return;
		this.fadeSoundtrack(0, 180, () => {
			this.soundtrack?.pause();
			if (rewind && this.soundtrack) this.soundtrack.currentTime = 0;
		});
	}

	unlock() {
		if (this.muted) return;
		const sound = this.ensurePool("ui")[0];
		if (!sound) return;
		sound.volume = 0;
		void sound
			.play()
			.then(() => sound.pause())
			.catch(() => undefined);
	}

	play(cue: ArcadeSoundCue) {
		if (this.muted || typeof performance === "undefined") return;
		const now = performance.now();
		const cooldown = COOLDOWN_MS[cue] ?? 0;
		if (now - (this.lastPlayedAt.get(cue) ?? -Infinity) < cooldown) return;
		this.lastPlayedAt.set(cue, now);
		const pool = this.ensurePool(cue);
		const sound =
			pool.find((candidate) => candidate.paused || candidate.ended) ?? pool[0];
		if (!sound) return;
		sound.pause();
		sound.currentTime = 0;
		sound.volume = Math.min(
			1,
			(BASE_VOLUME[cue] ?? 0.64) * this.levels.master * this.levels.effects,
		);
		sound.playbackRate = 0.96 + Math.random() * 0.08;
		void sound.play().catch(() => undefined);
	}

	destroy() {
		if (typeof document !== "undefined")
			document.removeEventListener(
				"visibilitychange",
				this.handleVisibilityChange,
			);
		this.soundtrackFadeToken += 1;
		this.soundtrack?.pause();
		this.soundtrack?.removeAttribute("src");
		for (const pool of this.pools.values())
			for (const sound of pool) {
				sound.pause();
				sound.removeAttribute("src");
			}
		this.pools.clear();
		this.soundtrack = undefined;
	}

	private ensurePool(cue: ArcadeSoundCue) {
		const existing = this.pools.get(cue);
		if (existing) return existing;
		const AudioConstructor = globalThis.Audio;
		if (!AudioConstructor) return [];
		const limit = cue.includes("impact") || cue === "player-hit" ? 3 : 2;
		const pool = Array.from({ length: limit }, () => {
			const sound = new AudioConstructor(SFX_PATHS[cue]);
			sound.preload = "auto";
			sound.setAttribute("playsinline", "");
			sound.load();
			return sound;
		});
		this.pools.set(cue, pool);
		return pool;
	}

	private ensureSoundtrack() {
		if (this.soundtrack) return this.soundtrack;
		const AudioConstructor = globalThis.Audio;
		if (!AudioConstructor) return undefined;
		const soundtrack = new AudioConstructor(SOUNDTRACK_PATH);
		soundtrack.loop = true;
		soundtrack.preload = "auto";
		soundtrack.volume = 0;
		soundtrack.setAttribute("playsinline", "");
		this.soundtrack = soundtrack;
		return soundtrack;
	}

	private resumeSoundtrack(fadeIn: boolean) {
		const soundtrack = this.soundtrack;
		if (!soundtrack || this.muted || document.hidden) return;
		this.soundtrackFadeToken += 1;
		if (!fadeIn) soundtrack.volume = 0;
		void soundtrack
			.play()
			.then(() => {
				if (
					this.muted ||
					document.hidden ||
					(!this.soundtrackWanted && !this.soundtrackPrimed)
				) {
					soundtrack.pause();
					return;
				}
				if (this.soundtrackWanted)
					this.fadeSoundtrack(this.musicVolume(), fadeIn ? 650 : 450);
			})
			.catch(() => undefined);
	}

	private musicVolume() {
		return Math.min(1, 0.202 * this.levels.master * this.levels.music);
	}

	private fadeSoundtrack(
		targetVolume: number,
		durationMs: number,
		onComplete?: () => void,
	) {
		const soundtrack = this.soundtrack;
		if (!soundtrack) return;
		const token = ++this.soundtrackFadeToken;
		const initialVolume = soundtrack.volume;
		const startedAt = performance.now();
		const update = (now: number) => {
			if (token !== this.soundtrackFadeToken || !this.soundtrack) return;
			const progress = clamp01((now - startedAt) / durationMs);
			const eased = 1 - (1 - progress) ** 3;
			soundtrack.volume = clamp01(
				initialVolume + (targetVolume - initialVolume) * eased,
			);
			if (progress < 1) requestAnimationFrame(update);
			else onComplete?.();
		};
		requestAnimationFrame(update);
	}

	private restorePreferences() {
		const preferences = readAudioPreferences();
		this.muted = preferences.muted;
		this.levels = preferences.levels;
	}

	private persistPreferences() {
		if (typeof window === "undefined") return;
		try {
			window.localStorage.setItem(
				AUDIO_STORAGE_KEY,
				JSON.stringify({ muted: this.muted, levels: this.levels }),
			);
		} catch {
			// Private browsing can disable storage without disabling sound.
		}
	}
}

function clamp01(value: number) {
	return Math.max(0, Math.min(1, value));
}
