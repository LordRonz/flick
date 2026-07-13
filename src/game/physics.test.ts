import { describe, expect, it } from 'vitest'
import { advanceProjectile, clamp, createProjectile, hitsTarget } from './physics'

describe('game physics', () => {
  it('clamps launcher input', () => {
    expect(clamp(-2, -1, 1)).toBe(-1)
    expect(clamp(2, -1, 1)).toBe(1)
  })

  it('creates a stronger projectile for a stronger flick', () => {
    expect(createProjectile(100, 300, 1).vy).toBeLessThan(createProjectile(100, 300, 0).vy)
  })

  it('bounces projectile at side boundaries', () => {
    const projectile = { ...createProjectile(5, 300, 0.5), x: 2, vx: -20 }
    const next = advanceProjectile(projectile, 0.1, 300, 400)
    expect(next?.vx).toBeGreaterThan(0)
  })

  it('detects target collision', () => {
    expect(hitsTarget({ ...createProjectile(100, 300, 0), x: 100, y: 100 }, 100, 100, 26)).toBe(true)
  })
})
