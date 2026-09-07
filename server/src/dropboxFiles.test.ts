import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const filesSearchV2 = vi.fn()
const filesDownload = vi.fn()
const filesUpload = vi.fn(async () => ({ result: {} }))
const fakeClient = { filesSearchV2, filesDownload, filesUpload }

const getAuthorizedDropboxClient = vi.fn(async (_userId: string) => fakeClient as unknown)
vi.mock('./dropboxAuth.js', () => ({ getAuthorizedDropboxClient }))

const { searchDropboxFiles, appendTextToDropboxFile, DropboxNotConnectedError } = await import(
  './dropboxFiles.js'
)

function match(entry: { '.tag': string; name: string; path_lower?: string }) {
  return { metadata: { metadata: entry } }
}

describe('dropboxFiles', () => {
  beforeEach(() => {
    getAuthorizedDropboxClient.mockResolvedValue(fakeClient)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('throws DropboxNotConnectedError from both operations when not connected', async () => {
    getAuthorizedDropboxClient.mockResolvedValue(null)
    await expect(searchDropboxFiles('user-1', 'notes')).rejects.toBeInstanceOf(
      DropboxNotConnectedError,
    )
    await expect(appendTextToDropboxFile('user-1', '/notes.txt', 'hi')).rejects.toBeInstanceOf(
      DropboxNotConnectedError,
    )
  })

  it('search returns nothing for an empty query without calling Dropbox', async () => {
    expect(await searchDropboxFiles('user-1', '   ')).toEqual([])
    expect(filesSearchV2).not.toHaveBeenCalled()
  })

  it('search keeps only .txt/.md files and maps them to {path, name}', async () => {
    filesSearchV2.mockResolvedValueOnce({
      result: {
        matches: [
          match({ '.tag': 'file', name: 'Notes.md', path_lower: '/notes.md' }),
          match({ '.tag': 'file', name: 'todo.txt', path_lower: '/todo.txt' }),
          match({ '.tag': 'file', name: 'photo.png', path_lower: '/photo.png' }),
          match({ '.tag': 'folder', name: 'Documents', path_lower: '/documents' }),
        ],
      },
    })

    const results = await searchDropboxFiles('user-1', 'no')
    expect(filesSearchV2).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'no', options: expect.objectContaining({ filename_only: true }) }),
    )
    expect(results).toEqual([
      { path: '/notes.md', name: 'Notes.md' },
      { path: '/todo.txt', name: 'todo.txt' },
    ])
  })

  it('append downloads, prepends a newline, and re-uploads with overwrite', async () => {
    filesDownload.mockResolvedValueOnce({ result: { fileBinary: Buffer.from('existing line') } })

    await appendTextToDropboxFile('user-1', '/notes.txt', 'new line')

    expect(filesDownload).toHaveBeenCalledWith({ path: '/notes.txt' })
    const uploadArg = filesUpload.mock.calls[0][0] as {
      path: string
      contents: Buffer
      mode: { '.tag': string }
    }
    expect(uploadArg.path).toBe('/notes.txt')
    expect(uploadArg.mode).toEqual({ '.tag': 'overwrite' })
    expect(uploadArg.contents.toString('utf-8')).toBe('existing line\nnew line')
  })

  it('append treats a missing file body as empty', async () => {
    filesDownload.mockResolvedValueOnce({ result: {} })
    await appendTextToDropboxFile('user-1', '/fresh.txt', 'first')
    const uploadArg = filesUpload.mock.calls[0][0] as { contents: Buffer }
    expect(uploadArg.contents.toString('utf-8')).toBe('\nfirst')
  })
})
