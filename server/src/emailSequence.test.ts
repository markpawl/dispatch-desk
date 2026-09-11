import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, number>()
const expirySeconds = new Map<string, number>()
let redisConfigured = true

vi.mock('./redisClient.js', () => ({
  getRedisClient: () =>
    redisConfigured
      ? {
          incr: async (key: string) => {
            const next = (store.get(key) ?? 0) + 1
            store.set(key, next)
            return next
          },
          expire: async (key: string, seconds: number) => {
            expirySeconds.set(key, seconds)
          },
        }
      : undefined,
}))

const { nextEmailSequenceNumber } = await import('./emailSequence.js')

describe('emailSequence', () => {
  beforeEach(() => {
    store.clear()
    expirySeconds.clear()
    redisConfigured = true
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('starts at 0 for the first send on a given destination/day', async () => {
    expect(await nextEmailSequenceNumber('dest-1', '2026-09-11')).toBe(0)
  })

  it('increments for each subsequent send on the same destination/day', async () => {
    expect(await nextEmailSequenceNumber('dest-1', '2026-09-11')).toBe(0)
    expect(await nextEmailSequenceNumber('dest-1', '2026-09-11')).toBe(1)
    expect(await nextEmailSequenceNumber('dest-1', '2026-09-11')).toBe(2)
  })

  it('resets to 0 on a different day', async () => {
    await nextEmailSequenceNumber('dest-1', '2026-09-11')
    await nextEmailSequenceNumber('dest-1', '2026-09-11')
    expect(await nextEmailSequenceNumber('dest-1', '2026-09-12')).toBe(0)
  })

  it('is independent per destination', async () => {
    await nextEmailSequenceNumber('dest-1', '2026-09-11')
    await nextEmailSequenceNumber('dest-1', '2026-09-11')
    expect(await nextEmailSequenceNumber('dest-2', '2026-09-11')).toBe(0)
  })

  it('sets an expiry on the key after the first increment only', async () => {
    await nextEmailSequenceNumber('dest-1', '2026-09-11')
    expect(expirySeconds.get('email-seq:dest-1:2026-09-11')).toBe(36 * 60 * 60)

    expirySeconds.clear()
    await nextEmailSequenceNumber('dest-1', '2026-09-11')
    expect(expirySeconds.has('email-seq:dest-1:2026-09-11')).toBe(false)
  })

  it('falls back to 0 when Redis is not configured', async () => {
    redisConfigured = false
    expect(await nextEmailSequenceNumber('dest-1', '2026-09-11')).toBe(0)
    expect(await nextEmailSequenceNumber('dest-1', '2026-09-11')).toBe(0)
  })
})
