export function createSpectatorUrl(origin: string, room: string) {
	const url = new URL("/watch", origin);
	url.searchParams.set("room", room.trim().toUpperCase());
	return url.toString();
}
