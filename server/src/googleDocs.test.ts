import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeFile {
  id?: string | null
  name?: string | null
}

const mocks = vi.hoisted(() => ({
  getAuthorizedClient: vi.fn(async () => null as unknown),
  filesList: vi.fn(async (_params: { q: string; fields: string; pageSize: number }) => ({
    data: { files: [{ id: 'doc-1', name: 'Meeting Notes' } as FakeFile] },
  })),
  documentsBatchUpdate: vi.fn(async (_params: unknown) => ({ data: {} })),
}))

vi.mock('./googleAuth.js', () => ({ getAuthorizedClient: mocks.getAuthorizedClient }))
vi.mock('googleapis', () => ({
  google: {
    drive: vi.fn(() => ({ files: { list: mocks.filesList } })),
    docs: vi.fn(() => ({ documents: { batchUpdate: mocks.documentsBatchUpdate } })),
  },
}))

const { searchGoogleDocs, appendTextToDoc, GoogleNotConnectedError } = await import(
  './googleDocs.js'
)

describe('googleDocs', () => {
  beforeEach(() => {
    mocks.getAuthorizedClient.mockResolvedValue({ mockAuthClient: true })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('throws GoogleNotConnectedError from both operations when not connected', async () => {
    mocks.getAuthorizedClient.mockResolvedValue(null)
    await expect(searchGoogleDocs('notes')).rejects.toBeInstanceOf(GoogleNotConnectedError)
    await expect(appendTextToDoc('doc-1', 'hi')).rejects.toBeInstanceOf(GoogleNotConnectedError)
    expect(mocks.filesList).not.toHaveBeenCalled()
    expect(mocks.documentsBatchUpdate).not.toHaveBeenCalled()
  })

  it('searchGoogleDocs queries for Google Docs by name and maps the response', async () => {
    const results = await searchGoogleDocs('Meeting')
    expect(mocks.filesList).toHaveBeenCalledWith(
      expect.objectContaining({
        q: expect.stringContaining("name contains 'Meeting'"),
        fields: 'files(id,name)',
      }),
    )
    expect(results).toEqual([{ id: 'doc-1', name: 'Meeting Notes' }])
  })

  it('searchGoogleDocs with an empty query omits the name clause entirely', async () => {
    await searchGoogleDocs('  ')
    const q = mocks.filesList.mock.calls[0]?.[0]?.q
    expect(q).not.toContain('name contains')
    expect(q).toContain("mimeType='application/vnd.google-apps.document'")
  })

  it("searchGoogleDocs escapes a single quote in the query", async () => {
    await searchGoogleDocs("O'Brien")
    const q = mocks.filesList.mock.calls[0]?.[0]?.q
    expect(q).toContain("name contains 'O\\'Brien'")
  })

  it('searchGoogleDocs falls back to a placeholder name for an untitled result', async () => {
    mocks.filesList.mockResolvedValueOnce({ data: { files: [{ id: 'doc-2', name: null }] } })
    const results = await searchGoogleDocs('x')
    expect(results).toEqual([{ id: 'doc-2', name: '(untitled)' }])
  })

  it('appendTextToDoc inserts a newline-prefixed insertText request at the end of the doc', async () => {
    await appendTextToDoc('doc-1', 'hello world')
    expect(mocks.documentsBatchUpdate).toHaveBeenCalledWith({
      documentId: 'doc-1',
      requestBody: {
        requests: [{ insertText: { text: '\nhello world', endOfSegmentLocation: {} } }],
      },
    })
  })
})
