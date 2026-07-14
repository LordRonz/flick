import type Phaser from "phaser";
import { useEffect, useRef } from "react";
import type { GameBridge } from "../game/bridge/GameBridge";

type PhaserGameProps = {
	bridge: GameBridge;
	allowSinglePlayer?: boolean;
};

export function PhaserGame({
	bridge,
	allowSinglePlayer = false,
}: PhaserGameProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const gameRef = useRef<Phaser.Game | null>(null);

	useEffect(() => {
		if (!containerRef.current || gameRef.current) return;
		let cancelled = false;
		void import("../game/FlickGame").then(({ createFlickGame }) => {
			if (cancelled || !containerRef.current) return;
			gameRef.current = createFlickGame({
				parent: containerRef.current,
				bridge,
				allowSinglePlayer,
			});
		});
		return () => {
			cancelled = true;
			gameRef.current?.destroy(true);
			gameRef.current = null;
		};
	}, [allowSinglePlayer, bridge]);

	return <div ref={containerRef} className="phaser-game-container" />;
}
