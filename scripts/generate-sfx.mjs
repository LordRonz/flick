import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const SAMPLE_RATE = 44_100;
const seedArg = process.argv.find((value) => value.startsWith("--seed="));
const seed = Number(seedArg?.split("=")[1] ?? 20260716) >>> 0;

function randomFor(offset) {
	let state = (seed + offset * 0x9e3779b9) >>> 0;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 0xffffffff;
	};
}

function render(duration, layers, offset) {
	const length = Math.ceil(duration * SAMPLE_RATE);
	const samples = new Float32Array(length);
	const random = randomFor(offset);
	for (let index = 0; index < length; index += 1) {
		const t = index / SAMPLE_RATE;
		let value = 0;
		for (const layer of layers) value += layer(t, duration, random);
		const edge = Math.min(1, t / 0.006, (duration - t) / 0.018);
		samples[index] = Math.max(-0.82, Math.min(0.82, value * Math.max(0, edge)));
	}
	return encodeWav(samples);
}

const env = (t, duration, power = 2) => Math.max(0, 1 - t / duration) ** power;
const tone = (start, end, gain, shape = "sine", attack = 0.004) => (t, duration) => {
	const progress = t / duration;
	const frequency = start + (end - start) * progress;
	const phase = Math.PI * 2 * frequency * t;
	const wave = shape === "square" ? Math.sign(Math.sin(phase)) : shape === "triangle" ? (2 / Math.PI) * Math.asin(Math.sin(phase)) : Math.sin(phase);
	return wave * gain * Math.min(1, t / attack) * env(t, duration, 1.7);
};
const noise = (gain, power = 3) => (t, duration, random) => (random() * 2 - 1) * gain * env(t, duration, power);
const click = (gain, cutoff = 0.025) => (t, _duration, random) => t < cutoff ? (random() * 2 - 1) * gain * (1 - t / cutoff) : 0;
const pulse = (frequency, gain, rate) => (t, duration) => Math.sin(Math.PI * 2 * frequency * t) * gain * env(t, duration, 1.4) * (Math.sin(Math.PI * 2 * rate * t) > 0 ? 1 : 0.25);

const sounds = [
	["ui/hover.wav", 0.07, [tone(620, 820, 0.17, "triangle")]],
	["ui/click.wav", 0.09, [tone(440, 720, 0.24, "triangle"), click(0.1)]],
	["ui/player-join.wav", 0.28, [tone(340, 680, 0.24, "triangle"), tone(510, 910, 0.14)]],
	["ui/player-ready.wav", 0.24, [tone(520, 780, 0.2, "square"), tone(780, 1040, 0.12)]],
	["ui/error.wav", 0.2, [tone(210, 145, 0.25, "square"), tone(150, 105, 0.12)]],
	["ui/room-full.wav", 0.3, [pulse(180, 0.2, 12), tone(160, 90, 0.16, "square")]],
	["match/countdown.wav", 0.16, [tone(390, 390, 0.24, "square"), click(0.08)]],
	["match/final-countdown.wav", 0.14, [tone(700, 860, 0.22, "square"), click(0.07)]],
	["match/round-start.wav", 0.44, [tone(330, 760, 0.2, "square"), tone(495, 1140, 0.12, "triangle")]],
	["match/round-end.wav", 0.5, [tone(390, 170, 0.23, "triangle"), tone(260, 120, 0.12)]],
	["match/winner.wav", 0.72, [pulse(523, 0.18, 4), pulse(659, 0.16, 5), pulse(784, 0.14, 6)]],
	["throws/paper-ball.wav", 0.13, [noise(0.18, 4), tone(980, 460, 0.12, "triangle")]],
	["throws/coffee-mug.wav", 0.18, [tone(530, 230, 0.2, "triangle"), noise(0.08, 5)]],
	["throws/stapler.wav", 0.23, [tone(200, 72, 0.28, "square"), click(0.18, 0.04)]],
	["impacts/paper-light.wav", 0.1, [noise(0.21, 5), tone(240, 130, 0.1)]],
	["impacts/mug-medium.wav", 0.18, [tone(480, 150, 0.19, "triangle"), click(0.2, 0.05), noise(0.1, 4)]],
	["impacts/stapler-heavy.wav", 0.24, [tone(120, 42, 0.32, "square"), click(0.2, 0.06), noise(0.1, 5)]],
	["impacts/player-hit.wav", 0.2, [tone(270, 100, 0.24, "square"), tone(540, 210, 0.1), click(0.12)]],
	["impacts/platform.wav", 0.13, [tone(160, 85, 0.2, "triangle"), click(0.15)]],
	["destruction/monitor.wav", 0.34, [noise(0.2, 2.6), pulse(1200, 0.13, 28), tone(260, 90, 0.14)]],
	["destruction/printer.wav", 0.38, [noise(0.22, 2.1), pulse(430, 0.12, 17), tone(190, 80, 0.16)]],
	["destruction/plant.wav", 0.3, [noise(0.2, 2.4), tone(330, 130, 0.13, "triangle")]],
	["destruction/water-cooler.wav", 0.44, [noise(0.2, 1.8), pulse(720, 0.11, 19), tone(250, 105, 0.13)]],
	["destruction/paper-stack.wav", 0.38, [noise(0.25, 1.7), pulse(980, 0.08, 23)]],
];

for (let index = 0; index < sounds.length; index += 1) {
	const [relativePath, duration, layers] = sounds[index];
	const outputPath = resolve("public/assets/audio", relativePath);
	await mkdir(dirname(outputPath), { recursive: true });
	await writeFile(outputPath, render(duration, layers, index + 1));
}

console.log(`Generated ${sounds.length} mono WAV files at ${SAMPLE_RATE} Hz (seed ${seed}).`);

function encodeWav(samples) {
	const dataSize = samples.length * 2;
	const buffer = Buffer.alloc(44 + dataSize);
	buffer.write("RIFF", 0);
	buffer.writeUInt32LE(36 + dataSize, 4);
	buffer.write("WAVE", 8);
	buffer.write("fmt ", 12);
	buffer.writeUInt32LE(16, 16);
	buffer.writeUInt16LE(1, 20);
	buffer.writeUInt16LE(1, 22);
	buffer.writeUInt32LE(SAMPLE_RATE, 24);
	buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
	buffer.writeUInt16LE(2, 32);
	buffer.writeUInt16LE(16, 34);
	buffer.write("data", 36);
	buffer.writeUInt32LE(dataSize, 40);
	for (let index = 0; index < samples.length; index += 1) buffer.writeInt16LE(Math.round(samples[index] * 32767), 44 + index * 2);
	return buffer;
}
