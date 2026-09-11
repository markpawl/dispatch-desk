// Mirrors server/src/destinations.ts's `Destination` union -- kept as a
// separate, hand-written client-side type rather than a shared package,
// same tradeoff as the rest of this app's client/server split.
export type SavedDestination =
  | { id: string; type: 'google-doc'; docId: string; docName: string; shortLabel: string; createdAt: string }
  | { id: string; type: 'dropbox-file'; path: string; name: string; shortLabel: string; createdAt: string }
  | {
      id: string
      type: 'email'
      address: string
      shortLabel: string
      emailSubjectLabel?: string
      createdAt: string
    }

// The list-display label for a saved destination -- every type has a
// shortLabel now (see docs/CURRENT-WORK.md's Group D).
export function destinationLabel(destination: SavedDestination): string {
  return destination.shortLabel
}
