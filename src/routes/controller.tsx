import { useEffect, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { FLICK_DETECTOR_CONFIG, detectFlick } from '../controller/flick-detector'
import { normalizeOrientation, smoothValue } from '../controller/motion'
import { HostMessageSchema, type ControllerMessage } from '../realtime/protocol'
import { createSocketUrl, sendSocketMessage } from '../realtime/websocket-client'

export const Route = createFileRoute('/controller')({
  validateSearch: z.object({ room: z.string().catch('') }),
  component: ControllerPage,
})

type PermissionState = 'Not enabled' | 'Enabled' | 'Denied' | 'Unsupported'

function ControllerPage() {
  const { room } = Route.useSearch()
  const socketRef = useRef<WebSocket | null>(null)
  const baselineRef = useRef<number | null>(null)
  const latestGammaRef = useRef(0)
  const sensorsEnabledRef = useRef(false)
  const tiltRef = useRef(0)
  const lastSentRef = useRef({ value: 0, at: 0 })
  const detectorRef = useRef({ lastFlickAt: -Infinity })
  const [connection, setConnection] = useState('Connecting')
  const [permission, setPermission] = useState<PermissionState>('Not enabled')
  const [tilt, setTilt] = useState(0)
  const [magnitude, setMagnitude] = useState(0)
  const [lastFlick, setLastFlick] = useState(0)
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!room) return
    if (typeof WebSocket === 'undefined') {
      setConnection('WebSocket unavailable')
      return
    }
    const socket = new WebSocket(createSocketUrl(`/api/rooms/${room}/socket`, { role: 'controller' }))
    socketRef.current = socket
    socket.onopen = () => { setConnection('Connected'); setError('') }
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return
      const parsed = HostMessageSchema.safeParse(JSON.parse(event.data))
      if (!parsed.success) return
      if (parsed.data.type === 'flick-accepted') {
        setLastFlick(parsed.data.intensity)
        setConfirmation('FLICK ACCEPTED')
        if ('vibrate' in navigator) navigator.vibrate(50)
        window.setTimeout(() => setConfirmation(''), 900)
      }
      if (parsed.data.type === 'error') setError(parsed.data.message)
    }
    socket.onclose = () => { setConnection('Disconnected'); setError('Host unavailable. Return to the room link when host reconnects.') }
    socket.onerror = () => setConnection('Error')
    return () => {
      socket.close()
      if (sensorsEnabledRef.current) {
        window.removeEventListener('deviceorientation', handleOrientation)
        window.removeEventListener('devicemotion', handleMotion)
        sensorsEnabledRef.current = false
      }
      socketRef.current = null
    }
  }, [room])

  function send(message: ControllerMessage) {
    sendSocketMessage(socketRef.current, message)
  }

  function handleOrientation(event: DeviceOrientationEvent) {
    if (event.gamma == null) return
    latestGammaRef.current = event.gamma
    if (baselineRef.current == null) baselineRef.current = event.gamma
    const next = smoothValue(tiltRef.current, normalizeOrientation(event.gamma, baselineRef.current))
    tiltRef.current = next
    setTilt(next)
    const now = Date.now()
    const changed = Math.abs(next - lastSentRef.current.value) > 0.045
    if (changed || now - lastSentRef.current.at > 250) {
      send({ type: 'orientation', normalizedX: next, timestamp: now })
      lastSentRef.current = { value: next, at: now }
    }
  }

  function handleMotion(event: DeviceMotionEvent) {
    const acceleration = event.acceleration ?? event.accelerationIncludingGravity
    const x = acceleration?.x ?? 0
    const y = acceleration?.y ?? 0
    const z = acceleration?.z ?? 0
    const nextMagnitude = Math.sqrt(x * x + y * y + z * z)
    setMagnitude(nextMagnitude)
    const result = detectFlick(nextMagnitude, detectorRef.current, Date.now())
    detectorRef.current = result.state
    if (result.flicked) sendFlick(result.intensity)
  }

  async function enableMotion() {
    setError('')
    if (!('DeviceMotionEvent' in window) || !('DeviceOrientationEvent' in window)) {
      setPermission('Unsupported'); setError('This browser does not expose motion sensors.'); return
    }
    try {
      const motion = window.DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> }
      const orientation = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> }
      if (motion.requestPermission && await motion.requestPermission() !== 'granted') throw new Error('denied')
      if (orientation.requestPermission && await orientation.requestPermission() !== 'granted') throw new Error('denied')
      if (!sensorsEnabledRef.current) {
        window.addEventListener('deviceorientation', handleOrientation)
        window.addEventListener('devicemotion', handleMotion)
        sensorsEnabledRef.current = true
      }
      setPermission('Enabled')
    } catch {
      setPermission('Denied'); setError('Motion permission denied. Enable it in Safari settings, then reload this page.')
    }
  }

  function calibrate() {
    setError('')
    if (permission !== 'Enabled') { setError('Enable motion controls first.'); return }
    baselineRef.current = latestGammaRef.current
    tiltRef.current = 0
    setTilt(0)
    setConfirmation('CALIBRATED')
    window.setTimeout(() => setConfirmation(''), 700)
  }

  function sendFlick(intensity: number) {
    setLastFlick(intensity)
    send({ type: 'flick', intensity, timestamp: Date.now() })
  }

  if (!room) return <main className="controller-shell"><div className="controller-card"><Link to="/" className="brand-mark"><span className="brand-dot" />FLICK</Link><h1>Room code missing.</h1><p>Scan the QR code from a host screen.</p></div></main>

  return (
    <main className="controller-shell">
      <div className="controller-card">
        <header className="controller-header"><Link to="/" className="brand-mark"><span className="brand-dot" />FLICK</Link><span className={`connection-pill ${connection === 'Connected' ? 'is-connected' : ''}`}><i />{connection}</span></header>
        <section className="controller-hero"><span className="panel-label">CONTROLLER</span><h1>Make it move.</h1><p>Hold your phone upright in portrait.<br />Tilt left and right to move.<br />Flick forward to throw.</p></section>
        <div className="room-chip"><span>ROOM CODE</span><strong>{room}</strong></div>
        {error ? <div className="controller-error" role="alert">{error}</div> : null}
        <section className="sensor-stack">
          <SensorRow label="MOTION PERMISSION" value={permission} active={permission === 'Enabled'} />
          <SensorRow label="CURRENT TILT" value={tilt.toFixed(2)} accent />
          <SensorRow label="ACCELERATION MAGNITUDE" value={`${magnitude.toFixed(1)} m/s²`} />
          <SensorRow label="FLICK THRESHOLD" value={`${FLICK_DETECTOR_CONFIG.spikeThreshold} m/s²`} />
          <SensorRow label="LAST FLICK" value={lastFlick ? `${Math.round(lastFlick * 100)}%` : '—'} accent={Boolean(lastFlick)} />
        </section>
        <div className="controller-actions">
          <button className="action-button action-primary" type="button" onClick={enableMotion}><span>◉</span> Enable Motion Controls</button>
          <button className="action-button action-secondary" type="button" onClick={calibrate}><span>⊙</span> Calibrate</button>
          <button className="action-button action-accent" type="button" onClick={() => sendFlick(0.8)}><span>✦</span> Test Flick</button>
        </div>
        <div className={`confirmation ${confirmation ? 'is-visible' : ''}`} aria-live="polite">{confirmation}</div>
        <p className="controller-footnote">Test Flick verifies the connection. Physical sensors need HTTPS on iPhone.</p>
      </div>
    </main>
  )
}

function SensorRow({ label, value, active = false, accent = false }: { label: string; value: string; active?: boolean; accent?: boolean }) {
  return <div className="sensor-row"><span>{label}</span><strong className={`${active ? 'is-active' : ''} ${accent ? 'is-accent' : ''}`}><i />{value}</strong></div>
}
