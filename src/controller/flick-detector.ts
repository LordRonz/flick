import { clamp } from '../game/systems/math'

export const FLICK_DETECTOR_CONFIG = {
  spikeThreshold: 13,
  cooldownMs: 500,
  maxIntensityMagnitude: 42,
} as const

export type FlickDetectorState = { lastFlickAt: number }

export function detectFlick(
  magnitude: number,
  state: FlickDetectorState,
  now: number,
  config = FLICK_DETECTOR_CONFIG,
) {
  if (!Number.isFinite(magnitude) || magnitude < config.spikeThreshold || now - state.lastFlickAt < config.cooldownMs) {
    return { flicked: false, intensity: 0, state }
  }
  const intensity = clamp((magnitude - config.spikeThreshold) / (config.maxIntensityMagnitude - config.spikeThreshold), 0, 1)
  return { flicked: true, intensity, state: { lastFlickAt: now } }
}
