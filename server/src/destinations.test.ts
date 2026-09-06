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
    expect(await listDestinations()).toEqual([])
  })

  it('saves a new google-doc destination', async () => {
    const destination = await saveGoogleDocDestination('doc-1', 'Meeting Notes')
    expect(destination).toMatchObject({ type: 'google-doc', docId: 'doc-1', docName: 'Meeting Notes' })
    expect(destination.id).toBeTruthy()
    expect(destination.createdAt).toBeTruthy()
    expect(await listDestinations()).toEqual([destination])
  })

  it('upserts by docId rather than creating a duplicate', async () => {
    const first = await saveGoogleDocDestination('doc-1', 'Meeting Notes')
    const second = await saveGoogleDocDestination('doc-1', 'Meeting Notes (renamed, ignored)')
    expect(second).toEqual(first) // same entry, name from the first save wins
    expect(await listDestinations()).toHaveLength(1)
  })

  it('saves distinct destinations for distinct docIds', async () => {
    await saveGoogleDocDestination('doc-1', 'Notes')
    await saveGoogleDocDestination('doc-2', 'Journal')
    expect(await listDestinations()).toHaveLength(2)
  })

  it('getDestination finds a saved destination by id, undefined otherwise', async () => {
    const saved = await saveGoogleDocDestination('doc-1', 'Notes')
    expect(await getDestination(saved.id)).toEqual(saved)
    expect(await getDestination('does-not-exist')).toBeUndefined()
  })
})
