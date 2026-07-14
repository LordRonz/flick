export type ScreenWakeLockStatus =
	| "idle"
	| "active"
	| "unsupported"
	| "denied"
	| "released";

export type ScreenWakeLockController = {
	request: () => Promise<ScreenWakeLockStatus>;
	release: () => Promise<void>;
	destroy: () => Promise<void>;
};

type ScreenWakeLockDependencies = {
	navigator?: Partial<Pick<Navigator, "wakeLock">>;
	document?: Pick<
		Document,
		"visibilityState" | "addEventListener" | "removeEventListener"
	>;
	isSecureContext?: boolean;
};

const defaultDependencies: ScreenWakeLockDependencies = {
	navigator: typeof navigator === "undefined" ? undefined : navigator,
	document: typeof document === "undefined" ? undefined : document,
	isSecureContext:
		typeof window !== "undefined" ? window.isSecureContext : false,
};

export function createScreenWakeLock(
	onStatus: (status: ScreenWakeLockStatus) => void,
	dependencies: ScreenWakeLockDependencies = defaultDependencies,
): ScreenWakeLockController {
	let sentinel: WakeLockSentinel | null = null;
	let requestInFlight: Promise<ScreenWakeLockStatus> | null = null;
	let requested = false;
	let destroyed = false;
	let status: ScreenWakeLockStatus = "idle";
	let sentinelReleaseListener: (() => void) | null = null;

	const setStatus = (next: ScreenWakeLockStatus) => {
		if (status === next) return;
		status = next;
		if (!destroyed) onStatus(next);
	};

	const handleRelease = (releasedSentinel: WakeLockSentinel) => {
		if (sentinel !== releasedSentinel) return;
		sentinel = null;
		sentinelReleaseListener = null;
		setStatus("released");
	};

	const detachSentinelListener = (currentSentinel: WakeLockSentinel) => {
		if (!sentinelReleaseListener) return;
		currentSentinel.removeEventListener("release", sentinelReleaseListener);
		sentinelReleaseListener = null;
	};

	const request = async (): Promise<ScreenWakeLockStatus> => {
		requested = true;
		if (destroyed) return status;
		if (requestInFlight) return requestInFlight;

		const wakeLock = dependencies.navigator?.wakeLock;
		const page = dependencies.document;
		if (!wakeLock || !dependencies.isSecureContext || !page) {
			setStatus("unsupported");
			return status;
		}
		if (page.visibilityState !== "visible") return status;
		if (sentinel && !sentinel.released) {
			setStatus("active");
			return status;
		}

		requestInFlight = (async () => {
			try {
				const nextSentinel = await wakeLock.request("screen");
				if (
					destroyed ||
					page.visibilityState !== "visible" ||
					nextSentinel.released
				) {
					await nextSentinel.release();
					return status;
				}
				sentinel = nextSentinel;
				sentinelReleaseListener = () => handleRelease(nextSentinel);
				nextSentinel.addEventListener("release", sentinelReleaseListener);
				setStatus("active");
				return status;
			} catch {
				setStatus("denied");
				return status;
			} finally {
				requestInFlight = null;
			}
		})();

		return requestInFlight;
	};

	const handleVisibilityChange = () => {
		if (!requested) return;
		if (dependencies.document?.visibilityState === "visible") {
			void request();
		} else {
			void release().catch(() => undefined);
		}
	};

	const release = async () => {
		const currentSentinel = sentinel;
		if (!currentSentinel) {
			if (requested) setStatus("released");
			return;
		}
		sentinel = null;
		detachSentinelListener(currentSentinel);
		try {
			await currentSentinel.release();
		} finally {
			if (requested) setStatus("released");
		}
	};

	dependencies.document?.addEventListener(
		"visibilitychange",
		handleVisibilityChange,
	);

	return {
		request,
		release,
		destroy: async () => {
			destroyed = true;
			requested = false;
			dependencies.document?.removeEventListener(
				"visibilitychange",
				handleVisibilityChange,
			);
			const currentSentinel = sentinel;
			sentinel = null;
			if (currentSentinel) detachSentinelListener(currentSentinel);
			if (currentSentinel && !currentSentinel.released) {
				await currentSentinel.release();
			}
		},
	};
}
