import { useEffect, useRef } from 'react'
import { advanceProjectile, clamp, createProjectile, hitsTarget, type Projectile } from './physics'

export type LaunchRequest = { id: number; intensity: number }

type GameCanvasProps = {
  launchRequest: LaunchRequest
  orientation: number
  onScoreChange: (score: number) => void
  onKeyboardHint: (active: boolean) => void
}

export function GameCanvas({ launchRequest, orientation, onScoreChange, onKeyboardHint }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const orientationRef = useRef(orientation)
  const requestRef = useRef(launchRequest)
  const scoreRef = useRef(0)
  const launcherRef = useRef(0.5)
  const keysRef = useRef({ left: false, right: false })
  const projectilesRef = useRef<Projectile[]>([])

  orientationRef.current = orientation
  requestRef.current = launchRequest

  useEffect(() => {
    const canvasElement = canvasRef.current
    if (!canvasElement) return
    const canvas = canvasElement
    const context = canvas.getContext('2d')!
    let frame = 0
    let lastTime = performance.now()
    let lastLaunchId = launchRequest.id
    let width = 0
    let height = 0
    const dpr = () => Math.min(window.devicePixelRatio || 1, 2)

    function resize() {
      const bounds = canvas.getBoundingClientRect()
      width = bounds.width
      height = bounds.height
      canvas.width = Math.max(1, Math.floor(width * dpr()))
      canvas.height = Math.max(1, Math.floor(height * dpr()))
      context.setTransform(dpr(), 0, 0, dpr(), 0, 0)
    }

    function launch(intensity: number) {
      projectilesRef.current.push(createProjectile(launcherRef.current * width, height - 34, clamp(intensity, 0, 1)))
    }

    function keyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.code === 'Space') event.preventDefault()
      if (event.key === 'ArrowLeft') keysRef.current.left = true
      if (event.key === 'ArrowRight') keysRef.current.right = true
      if (event.code === 'Space' && !event.repeat) launch(0.72)
      onKeyboardHint(true)
    }

    function keyUp(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft') keysRef.current.left = false
      if (event.key === 'ArrowRight') keysRef.current.right = false
    }

    function draw(now: number) {
      const delta = Math.min((now - lastTime) / 1000, 0.04)
      lastTime = now
      const direction = Number(keysRef.current.right) - Number(keysRef.current.left)
      const targetLauncher = clamp(launcherRef.current + direction * delta * 1.5 + orientationRef.current * delta * 1.8, 0.08, 0.92)
      launcherRef.current += (targetLauncher - launcherRef.current) * Math.min(1, delta * 12)

      if (requestRef.current.id !== lastLaunchId) {
        lastLaunchId = requestRef.current.id
        launch(requestRef.current.intensity)
      }

      const targetX = width * 0.5
      const targetY = Math.max(72, height * 0.18)
      projectilesRef.current = projectilesRef.current.flatMap((projectile) => {
        const next = advanceProjectile(projectile, delta, width, height)
        if (!next) return []
        if (hitsTarget(next, targetX, targetY, 26)) {
          scoreRef.current += 10
          onScoreChange(scoreRef.current)
          return []
        }
        return [next]
      })

      context.clearRect(0, 0, width, height)
      context.fillStyle = '#080c10'
      context.fillRect(0, 0, width, height)
      drawGrid(context, width, height)
      drawTarget(context, targetX, targetY)
      for (const projectile of projectilesRef.current) drawProjectile(context, projectile)
      drawLauncher(context, launcherRef.current * width, height - 32)
      frame = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
    }
  }, [launchRequest.id, onKeyboardHint, onScoreChange])

  return <canvas ref={canvasRef} className="game-canvas" aria-label="Flick physics game. Use arrow keys to move and spacebar to launch." />
}

function drawGrid(context: CanvasRenderingContext2D, width: number, height: number) {
  context.strokeStyle = 'rgba(130, 170, 190, 0.10)'
  context.lineWidth = 1
  const size = 36
  for (let x = 0; x <= width; x += size) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke()
  }
  for (let y = 0; y <= height; y += size) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke()
  }
  context.fillStyle = 'rgba(68, 198, 213, 0.28)'
  for (let index = 0; index < 18; index += 1) {
    const x = (index * 137) % Math.max(1, width)
    const y = (index * 71) % Math.max(1, height)
    context.fillRect(x, y, 2, 2)
  }
}

function drawTarget(context: CanvasRenderingContext2D, x: number, y: number) {
  context.shadowColor = '#ff665a'
  context.shadowBlur = 22
  context.fillStyle = '#ff665a'
  context.beginPath(); context.arc(x, y, 29, 0, Math.PI * 2); context.fill()
  context.shadowBlur = 0
  context.fillStyle = '#080c10'
  context.beginPath(); context.arc(x, y, 19, 0, Math.PI * 2); context.fill()
  context.strokeStyle = '#ffc3ad'
  context.lineWidth = 3
  context.beginPath(); context.arc(x, y, 12, 0, Math.PI * 2); context.stroke()
}

function drawProjectile(context: CanvasRenderingContext2D, projectile: Projectile) {
  context.shadowColor = '#ff7b61'
  context.shadowBlur = 15
  context.fillStyle = '#ffb39b'
  context.beginPath(); context.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2); context.fill()
  context.shadowBlur = 0
}

function drawLauncher(context: CanvasRenderingContext2D, x: number, y: number) {
  context.shadowColor = '#44d8e4'
  context.shadowBlur = 18
  context.fillStyle = '#44d8e4'
  context.fillRect(x - 42, y - 7, 84, 14)
  context.shadowBlur = 0
  context.fillStyle = '#080c10'
  context.fillRect(x - 37, y - 3, 74, 6)
  context.fillStyle = '#a5f7ef'
  context.beginPath(); context.arc(x, y, 4, 0, Math.PI * 2); context.fill()
}
