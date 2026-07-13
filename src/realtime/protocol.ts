import { z } from 'zod'

export const roomCodeSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/)

const finiteNumber = z.number().finite()

export const ControllerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('orientation'),
    normalizedX: finiteNumber.min(-1).max(1),
    timestamp: finiteNumber,
  }),
  z.object({
    type: z.literal('flick'),
    intensity: finiteNumber.min(0).max(1),
    timestamp: finiteNumber,
  }),
])

export const HostMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('flick-accepted'), intensity: finiteNumber.min(0).max(1) }),
  z.object({ type: z.literal('error'), message: z.string().min(1).max(180) }),
])

export type ControllerMessage = z.infer<typeof ControllerMessageSchema>
export type HostMessage = z.infer<typeof HostMessageSchema>

export const MAX_MESSAGE_BYTES = 2048

export function parseJsonMessage<T>(raw: string, schema: z.ZodType<T>): T | null {
  if (new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    const result = schema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}
