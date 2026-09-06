import { google } from 'googleapis'
import { getAuthorizedClient } from './googleAuth.js'

export interface GoogleDocSummary {
  id: string
  name: string
}

export class GoogleNotConnectedError extends Error {
  constructor() {
    super('Google is not connected -- visit /auth/google first')
  }
}

async function requireAuthorizedClient() {
  const client = await getAuthorizedClient()
  if (!client) throw new GoogleNotConnectedError()
  return client
}

// Searches the user's Google Docs by name (not full-text content -- that's
// plenty for picking which doc to send to, and cheaper/simpler than a
// content search). An empty query lists Docs unfiltered (browsing), rather
// than sending Drive an empty `name contains ''` clause. Escapes the one
// character (') that would otherwise break out of the q string's quoting.
export async function searchGoogleDocs(query: string): Promise<GoogleDocSummary[]> {
  const auth = await requireAuthorizedClient()
  const drive = google.drive({ version: 'v3', auth })
  const trimmed = query.trim()
  const nameClause = trimmed ? ` and name contains '${trimmed.replaceAll("'", "\\'")}'` : ''
  const response = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.document' and trashed=false${nameClause}`,
    fields: 'files(id,name)',
    pageSize: 20,
  })
  return (response.data.files ?? []).map((file) => ({
    id: file.id ?? '',
    name: file.name ?? '(untitled)',
  }))
}

// Appends text to the end of a Google Doc's body. Always prepends a
// newline before the text, so a doc's very first send gets one leading
// blank line -- a minor, harmless quirk accepted rather than an extra
// documents.get round-trip just to detect an empty doc and skip it.
export async function appendTextToDoc(docId: string, text: string): Promise<void> {
  const auth = await requireAuthorizedClient()
  const docs = google.docs({ version: 'v1', auth })
  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [
        {
          insertText: {
            text: `\n${text}`,
            endOfSegmentLocation: {},
          },
        },
      ],
    },
  })
}
