import { describe, expect, it } from 'vitest'
import { ControllerMessageSchema, parseJsonMessage } from './protocol'

describe('realtime protocol', () => {
  it('accepts valid orientation messages', () => {
    expect(parseJsonMessage('{"type":"orientation","normalizedX":0.4,"timestamp":1}', ControllerMessageSchema)).toEqual({ type: 'orientation', normalizedX: 0.4, timestamp: 1 })
  })

  it('rejects out-of-range input', () => {
    expect(parseJsonMessage('{"type":"flick","intensity":2,"timestamp":1}', ControllerMessageSchema)).toBeNull()
  })

  it('rejects oversized payloads', () => {
    expect(parseJsonMessage('x'.repeat(3000), ControllerMessageSchema)).toBeNull()
  })
})
