import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArcadeAudio } from "./ArcadeAudio";

class FakeAudio {
	static latest?: FakeAudio;
	currentTime = 12;
	loop = false;
	preload = "";
	src: string;
	volume = 1;
	load = vi.fn();
	pause = vi.fn();
	play = vi.fn(() => Promise.resolve());
	removeAttribute = vi.fn();
	setAttribute = vi.fn();

	constructor(src: string) {
		this.src = src;
		FakeAudio.latest = this;
	}
}

describe("ArcadeAudio soundtrack", () => {
	beforeEach(() => {
		FakeAudio.latest = undefined;
		vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);
		vi.stubGlobal("document", {
			hidden: false,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		});
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			callback(performance.now() + 1_000);
			return 1;
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("preloads silently, then fades in from the beginning for active play", async () => {
		const audio = new ArcadeAudio();
		audio.preloadSoundtrack();
		const soundtrack = FakeAudio.latest;
		expect(soundtrack?.src).toBe("/soundtrack.mp3");
		expect(soundtrack?.loop).toBe(true);
		expect(soundtrack?.load).toHaveBeenCalledOnce();

		audio.primeSoundtrack();
		expect(soundtrack?.currentTime).toBe(0);
		expect(soundtrack?.volume).toBe(0);
		expect(soundtrack?.play).toHaveBeenCalledOnce();

		audio.startSoundtrack();
		await Promise.resolve();
		expect(soundtrack?.currentTime).toBe(0);
		expect(soundtrack?.volume).toBeCloseTo(0.1);
	});

	it("pauses on mute, resumes during play, and rewinds at round end", async () => {
		const audio = new ArcadeAudio();
		audio.primeSoundtrack();
		audio.startSoundtrack();
		await Promise.resolve();

		audio.setMuted(true);
		expect(FakeAudio.latest?.pause).toHaveBeenCalledOnce();
		audio.setMuted(false);
		await Promise.resolve();
		expect(FakeAudio.latest?.play).toHaveBeenCalledTimes(3);

		audio.stopSoundtrack();
		expect(FakeAudio.latest?.pause).toHaveBeenCalledTimes(2);
		expect(FakeAudio.latest?.currentTime).toBe(0);
	});
});
