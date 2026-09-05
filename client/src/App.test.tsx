import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

// Real Y.Doc/Y.Text (so the diff-based binding is exercised end to end), but
// a stub provider -- the provider is the only piece that touches the
// network, and that's the Sync Server's job to prove out, not this test's.
vi.mock('./lib/desktopDoc', async () => {
  const Y = await import('yjs')
  return {
    createDesktopDoc: () => {
      const doc = new Y.Doc()
      const text = doc.getText('desktop')
      const provider = {
        on: () => {},
        off: () => {},
        destroy: () => {},
      }
      return { doc, text, provider }
    },
  }
})

describe('App', () => {
  it('renders the desktop editor and reflects typed text', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Dispatch Desk' })).toBeInTheDocument()

    const editor = screen.getByPlaceholderText(/type anything/i)
    await userEvent.type(editor, 'hello')

    expect(editor).toHaveValue('hello')
  })
})
