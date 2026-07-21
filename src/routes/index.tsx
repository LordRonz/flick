import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Github } from "lucide-react";
import { useState } from "react";
import { BrandMark } from "../components/BrandMark";
import { playUiCue } from "../game/audio/ArcadeAudio";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	const navigate = useNavigate();
	const [isCreating, setIsCreating] = useState(false);
	const [error, setError] = useState("");

	async function createGame() {
		setIsCreating(true);
		setError("");
		try {
			const response = await fetch("/api/rooms", { method: "POST" });
			const payload = (await response.json()) as {
				roomCode?: string;
				error?: string;
			};
			if (!response.ok || !payload.roomCode)
				throw new Error(payload.error ?? "Could not create room.");
			await navigate({ to: "/host", search: { room: payload.roomCode } });
		} catch (cause) {
			playUiCue("ui-error");
			setError(
				cause instanceof Error ? cause.message : "Could not create room.",
			);
		} finally {
			setIsCreating(false);
		}
	}

	return (
		<main className="landing-shell">
			<section className="landing-copy">
				<div className="brand-mark">
					<BrandMark />
				</div>
				<p className="eyebrow">PHONE AS CONTROLLER</p>
				<h1>
					Drag the aim.
					<br />
					<em>Flick the shot.</em>
				</h1>
				<p className="lede">
					Drag on your phone to aim, then flick or tap Throw to fire at the
					office arena on your laptop.
				</p>
				<button
					className="primary-button"
					type="button"
					onClick={createGame}
					onMouseEnter={() => playUiCue("ui-hover")}
					onFocus={() => playUiCue("ui-hover")}
					disabled={isCreating}
				>
					{isCreating ? "Creating room…" : "Create Game"}
					<span aria-hidden="true">↗</span>
				</button>
				{error ? (
					<p className="error-text" role="alert">
						{error}
					</p>
				) : null}
				<p className="microcopy">No account. One laptop. Two to four phones.</p>
				<a
					className="github-link"
					href="https://github.com/lordronz/flick"
					target="_blank"
					rel="noreferrer"
					aria-label="View Flick Arena on GitHub"
				>
					<Github aria-hidden="true" />
					<span>View on GitHub</span>
				</a>
			</section>
			<section className="landing-preview" aria-label="Flick game preview">
				<div className="preview-topline">
					<span>OFFICE MAYHEM</span>
				</div>
				<div className="preview-canvas">
					<div className="preview-windows">
						<i />
						<i />
						<i />
					</div>
					<div className="preview-city">
						<i />
						<i />
						<i />
						<i />
						<i />
					</div>
					<div className="preview-desk" />
					<div className="preview-mascot mascot-blue">
						<span>P1</span>
					</div>
					<div className="preview-mascot mascot-red">
						<span>P2</span>
					</div>
					<div className="preview-projectile" />
					<div className="preview-impact">BONK!</div>
				</div>
				<div className="preview-stats">
					<div>
						<span>AIM</span>
						<strong>DRAG</strong>
					</div>
					<div>
						<span>THROW</span>
						<strong>FLICK</strong>
					</div>
					<div>
						<span>GOAL</span>
						<strong>HIT TARGET</strong>
					</div>
				</div>
			</section>
		</main>
	);
}
