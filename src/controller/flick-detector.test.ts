import { describe, expect, it } from 'vitest'
import { detectFlick } from './flick-detector'

describe('flick detector', () => {
  it('fires above threshold', () => {
    const result = detectFlick(30, { lastFlickAt: -Infinity }, 1000)
    expect(result.flicked).toBe(true)
    expect(result.intensity).toBeGreaterThan(0)
  })

  it('ignores spikes during cooldown', () => {
    const result = detectFlick(30, { lastFlickAt: 800 }, 1000)
    expect(result.flicked).toBe(false)
  })
})
