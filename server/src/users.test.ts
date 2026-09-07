import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.mock('./redisClient.js', () => ({
  getRedisClient: () => ({
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value)
    },
  }),
}))

const { getUser, upsertUser } = await import('./users.js')

describe('users', () => {
  beforeEach(() => {
    store.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('getUser returns null for an unknown id', async () => {
    expect(await getUser('nope')).toBeNull()
  })

  it('upsertUser creates a new user with a createdAt timestamp', async () => {
    const user = await upsertUser({ id: 'sub-1', email: 'a@example.com', name: 'A' })
    expect(user).toMatchObject({ id: 'sub-1', email: 'a@example.com', name: 'A' })
    expect(user.createdAt).toBeTruthy()
    expect(await getUser('sub-1')).toEqual(user)
  })

  it('upsertUser on an existing id refreshes fields but keeps the original createdAt', async () => {
    const first = await upsertUser({ id: 'sub-1', email: 'a@example.com', name: 'A' })
    const second = await upsertUser({ id: 'sub-1', email: 'a2@example.com', name: 'A2' })
    expect(second.createdAt).toBe(first.createdAt)
    expect(second).toMatchObject({ id: 'sub-1', email: 'a2@example.com', name: 'A2' })
    expect(await getUser('sub-1')).toEqual(second)
  })
})
