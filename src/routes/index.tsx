import { useState } from 'react'
import { useNavigate, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const navigate = useNavigate()
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState('')

  async function createGame() {
    setIsCreating(true)
    setError('')
    try {
      const response = await fetch('/api/rooms', { method: 'POST' })
      const payload = (await response.json()) as { roomCode?: string; error?: string }
      if (!response.ok || !payload.roomCode) throw new Error(payload.error ?? 'Could not create room.')
      await navigate({ to: '/host', search: { room: payload.roomCode } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create room.')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <main className="landing-shell">
      <div className="landing-grid" aria-hidden="true" />
      <section className="landing-copy">
        <div className="brand-mark"><span className="brand-dot" />FLICK</div>
        <p className="eyebrow">PHONE AS CONTROLLER</p>
        <h1>Flick a shot.<br /><em>Find the target.</em></h1>
        <p className="lede">Tilt and flick your iPhone to control a tiny physics game running on your laptop.</p>
        <button className="primary-button" type="button" onClick={createGame} disabled={isCreating}>
          {isCreating ? 'Creating room…' : 'Create Game'}
          <span aria-hidden="true">↗</span>
        </button>
        {error ? <p className="error-text" role="alert">{error}</p> : null}
        <p className="microcopy">No account. One laptop. One phone.</p>
      </section>
      <section className="landing-preview" aria-label="Flick game preview">
        <div className="preview-topline"><span>LIVE PROTOTYPE</span><span className="status-live"><i />READY</span></div>
        <div className="preview-canvas">
          <div className="preview-target"><span /></div>
          <div className="preview-shot shot-one" />
          <div className="preview-shot shot-two" />
          <div className="preview-launcher"><i /></div>
          <div className="preview-grid" />
        </div>
        <div className="preview-stats">
          <div><span>MOVE</span><strong>TILT</strong></div>
          <div><span>THROW</span><strong>FLICK</strong></div>
          <div><span>GOAL</span><strong>HIT TARGET</strong></div>
        </div>
      </section>
    </main>
  )
}
