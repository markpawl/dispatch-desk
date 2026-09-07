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

  it('getUser returns null when the record does not exist', async () => {
    expect(await getUser('nobody')).toBeNull()
  })

  it('upsertUser creates a record keyed by sub, stamping createdAt', async () => {
    const user = await upsertUser({ sub: 'sub-1', email: 'a@example.com', name: 'Ada' })
    expect(user).toMatchObject({ id: 'sub-1', email: 'a@example.com', name: 'Ada' })
    expect(user.createdAt).toBeTruthy()
    expect(await getUser('sub-1')).toEqual(user)
    expect(store.get('user:sub-1')).toBe(JSON.stringify(user))
  })

  it('upsertUser refreshes email/name on a later login but keeps createdAt', async () => {
    const first = await upsertUser({ sub: 'sub-1', email: 'a@example.com', name: 'Ada' })
    const second = await upsertUser({ sub: 'sub-1', email: 'ada@example.com', name: 'Ada L.' })
    expect(second).toEqual({
      id: 'sub-1',
      email: 'ada@example.com',
      name: 'Ada L.',
      createdAt: first.createdAt,
    })
  })
})
