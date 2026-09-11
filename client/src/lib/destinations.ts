// Mirrors server/src/destinations.ts's `Destination` union -- kept as a
// separate, hand-written client-side type rather than a shared package,
// same tradeoff as the rest of this app's client/server split.
export type SavedDestination =
  | { id: string; type: 'google-doc'; docId: string; docName: string; createdAt: string }
  | { id: string; type: 'dropbox-file'; path: string; name: string; createdAt: string }

// The list-display label for a saved destination. Each type's "real" name
// (the underlying Google Doc/Dropbox file's name) doubles as its label for
// now -- a distinct user-editable `shortLabel` per docs/CURRENT-WORK.md's
// Group D isn't built yet.
export function destinationLabel(destination: SavedDestination): string {
  return destination.type === 'google-doc' ? destination.docName : destination.name
}
