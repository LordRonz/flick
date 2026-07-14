import { clamp } from '../game/systems/math'

export function normalizeOrientation(gamma: number, baselineGamma: number) {
  return clamp((gamma - baselineGamma) / 38, -1, 1)
}

export function smoothValue(previous: number, next: number, factor = 0.22) {
  return previous + (next - previous) * factor
}
