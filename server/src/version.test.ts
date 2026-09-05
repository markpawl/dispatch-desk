import { describe, expect, it } from 'vitest'
import { readBuildTimestamp } from './version.js'

describe('readBuildTimestamp', () => {
  it('resolves to null when no BUILD_TIMESTAMP file exists (local dev, no Docker build step)', () => {
    // There's no BUILD_TIMESTAMP file in this repo checkout -- only the
    // Dockerfile's build stage writes one -- so this exercises the same
    // "file missing" path a local `npm run dev`/`npm test` always hits.
    expect(readBuildTimestamp()).toBeNull()
  })
})
