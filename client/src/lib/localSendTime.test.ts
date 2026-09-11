import { describe, expect, it } from 'vitest'
import { localDateKey, localTimeLabel } from './localSendTime'

describe('localSendTime', () => {
  it('localDateKey formats as yyyy-mm-dd, zero-padded', () => {
    expect(localDateKey(new Date(2026, 8, 1, 9, 5))).toBe('2026-09-01')
  })

  it('localTimeLabel formats as mm/dd/yyyy HH:mm, 24-hour, zero-padded', () => {
    expect(localTimeLabel(new Date(2026, 8, 11, 14, 5))).toBe('09/11/2026 14:05')
  })

  it('localTimeLabel uses 24-hour hours with no am/pm suffix', () => {
    expect(localTimeLabel(new Date(2026, 0, 1, 0, 0))).toBe('01/01/2026 00:00')
    expect(localTimeLabel(new Date(2026, 0, 1, 23, 59))).toBe('01/01/2026 23:59')
  })
})
