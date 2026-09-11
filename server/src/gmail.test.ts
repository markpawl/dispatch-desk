import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAuthorizedClient: vi.fn(async () => null as unknown),
  messagesSend: vi.fn(async (_params: { userId: string; requestBody: { raw: string } }) => ({
    data: {},
  })),
}))

vi.mock('./googleAuth.js', () => ({ getAuthorizedClient: mocks.getAuthorizedClient }))
vi.mock('googleapis', () => ({
  google: {
    gmail: vi.fn(() => ({ users: { messages: { send: mocks.messagesSend } } })),
  },
}))

const { sendEmail } = await import('./gmail.js')
const { GoogleNotConnectedError } = await import('./googleDocs.js')

describe('gmail', () => {
  beforeEach(() => {
    mocks.getAuthorizedClient.mockResolvedValue({ mockAuthClient: true })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('throws GoogleNotConnectedError when not connected', async () => {
    mocks.getAuthorizedClient.mockResolvedValue(null)
    await expect(sendEmail('user-1', 'to@example.com', 'Subject', 'body')).rejects.toBeInstanceOf(
      GoogleNotConnectedError,
    )
    expect(mocks.messagesSend).not.toHaveBeenCalled()
  })

  it('passes the per-user id through to getAuthorizedClient', async () => {
    await sendEmail('user-42', 'to@example.com', 'Subject', 'body')
    expect(mocks.getAuthorizedClient).toHaveBeenCalledWith('user-42')
  })

  it('sends a base64url-encoded RFC 2822 message with no From header', async () => {
    await sendEmail('user-1', 'to@example.com', 'Weekly Notes 09/11/2026 14:30 0', 'hello world')

    expect(mocks.messagesSend).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'me', requestBody: expect.objectContaining({ raw: expect.any(String) }) }),
    )
    const raw = mocks.messagesSend.mock.calls[0]?.[0]?.requestBody.raw ?? ''
    const decoded = Buffer.from(raw, 'base64url').toString('utf-8')
    expect(decoded).toContain('To: to@example.com')
    expect(decoded).toContain('Subject: Weekly Notes 09/11/2026 14:30 0')
    expect(decoded).toContain('Content-Type: text/plain; charset="UTF-8"')
    expect(decoded).not.toContain('From:')
    expect(decoded).toMatch(/\r\n\r\nhello world$/)
  })
})
