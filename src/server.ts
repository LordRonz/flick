import handler from '@tanstack/react-start/server-entry'
import { roomCodeSchema } from './realtime/protocol'
import type { FlickEnv } from './cloudflare-env'
import { FlickRoom } from './durable-objects/FlickRoom'

export { FlickRoom }

export default {
  async fetch(request: Request, env: FlickEnv) {
    const url = new URL(request.url)
    const socketMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/socket$/)
    if (socketMatch) {
      if (request.method !== 'GET') return new Response('Method not allowed.', { status: 405 })
      const roomCode = socketMatch[1]?.toUpperCase() ?? ''
      if (!roomCodeSchema.safeParse(roomCode).success) return new Response('Invalid room code.', { status: 400 })
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket upgrade required.', { status: 426 })
      return env.FLICK_ROOM.getByName(roomCode).fetch(request)
    }
    if (url.pathname === '/api/rooms' && request.method === 'POST') return createRoom(request, env)
    return handler.fetch(request)
  },
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

async function createRoom(request: Request, env: FlickEnv) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const bytes = new Uint8Array(6)
    crypto.getRandomValues(bytes)
    const roomCode = roomCodeSchema.parse(Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join(''))
    const initResponse = await env.FLICK_ROOM.getByName(roomCode).fetch(new Request(`${new URL(request.url).origin}/__init`, { method: 'POST' }))
    if (initResponse.status === 409) continue
    if (!initResponse.ok) return Response.json({ error: 'Could not initialize room.' }, { status: 503 })
    return Response.json({ roomCode })
  }
  return Response.json({ error: 'Could not find an available room code.' }, { status: 503 })
}
