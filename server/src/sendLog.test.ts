import { describe, expect, it, vi } from 'vitest'

const rpush = vi.fn(async (_key: string, _value: string) => 1)
const ltrim = vi.fn(async (_key: string, _start: number, _stop: number) => 'OK')
vi.mock('./redisClient.js', () => ({
  getRedisClient: () => ({ rpush, ltrim }),
}))

const { appendSendLogEntry, truncateForPreview } = await import('./sendLog.js')

describe('truncateForPreview', () => {
  it('leaves short text untouched', () => {
    expect(truncateForPreview('hello')).toBe('hello')
  })

  it('truncates long text with an ellipsis', () => {
    const long = 'x'.repeat(150)
    const preview = truncateForPreview(long)
    expect(preview).toHaveLength(101) // 100 chars + the ellipsis character
    expect(preview.endsWith('…')).toBe(true)
  })
})

describe('appendSendLogEntry', () => {
  it('RPUSHes a timestamped JSON entry and trims to the most recent 200', async () => {
    await appendSendLogEntry({
      destinationId: 'dest-1',
      docName: 'Meeting Notes',
      textPreview: 'hello world',
    })

    expect(rpush).toHaveBeenCalledTimes(1)
    const [key, value] = rpush.mock.calls[0] as [string, string]
    expect(key).toBe('send-log')
    const entry = JSON.parse(value)
    expect(entry).toMatchObject({
      destinationId: 'dest-1',
      docName: 'Meeting Notes',
      textPreview: 'hello world',
    })
    expect(entry.timestamp).toBeTruthy()

    expect(ltrim).toHaveBeenCalledWith('send-log', -200, -1)
  })
})
