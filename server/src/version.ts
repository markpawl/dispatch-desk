import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Written by the Dockerfile's build stage (`date +%s > BUILD_TIMESTAMP`) at
// image-build time, as Unix seconds; not present in local dev, where
// there's no Docker build step -- callers get null in that case.
export function readBuildTimestamp(): number | null {
  try {
    const raw = readFileSync(resolve(__dirname, '../../BUILD_TIMESTAMP'), 'utf-8').trim()
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

export const BUILD_TIMESTAMP = readBuildTimestamp()
