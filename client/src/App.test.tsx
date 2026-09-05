import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

// Real Y.Doc/Y.XmlFragment (so the Tiptap Collaboration binding is exercised
// end to end), but a stub provider -- the provider is the only piece that
// touches the network, and that's the Sync Server's job to prove out, not
// this test's.
vi.mock('./lib/desktopDoc', async () => {
  const Y = await import('yjs')
  return {
    createDesktopDoc: () => {
      const doc = new Y.Doc()
      const fragment = doc.getXmlFragment('desktop')
      const provider = {
        on: () => {},
        off: () => {},
        destroy: () => {},
      }
      return { doc, fragment, provider }
    },
  }
})

describe('App', () => {
  it('renders the desktop editor and reflects typed text', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Dispatch Desk' })).toBeInTheDocument()

    const editor = await screen.findByRole('textbox')
    await userEvent.type(editor, 'hello')

    await waitFor(() => expect(editor).toHaveTextContent('hello'))
  })
})
