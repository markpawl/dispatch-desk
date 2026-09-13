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

const CHANNEL_NAME: Record<SavedDestination['type'], string> = {
  'google-doc': 'Google Doc',
  'dropbox-file': 'Dropbox File',
  email: 'Email',
}

// A longer, computed-not-stored description of what a destination actually
// points at -- channel name plus its underlying parameters -- shown as a
// hover tooltip alongside the short, user-chosen shortLabel in the list
// (see docs/IDEAS.md's Pending item 11).
export function destinationDescription(destination: SavedDestination): string {
  const channel = CHANNEL_NAME[destination.type]
  switch (destination.type) {
    case 'google-doc':
      return `${channel}, ${destination.docName}`
    case 'dropbox-file':
      return `${channel}, ${destination.path}`
    case 'email':
      return destination.emailSubjectLabel
        ? `${channel}, ${destination.address}, ${destination.emailSubjectLabel}`
        : `${channel}, ${destination.address}`
  }
}
