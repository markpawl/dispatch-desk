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

const {
  listDestinations,
  getDestination,
  saveGoogleDocDestination,
  saveDropboxFileDestination,
  saveEmailDestination,
  deleteDestination,
} = await import('./destinations.js')

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

  it('saves a dropbox-file destination and upserts it by path', async () => {
    const first = await saveDropboxFileDestination('user-1', '/notes.txt', 'notes.txt')
    expect(first).toMatchObject({ type: 'dropbox-file', path: '/notes.txt', name: 'notes.txt' })
    const second = await saveDropboxFileDestination('user-1', '/notes.txt', 'renamed.txt')
    expect(second).toEqual(first)
    expect(await listDestinations('user-1')).toHaveLength(1)
  })

  it('google-doc and dropbox-file destinations coexist in one list', async () => {
    const doc = await saveGoogleDocDestination('user-1', 'doc-1', 'Meeting Notes')
    const file = await saveDropboxFileDestination('user-1', '/journal.md', 'journal.md')
    expect(await listDestinations('user-1')).toEqual([doc, file])
    expect(await getDestination('user-1', file.id)).toEqual(file)
  })

  it('deletes a destination by id, leaving the rest untouched', async () => {
    const doc = await saveGoogleDocDestination('user-1', 'doc-1', 'Meeting Notes')
    const file = await saveDropboxFileDestination('user-1', '/journal.md', 'journal.md')

    await deleteDestination('user-1', doc.id)

    expect(await listDestinations('user-1')).toEqual([file])
    expect(await getDestination('user-1', doc.id)).toBeUndefined()
  })

  it('deleting an id that does not exist is a no-op, not an error', async () => {
    const doc = await saveGoogleDocDestination('user-1', 'doc-1', 'Meeting Notes')

    await expect(deleteDestination('user-1', 'does-not-exist')).resolves.toBeUndefined()

    expect(await listDestinations('user-1')).toEqual([doc])
  })

  it('deleting only affects the given user\'s list', async () => {
    const mine = await saveGoogleDocDestination('user-1', 'doc-1', 'Mine')
    const theirs = await saveGoogleDocDestination('user-2', 'doc-2', 'Theirs')

    await deleteDestination('user-2', theirs.id)

    expect(await listDestinations('user-1')).toEqual([mine])
    expect(await listDestinations('user-2')).toEqual([])
  })

  it('saves a new email destination', async () => {
    const destination = await saveEmailDestination(
      'user-1',
      'to@example.com',
      'Weekly Notes',
      'Notes',
    )
    expect(destination).toMatchObject({
      type: 'email',
      address: 'to@example.com',
      shortLabel: 'Weekly Notes',
      emailSubjectLabel: 'Notes',
    })
    expect(destination.id).toBeTruthy()
    expect(destination.createdAt).toBeTruthy()
    expect(await listDestinations('user-1')).toEqual([destination])
  })

  it('saves an email destination with no emailSubjectLabel', async () => {
    const destination = await saveEmailDestination('user-1', 'to@example.com', 'Weekly Notes')
    expect(destination.emailSubjectLabel).toBeUndefined()
  })

  it('creates a new email destination each time rather than upserting by address', async () => {
    const first = await saveEmailDestination('user-1', 'to@example.com', 'Weekly Notes')
    const second = await saveEmailDestination('user-1', 'to@example.com', 'Ideas')
    expect(first.id).not.toBe(second.id)
    expect(await listDestinations('user-1')).toEqual([first, second])
  })

  it('all three destination types coexist in one list', async () => {
    const doc = await saveGoogleDocDestination('user-1', 'doc-1', 'Meeting Notes')
    const file = await saveDropboxFileDestination('user-1', '/journal.md', 'journal.md')
    const email = await saveEmailDestination('user-1', 'to@example.com', 'Weekly Notes')
    expect(await listDestinations('user-1')).toEqual([doc, file, email])
  })
})
