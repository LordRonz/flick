import { describe, expect, it } from 'vitest'
import { normalizeOrientation, smoothValue } from './motion'

describe('motion normalization', () => {
  it('normalizes and clamps relative tilt', () => {
    expect(normalizeOrientation(38, 0)).toBe(1)
    expect(normalizeOrientation(-80, 0)).toBe(-1)
  })

  it('smooths jitter instead of jumping', () => {
    expect(smoothValue(0, 1, 0.2)).toBeCloseTo(0.2)
  })
})
