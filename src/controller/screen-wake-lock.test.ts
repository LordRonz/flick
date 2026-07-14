import { describe, expect, it, vi } from "vitest";
import {
	createScreenWakeLock,
	type ScreenWakeLockStatus,
} from "./screen-wake-lock";

type FakeSentinel = {
	released: boolean;
	release: ReturnType<typeof vi.fn>;
	addEventListener: ReturnType<typeof vi.fn>;
	removeEventListener: ReturnType<typeof vi.fn>;
	emitRelease: () => void;
};

function createFakeSentinel(): FakeSentinel {
	let releaseListener: (() => void) | undefined;
	const sentinel: FakeSentinel = {
		released: false,
		release: vi.fn(async () => {
			sentinel.released = true;
			releaseListener?.();
		}),
		addEventListener: vi.fn((_type: string, listener: () => void) => {
			releaseListener = listener;
		}),
		removeEventListener: vi.fn(),
		emitRelease: () => {
			sentinel.released = true;
			releaseListener?.();
		},
	};
	return sentinel;
}

function createFakeDocument() {
	let visibilityState: DocumentVisibilityState = "visible";
	let visibilityListener: (() => void) | undefined;
	return {
		get visibilityState() {
			return visibilityState;
		},
		addEventListener: vi.fn((_type: string, listener: () => void) => {
			visibilityListener = listener;
		}),
		removeEventListener: vi.fn(),
		setVisibility: (next: DocumentVisibilityState) => {
			visibilityState = next;
			visibilityListener?.();
		},
	};
}

function createDependencies(
	options: {
		request?: () => Promise<FakeSentinel>;
		isSecureContext?: boolean;
	} = {},
) {
	const page = createFakeDocument();
	const request = options.request ?? vi.fn(async () => createFakeSentinel());
	return {
		page,
		request,
		dependencies: {
			navigator: {
				wakeLock: { request } as unknown as Navigator["wakeLock"],
			},
			document: page as unknown as Document,
			isSecureContext: options.isSecureContext ?? true,
		},
	};
}

describe("screen wake lock", () => {
	it("reports unsupported when the browser has no wake lock API", async () => {
		const statuses: ScreenWakeLockStatus[] = [];
		const controller = createScreenWakeLock((status) => statuses.push(status), {
			navigator: {},
			document: createFakeDocument() as unknown as Document,
			isSecureContext: true,
		});

		await expect(controller.request()).resolves.toBe("unsupported");
		expect(statuses).toEqual(["unsupported"]);
	});

	it("reports unsupported outside a secure context", async () => {
		const { dependencies } = createDependencies({ isSecureContext: false });
		const statuses: ScreenWakeLockStatus[] = [];
		const controller = createScreenWakeLock(
			(status) => statuses.push(status),
			dependencies,
		);

		await expect(controller.request()).resolves.toBe("unsupported");
		expect(statuses).toEqual(["unsupported"]);
	});

	it("becomes active and reports platform release", async () => {
		const sentinel = createFakeSentinel();
		const { dependencies } = createDependencies({
			request: vi.fn(async () => sentinel),
		});
		const statuses: ScreenWakeLockStatus[] = [];
		const controller = createScreenWakeLock(
			(status) => statuses.push(status),
			dependencies,
		);

		await expect(controller.request()).resolves.toBe("active");
		sentinel.emitRelease();

		expect(statuses).toEqual(["active", "released"]);
	});

	it("reports denied when the platform rejects the request", async () => {
		const { dependencies } = createDependencies({
			request: vi.fn(async () => {
				throw new DOMException("Wake lock denied", "NotAllowedError");
			}),
		});
		const statuses: ScreenWakeLockStatus[] = [];
		const controller = createScreenWakeLock(
			(status) => statuses.push(status),
			dependencies,
		);

		await expect(controller.request()).resolves.toBe("denied");
		expect(statuses).toEqual(["denied"]);
	});

	it("requests a fresh lock when the page becomes visible again", async () => {
		const firstSentinel = createFakeSentinel();
		const secondSentinel = createFakeSentinel();
		const request = vi
			.fn<() => Promise<FakeSentinel>>()
			.mockResolvedValueOnce(firstSentinel)
			.mockResolvedValueOnce(secondSentinel);
		const { page, dependencies } = createDependencies({ request });
		const statuses: ScreenWakeLockStatus[] = [];
		const controller = createScreenWakeLock(
			(status) => statuses.push(status),
			dependencies,
		);

		await controller.request();
		firstSentinel.emitRelease();
		page.setVisibility("hidden");
		page.setVisibility("visible");
		await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));

		expect(statuses).toEqual(["active", "released", "active"]);
	});

	it("releases before the page is hidden and reacquires after it is visible", async () => {
		const firstSentinel = createFakeSentinel();
		const secondSentinel = createFakeSentinel();
		const request = vi
			.fn<() => Promise<FakeSentinel>>()
			.mockResolvedValueOnce(firstSentinel)
			.mockResolvedValueOnce(secondSentinel);
		const { page, dependencies } = createDependencies({ request });
		const controller = createScreenWakeLock(() => {}, dependencies);

		await controller.request();
		page.setVisibility("hidden");
		await vi.waitFor(() =>
			expect(firstSentinel.release).toHaveBeenCalledOnce(),
		);
		page.setVisibility("visible");
		await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));

		expect(secondSentinel.released).toBe(false);
	});

	it("releases the active sentinel and removes the visibility listener", async () => {
		const sentinel = createFakeSentinel();
		const { page, dependencies } = createDependencies({
			request: vi.fn(async () => sentinel),
		});
		const controller = createScreenWakeLock(() => {}, dependencies);

		await controller.request();
		await controller.destroy();

		expect(sentinel.release).toHaveBeenCalledOnce();
		expect(sentinel.removeEventListener).toHaveBeenCalledOnce();
		expect(page.removeEventListener).toHaveBeenCalledOnce();
	});
});
