import { useEffect, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import QRCode from 'qrcode'
import { GameCanvas, type LaunchRequest } from '../game/GameCanvas'
import { ControllerMessageSchema, HostMessageSchema } from '../realtime/protocol'
import { createSocketUrl, sendSocketMessage } from '../realtime/websocket-client'

export const Route = createFileRoute('/host')({
  validateSearch: z.object({ room: z.string().catch('') }),
  component: HostPage,
})

function HostPage() {
  const { room } = Route.useSearch()
  const socketRef = useRef<WebSocket | null>(null)
  const [socketState, setSocketState] = useState('Connecting')
  const [controllerState, setControllerState] = useState('Waiting')
  const [orientation, setOrientation] = useState(0)
  const [score, setScore] = useState(0)
  const [launchRequest, setLaunchRequest] = useState<LaunchRequest>({ id: 0, intensity: 0.7 })
  const [qrData, setQrData] = useState('')
  const readyCountRef = useRef(0)

  useEffect(() => {
    if (!room) return
    if (typeof WebSocket === 'undefined') {
      setSocketState('WebSocket unavailable')
      return
    }
    const controllerUrl = `${window.location.origin}/controller?room=${encodeURIComponent(room)}`
    QRCode.toDataURL(controllerUrl, { width: 180, margin: 1, color: { dark: '#c9fff1', light: '#11181d' } }).then(setQrData).catch(() => setQrData(''))
    const socket = new WebSocket(createSocketUrl(`/api/rooms/${room}/socket`, { role: 'host' }))
    socketRef.current = socket
    socket.onopen = () => setSocketState('Connected')
    socket.onmessage = (event) => {
      let payload: unknown
      try { payload = JSON.parse(event.data as string) } catch { return }
      const message = typeof event.data === 'string' ? ControllerMessageSchema.or(HostMessageSchema).safeParse(payload) : null
      if (!message?.success) return
      const data = message.data
      if (data.type === 'orientation') { setOrientation(data.normalizedX); return }
      if (data.type === 'flick' && 'intensity' in data) {
        setLaunchRequest((current) => ({ id: current.id + 1, intensity: data.intensity }))
        sendSocketMessage(socket, { type: 'flick-accepted', intensity: data.intensity })
        return
      }
      if (data.type === 'ready') {
        readyCountRef.current += 1
        if (readyCountRef.current > 1) setControllerState('Connected')
      }
      if (data.type === 'error' && data.message.includes('Controller')) setControllerState('Waiting')
    }
    socket.onclose = () => { setSocketState('Disconnected'); setControllerState('Waiting') }
    socket.onerror = () => setSocketState('Error')
    return () => { socket.close(); socketRef.current = null }
  }, [room])

  function simulateFlick() {
    setLaunchRequest((current) => ({ id: current.id + 1, intensity: 0.8 }))
  }

  if (!room) return <EmptyRoom />

  return (
    <main className="host-shell">
      <header className="app-header">
        <Link to="/" className="brand-mark"><span className="brand-dot" />FLICK</Link>
        <div className="header-status"><span className="status-dot" />HOST <strong>{socketState}</strong></div>
        <div className="header-help">ARROWS MOVE <span>·</span> SPACE FLICKS</div>
      </header>
      <section className="host-layout">
        <div className="game-panel">
          <div className="game-panel-header">
            <div><span className="panel-label">ROOM</span><strong>{room}</strong></div>
            <div className="score-block"><span className="panel-label">SCORE</span><strong>{score.toString().padStart(3, '0')}</strong></div>
          </div>
          <div className="canvas-frame"><GameCanvas launchRequest={launchRequest} orientation={orientation} onScoreChange={setScore} onKeyboardHint={() => undefined} /></div>
          <div className="game-footer"><span>OBJECTIVE: HIT THE TARGET</span><span>PROJECTILES: GRAVITY + BOUNCE</span></div>
        </div>
        <aside className="host-rail">
          <div className="rail-heading"><div><span className="panel-label">JOIN FROM PHONE</span><h1>Flick your way in.</h1></div><span className="connection-count">{controllerState === 'Connected' ? '02' : '01'} / 02</span></div>
          <div className="qr-wrap">{qrData ? <img src={qrData} alt={`QR code to join room ${room}`} /> : <div className="qr-fallback">QR</div>}<p>Scan with your iPhone camera</p></div>
          <div className="rail-list">
            <StatusRow label="ROOM CODE" value={room} accent />
            <StatusRow label="HOST" value={socketState} active={socketState === 'Connected'} />
            <StatusRow label="CONTROLLER" value={controllerState} active={controllerState === 'Connected'} />
            <StatusRow label="TILT X" value={orientation.toFixed(2)} />
          </div>
          <button className="simulate-button" type="button" onClick={simulateFlick}><span>✦</span> Simulate Flick</button>
          <p className="rail-hint">Use this button to confirm network play before testing motion sensors.</p>
        </aside>
      </section>
    </main>
  )
}

function StatusRow({ label, value, active = false, accent = false }: { label: string; value: string; active?: boolean; accent?: boolean }) {
  return <div className="status-row"><span>{label}</span><strong className={`${active ? 'is-active' : ''} ${accent ? 'is-accent' : ''}`}><i />{value}</strong></div>
}

function EmptyRoom() {
  return <main className="empty-state"><Link to="/" className="brand-mark"><span className="brand-dot" />FLICK</Link><h1>Create a game first.</h1><Link to="/" className="text-link">Back home</Link></main>
}
