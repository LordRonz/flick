import { DurableObject } from 'cloudflare:workers'
import type { FlickEnv } from '../cloudflare-env'
import {
  ControllerMessageSchema,
  HostMessageSchema,
  MAX_MESSAGE_BYTES,
  parseJsonMessage,
  type HostMessage,
} from '../realtime/protocol'

type ConnectionAttachment = {
  role: 'host' | 'controller'
  connectedAt: number
}

const CLOSE_HOST_LEFT = 4001

export class FlickRoom extends DurableObject {
  private readonly state: DurableObjectState

  constructor(ctx: DurableObjectState, env: FlickEnv) {
    super(ctx, env)
    this.state = ctx
  }

  async fetch(request: Request) {
    const url = new URL(request.url)
    if (url.pathname === '/__init' && request.method === 'POST') return this.initialize()
    if (!await this.state.storage.get<boolean>('initialized')) return new Response('Room does not exist.', { status: 404 })
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket upgrade required.', { status: 426 })
    const role = url.searchParams.get('role')
    if (role !== 'host' && role !== 'controller') return new Response('Role must be host or controller.', { status: 400 })
    if (role === 'controller' && !this.socketFor('host')) return new Response('Host is not connected.', { status: 409 })
    if (this.socketFor(role)) return new Response(`${role} is already connected.`, { status: 409 })

    const pair = new WebSocketPair()
    const clientSocket = pair[0]
    const serverSocket = pair[1]
    this.state.acceptWebSocket(serverSocket)
    serverSocket.serializeAttachment({ role, connectedAt: Date.now() } satisfies ConnectionAttachment)

    this.send(serverSocket, { type: 'ready' })
    if (role === 'controller') {
      const host = this.socketFor('host')
      if (host) this.send(host, { type: 'ready' })
    }
    return new Response(null, { status: 101, webSocket: clientSocket })
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message)
    if (new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) {
      this.send(socket, { type: 'error', message: 'Message too large.' })
      return
    }
    const attachment = this.attachment(socket)
    if (!attachment) return
    if (attachment.role === 'controller') {
      const parsed = parseJsonMessage(raw, ControllerMessageSchema)
      if (!parsed) {
        this.send(socket, { type: 'error', message: 'Invalid controller message.' })
        return
      }
      const host = this.socketFor('host')
      if (host) this.send(host, parsed)
      return
    }
    const parsed = parseJsonMessage(raw, HostMessageSchema)
    if (!parsed) {
      this.send(socket, { type: 'error', message: 'Invalid host message.' })
      return
    }
    const controller = this.socketFor('controller')
    if (controller) this.send(controller, parsed)
  }

  webSocketClose(socket: WebSocket) {
    const attachment = this.attachment(socket)
    if (attachment?.role === 'host') this.socketFor('controller')?.close(CLOSE_HOST_LEFT, 'Host disconnected.')
    if (attachment?.role === 'controller') this.send(this.socketFor('host'), { type: 'error', message: 'Controller disconnected.' })
  }

  webSocketError(socket: WebSocket) {
    this.webSocketClose(socket)
  }

  private async initialize() {
    if (await this.state.storage.get<boolean>('initialized')) return new Response('Room already initialized.', { status: 409 })
    await this.state.storage.put('initialized', true)
    return new Response(null, { status: 201 })
  }

  private socketFor(role: ConnectionAttachment['role']) {
    return this.state.getWebSockets().find((socket: WebSocket) => this.attachment(socket)?.role === role)
  }

  private attachment(socket: WebSocket) {
    const value = socket.deserializeAttachment()
    if (!value || typeof value !== 'object' || !('role' in value) || !('connectedAt' in value)) return null
    if ((value.role !== 'host' && value.role !== 'controller') || typeof value.connectedAt !== 'number') return null
    return value as ConnectionAttachment
  }

  private send(socket: WebSocket | undefined, message: HostMessage | Record<string, unknown>) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify(message))
  }
}
