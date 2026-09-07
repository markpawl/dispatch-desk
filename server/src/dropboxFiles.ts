import type { Dropbox } from 'dropbox'
import { getAuthorizedDropboxClient } from './dropboxAuth.js'

export interface DropboxFileSummary {
  path: string // path_lower -- the stable identifier sent back to append to
  name: string
}

export class DropboxNotConnectedError extends Error {
  constructor() {
    super('Dropbox is not connected -- visit /auth/connect/dropbox first')
  }
}

// Only plain-text files can be appended to by plain concatenation. Richer
// formats (.docx, .xlsx, ...) need per-format processing -- deferred to the
// "send-helper plugin" idea in docs/IDEAS.md.
const APPENDABLE_EXTENSIONS = ['.txt', '.md']

function isAppendable(name: string): boolean {
  const lower = name.toLowerCase()
  return APPENDABLE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

async function requireDropbox(userId: string): Promise<Dropbox> {
  const client = await getAuthorizedDropboxClient(userId)
  if (!client) throw new DropboxNotConnectedError()
  return client
}

// Dropbox's response types model file/folder/deleted metadata as a tagged
// union nested a level deep; the fields this module actually reads are the
// same across them, so it works against this narrowed shape rather than the
// full generated types.
interface RawEntry {
  '.tag'?: string
  name?: string
  path_lower?: string
  path_display?: string
}

// Searches the user's Dropbox for appendable (.txt/.md) files by name. An
// empty query returns nothing (type to search) rather than listing -- unlike
// Drive, a Dropbox root listing wouldn't surface files nested in folders
// anyway.
export async function searchDropboxFiles(
  userId: string,
  query: string,
): Promise<DropboxFileSummary[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const dbx = await requireDropbox(userId)
  const response = await dbx.filesSearchV2({
    query: trimmed,
    options: { filename_only: true, max_results: 100 },
  })
  const { matches } = response.result as unknown as {
    matches: { metadata: { metadata?: RawEntry } }[]
  }

  return matches
    .map((match) => match.metadata.metadata)
    .filter((entry): entry is RawEntry => entry != null && entry['.tag'] === 'file')
    .filter((entry) => isAppendable(entry.name ?? ''))
    .map((entry) => ({
      path: entry.path_lower ?? entry.path_display ?? '',
      name: entry.name ?? '(unnamed)',
    }))
    .filter((file) => file.path !== '')
}

// Appends text to the end of a Dropbox file: download, concatenate with a
// leading newline (matching appendTextToDoc), re-upload with overwrite. Two
// sends racing the download/upload round-trip is last-write-wins -- accepted
// for the single-user-per-account model (see docs/CURRENT-WORK.md Group D)
// rather than adding rev-based conflict handling.
export async function appendTextToDropboxFile(
  userId: string,
  path: string,
  text: string,
): Promise<void> {
  const dbx = await requireDropbox(userId)
  const download = await dbx.filesDownload({ path })
  const existing = (download.result as unknown as { fileBinary?: Buffer }).fileBinary ?? Buffer.alloc(0)
  const updated = Buffer.concat([Buffer.from(existing), Buffer.from(`\n${text}`, 'utf-8')])
  await dbx.filesUpload({
    path,
    contents: updated,
    mode: { '.tag': 'overwrite' },
    mute: true,
  })
}
