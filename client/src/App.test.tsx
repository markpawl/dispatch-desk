import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

// Real Y.Doc/Y.XmlFragment (so the Tiptap Collaboration binding is exercised
// end to end), but a stub provider -- the provider is the only piece that
// touches the network, and that's the Sync Server's job to prove out, not
// this test's. The stub supports emitting 'status' (see the regression test
// below), unlike a real WebsocketProvider it's driven directly by the test.
let emitStatus: (status: string) => void = () => {}

vi.mock('./lib/desktopDoc', async () => {
  const Y = await import('yjs')
  return {
    createDesktopDoc: () => {
      const doc = new Y.Doc()
      const fragment = doc.getXmlFragment('desktop')
      let statusHandler: ((event: { status: string }) => void) | null = null
      const provider = {
        on: (_event: 'status', handler: (event: { status: string }) => void) => {
          statusHandler = handler
        },
        off: () => {
          statusHandler = null
        },
        destroy: () => {},
      }
      emitStatus = (status: string) => statusHandler?.({ status })
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

  // Guards against a real fragility: useEditor used to be called with no
  // `deps`, so on every re-render of App -- including one triggered by
  // nothing more than a WebSocket status change -- it re-diffed a
  // freshly-recreated `extensions` array by reference, decided it had
  // "changed", and called editor.setOptions() to reconcile, needlessly
  // reinitializing the Yjs Collaboration binding. Pinning useEditor's deps
  // to `[fragment]` (see App.tsx) avoids that churn. This test didn't
  // reproduce data loss from it even before that fix -- jsdom's contenteditable
  // simulation isn't a faithful enough stand-in for a real browser's typing
  // pipeline for that -- so treat it as a stability check, not proof of the
  // original bug.
  it('keeps typed text across connection-status changes', async () => {
    render(<App />)
    const editor = await screen.findByRole('textbox')

    await userEvent.type(editor, 'a')
    act(() => emitStatus('disconnected'))
    await userEvent.type(editor, 'b')
    act(() => emitStatus('connecting'))
    await userEvent.type(editor, 'c')
    act(() => emitStatus('connected'))

    await waitFor(() => expect(editor).toHaveTextContent('abc'))
  })
})
