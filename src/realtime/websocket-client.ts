export function createSocketUrl(path: string, params: Record<string, string>) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = new URL(path, `${protocol}//${window.location.host}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}

export function sendSocketMessage(socket: WebSocket | null, message: unknown) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}
