import { randomUUID } from 'node:crypto'
import { getRedisClient } from './redisClient.js'

// One saved-destinations list per signed-in user.
function destinationsKey(userId: string): string {
  return `destinations:${userId}`
}

export interface GoogleDocDestination {
  id: string
  type: 'google-doc'
  docId: string
  docName: string
  // The list-display label -- see EmailDestination's shortLabel below for
  // why it's separate from docName (the actual Google Doc's real name).
  shortLabel: string
  createdAt: string
}

export interface DropboxFileDestination {
  id: string
  type: 'dropbox-file'
  path: string
  name: string
  shortLabel: string
  createdAt: string
}

export interface EmailDestination {
  id: string
  type: 'email'
  address: string
  // The list-display label, fixed at creation -- there's no edit UI (see
  // docs/CURRENT-WORK.md's Group C/D), so "delete and create a new one" is
  // how a different label is obtained.
  shortLabel: string
  // Used to build the outgoing email's subject line instead of shortLabel
  // when set (falls back to shortLabel at send time -- see
  // server/src/requestHandler.ts's /api/send).
  emailSubjectLabel?: string
  createdAt: string
}

export type Destination = GoogleDocDestination | DropboxFileDestination | EmailDestination

async function loadAll(userId: string): Promise<Destination[]> {
  const redis = getRedisClient()
  if (!redis) return []
  const raw = await redis.get(destinationsKey(userId))
  if (!raw) return []
  return JSON.parse(raw) as Destination[]
}

async function saveAll(userId: string, destinations: Destination[]): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return
  await redis.set(destinationsKey(userId), JSON.stringify(destinations))
}

export async function listDestinations(userId: string): Promise<Destination[]> {
  return loadAll(userId)
}

export async function getDestination(
  userId: string,
  id: string,
): Promise<Destination | undefined> {
  return (await loadAll(userId)).find((destination) => destination.id === id)
}

// Upserts by docId -- sending to the same Google Doc twice reuses the
// existing saved destination (so the client's "saved destinations" list
// doesn't accumulate duplicates) rather than creating a new entry each time.
// `shortLabel` (like docName/name) is only used for a genuinely new entry --
// the existing one's label from its first save wins, same as docName always
// has.
export async function saveGoogleDocDestination(
  userId: string,
  docId: string,
  docName: string,
  shortLabel: string,
): Promise<GoogleDocDestination> {
  const destinations = await loadAll(userId)
  const existing = destinations.find(
    (d): d is GoogleDocDestination => d.type === 'google-doc' && d.docId === docId,
  )
  if (existing) return existing

  const destination: GoogleDocDestination = {
    id: randomUUID(),
    type: 'google-doc',
    docId,
    docName,
    shortLabel,
    createdAt: new Date().toISOString(),
  }
  await saveAll(userId, [...destinations, destination])
  return destination
}

// No-op (not an error) if `id` doesn't exist -- callers that already have a
// stale id (e.g. a double-click) shouldn't have to handle a 404 specially.
export async function deleteDestination(userId: string, id: string): Promise<void> {
  const destinations = await loadAll(userId)
  await saveAll(
    userId,
    destinations.filter((destination) => destination.id !== id),
  )
}

// Upserts by path -- same rationale as saveGoogleDocDestination's upsert.
export async function saveDropboxFileDestination(
  userId: string,
  path: string,
  name: string,
  shortLabel: string,
): Promise<DropboxFileDestination> {
  const destinations = await loadAll(userId)
  const existing = destinations.find(
    (d): d is DropboxFileDestination => d.type === 'dropbox-file' && d.path === path,
  )
  if (existing) return existing

  const destination: DropboxFileDestination = {
    id: randomUUID(),
    type: 'dropbox-file',
    path,
    name,
    shortLabel,
    createdAt: new Date().toISOString(),
  }
  await saveAll(userId, [...destinations, destination])
  return destination
}

// Unlike the two save*Destination functions above, this always creates a
// new entry rather than upserting by some natural key -- an email
// destination's shortLabel/emailSubjectLabel are fixed at creation (see
// EmailDestination above), so two destinations legitimately can share the
// same address with different labels.
export async function saveEmailDestination(
  userId: string,
  address: string,
  shortLabel: string,
  emailSubjectLabel?: string,
): Promise<EmailDestination> {
  const destinations = await loadAll(userId)
  const destination: EmailDestination = {
    id: randomUUID(),
    type: 'email',
    address,
    shortLabel,
    emailSubjectLabel,
    createdAt: new Date().toISOString(),
  }
  await saveAll(userId, [...destinations, destination])
  return destination
}
