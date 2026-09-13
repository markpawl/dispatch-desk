import { describe, expect, it } from 'vitest'
import { destinationDescription, destinationLabel, type SavedDestination } from './destinations'

const GOOGLE_DOC: SavedDestination = {
  id: 'g1',
  type: 'google-doc',
  docId: 'doc-1',
  docName: 'Meeting Notes',
  shortLabel: 'Notes',
  createdAt: '',
}

const DROPBOX_FILE: SavedDestination = {
  id: 'd1',
  type: 'dropbox-file',
  path: '/notes.txt',
  name: 'notes.txt',
  shortLabel: 'Notes file',
  createdAt: '',
}

const EMAIL: SavedDestination = {
  id: 'e1',
  type: 'email',
  address: 'mom@example.com',
  shortLabel: "mom's email",
  createdAt: '',
}

describe('destinationLabel', () => {
  it('returns the shortLabel regardless of type', () => {
    expect(destinationLabel(GOOGLE_DOC)).toBe('Notes')
    expect(destinationLabel(DROPBOX_FILE)).toBe('Notes file')
    expect(destinationLabel(EMAIL)).toBe("mom's email")
  })
})

describe('destinationDescription', () => {
  it('describes a Google Doc destination by its doc name', () => {
    expect(destinationDescription(GOOGLE_DOC)).toBe('Google Doc, Meeting Notes')
  })

  it('describes a Dropbox destination by its path', () => {
    expect(destinationDescription(DROPBOX_FILE)).toBe('Dropbox File, /notes.txt')
  })

  it('describes an email destination by its address', () => {
    expect(destinationDescription(EMAIL)).toBe('Email, mom@example.com')
  })

  it('includes the emailSubjectLabel when set', () => {
    expect(destinationDescription({ ...EMAIL, emailSubjectLabel: 'Family updates' })).toBe(
      'Email, mom@example.com, Family updates',
    )
  })
})
