import type { GameToReactEvent, ReactToGameEvent } from "./game-events";

type Listener<T> = (event: T) => void;

export class GameBridge {
	private readonly commandListeners = new Set<Listener<ReactToGameEvent>>();
	private readonly eventListeners = new Set<Listener<GameToReactEvent>>();
	private readonly pendingCommands: ReactToGameEvent[] = [];

	send(command: ReactToGameEvent) {
		if (this.commandListeners.size === 0) {
			// If the game never attaches (e.g. a failed chunk load) high-rate
			// aim commands must not grow this queue without bound.
			if (this.pendingCommands.length >= 256) this.pendingCommands.shift();
			this.pendingCommands.push(command);
			return;
		}
		for (const listener of this.commandListeners) listener(command);
	}

	onCommand(listener: Listener<ReactToGameEvent>) {
		this.commandListeners.add(listener);
		for (const command of this.pendingCommands) listener(command);
		this.pendingCommands.length = 0;
		return () => {
			this.commandListeners.delete(listener);
		};
	}

	emit(event: GameToReactEvent) {
		for (const listener of this.eventListeners) listener(event);
	}

	onEvent(listener: Listener<GameToReactEvent>) {
		this.eventListeners.add(listener);
		return () => {
			this.eventListeners.delete(listener);
		};
	}

	clear() {
		this.commandListeners.clear();
		this.eventListeners.clear();
	}
}
