import { afterEach, describe, expect, it } from 'vitest'
import { loadDesktopState, persistDesktopState } from './redis.js'

describe('redis persistence, no credentials configured', () => {
  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  it('loadDesktopState resolves to null rather than throwing', async () => {
    await expect(loadDesktopState()).resolves.toBeNull()
  })

  it('persistDesktopState resolves (a no-op) rather than throwing', async () => {
    await expect(persistDesktopState(new Uint8Array([1, 2, 3]))).resolves.toBeUndefined()
  })
})
