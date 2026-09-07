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

const { listDestinations, getDestination, saveGoogleDocDestination } = await import(
  './destinations.js'
)

describe('destinations', () => {
  beforeEach(() => {
    store.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('lists no destinations when none are saved', async () => {
    expect(await listDestinations('user-1')).toEqual([])
  })

  it('saves a new google-doc destination under the user key', async () => {
    const destination = await saveGoogleDocDestination('user-1', 'doc-1', 'Meeting Notes')
    expect(destination).toMatchObject({ type: 'google-doc', docId: 'doc-1', docName: 'Meeting Notes' })
    expect(destination.id).toBeTruthy()
    expect(destination.createdAt).toBeTruthy()
    expect(await listDestinations('user-1')).toEqual([destination])
    expect(store.get('destinations:user-1')).toBeTruthy()
  })

  it('upserts by docId rather than creating a duplicate', async () => {
    const first = await saveGoogleDocDestination('user-1', 'doc-1', 'Meeting Notes')
    const second = await saveGoogleDocDestination('user-1', 'doc-1', 'Meeting Notes (renamed, ignored)')
    expect(second).toEqual(first) // same entry, name from the first save wins
    expect(await listDestinations('user-1')).toHaveLength(1)
  })

  it('saves distinct destinations for distinct docIds', async () => {
    await saveGoogleDocDestination('user-1', 'doc-1', 'Notes')
    await saveGoogleDocDestination('user-1', 'doc-2', 'Journal')
    expect(await listDestinations('user-1')).toHaveLength(2)
  })

  it('getDestination finds a saved destination by id, undefined otherwise', async () => {
    const saved = await saveGoogleDocDestination('user-1', 'doc-1', 'Notes')
    expect(await getDestination('user-1', saved.id)).toEqual(saved)
    expect(await getDestination('user-1', 'does-not-exist')).toBeUndefined()
  })

  it('keeps each user\'s destinations separate', async () => {
    const mine = await saveGoogleDocDestination('user-1', 'doc-1', 'Mine')
    await saveGoogleDocDestination('user-2', 'doc-2', 'Theirs')

    expect(await listDestinations('user-1')).toEqual([mine])
    expect(await getDestination('user-2', mine.id)).toBeUndefined()
  })
})
