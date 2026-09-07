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
  createdAt: string
}

// The only destination type so far -- widen this once a second kind exists
// (see docs/IDEAS.md's Pending item 1 on reconciling this into MCP tools).
export type Destination = GoogleDocDestination

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
export async function saveGoogleDocDestination(
  userId: string,
  docId: string,
  docName: string,
): Promise<GoogleDocDestination> {
  const destinations = await loadAll(userId)
  const existing = destinations.find((d) => d.type === 'google-doc' && d.docId === docId)
  if (existing) return existing

  const destination: GoogleDocDestination = {
    id: randomUUID(),
    type: 'google-doc',
    docId,
    docName,
    createdAt: new Date().toISOString(),
  }
  await saveAll(userId, [...destinations, destination])
  return destination
}
