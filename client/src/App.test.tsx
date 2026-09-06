import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ connected: false }) }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

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

  // BulletList's default input rule (lib/noAutoBulletList.ts) turns "- "/"* "
  // typed at the start of a line into a list -- surprising on a plain
  // writing surface, so it's disabled here. The toolbar/keyboard-shortcut
  // path to a bullet list (EditorToolbar.tsx) is untouched.
  describe('typed dash/asterisk at line start', () => {
    it.each(['-', '*'])('does not turn "%s " into a bullet list', async (marker) => {
      render(<App />)
      const editor = await screen.findByRole('textbox')

      await userEvent.type(editor, `${marker} still text`)

      await waitFor(() => expect(editor).toHaveTextContent(`${marker} still text`))
      expect(editor.querySelector('ul')).not.toBeInTheDocument()
    })

    it('still creates a bullet list via the toolbar button', async () => {
      render(<App />)
      const editor = await screen.findByRole('textbox')
      await userEvent.type(editor, 'item one')

      await userEvent.click(screen.getByTitle('Bullet list'))

      await waitFor(() => expect(editor.querySelector('ul')).toBeInTheDocument())
    })
  })

  it('shows a Connect Google link when not connected', async () => {
    render(<App />)
    const link = await screen.findByRole('link', { name: 'Connect Google' })
    expect(link).toHaveAttribute('href', '/auth/google')
  })

  it('shows a connected indicator once /api/google/status says so', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ connected: true }) }),
    )
    render(<App />)
    expect(await screen.findByText('Google connected')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Connect Google' })).not.toBeInTheDocument()
  })

  // The Link extension is configured with `openOnClick: false` (App.tsx) --
  // a plain click/tap on a link places the cursor, it doesn't navigate. The
  // long-press/right-click "Follow Link" menu (lib/linkFollowMenu.ts,
  // components/LinkFollowMenu.tsx) is the only way to actually open one.
  describe('link follow menu', () => {
    async function renderWithLink() {
      render(<App />)
      const editorEl = await screen.findByRole('textbox')
      await userEvent.type(editorEl, 'click here')
      await userEvent.keyboard('{Control>}a{/Control}')
      vi.spyOn(window, 'prompt').mockReturnValue('https://example.com/page')
      await userEvent.click(screen.getByTitle('Link'))
      const link = await waitFor(() => {
        const anchor = editorEl.querySelector<HTMLAnchorElement>('a')
        if (!anchor) throw new Error('link not rendered yet')
        return anchor
      })
      return link
    }

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('opens on right-click over a link and follows it on request', async () => {
      const link = await renderWithLink()
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

      fireEvent.contextMenu(link, { clientX: 40, clientY: 60 })

      const item = await screen.findByRole('menuitem', { name: 'Follow Link' })
      await userEvent.click(item)

      expect(openSpy).toHaveBeenCalledWith(
        'https://example.com/page',
        '_blank',
        'noopener,noreferrer',
      )
      expect(screen.queryByRole('menuitem', { name: 'Follow Link' })).not.toBeInTheDocument()
    })

    it('opens on a touch long-press, but not before the hold completes', async () => {
      const link = await renderWithLink()

      vi.useFakeTimers()
      try {
        fireEvent.touchStart(link, { touches: [{ clientX: 10, clientY: 10 }] })
        act(() => vi.advanceTimersByTime(300))
        expect(screen.queryByRole('menuitem', { name: 'Follow Link' })).not.toBeInTheDocument()

        act(() => vi.advanceTimersByTime(300))
        expect(screen.getByRole('menuitem', { name: 'Follow Link' })).toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })

    it('cancels the long-press if the touch drifts before the hold completes', async () => {
      const link = await renderWithLink()

      vi.useFakeTimers()
      try {
        fireEvent.touchStart(link, { touches: [{ clientX: 10, clientY: 10 }] })
        fireEvent.touchMove(link, { touches: [{ clientX: 40, clientY: 40 }] })
        act(() => vi.advanceTimersByTime(600))

        expect(screen.queryByRole('menuitem', { name: 'Follow Link' })).not.toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })

    it('closes when clicking outside the menu', async () => {
      const link = await renderWithLink()
      fireEvent.contextMenu(link, { clientX: 40, clientY: 60 })
      await screen.findByRole('menuitem', { name: 'Follow Link' })

      await userEvent.click(document.body)

      expect(screen.queryByRole('menuitem', { name: 'Follow Link' })).not.toBeInTheDocument()
    })
  })

  // The right-side panel from docs/IDEAS.md's Pending item 1 -- dummy data
  // only for now (components/DestinationsPanel.test.tsx covers its content
  // in isolation); this just checks the toolbar toggle wires up to it.
  it('toggles the channels/destinations panel via the toolbar button', async () => {
    render(<App />)
    await screen.findByRole('textbox')
    expect(screen.queryByRole('heading', { name: 'Channels' })).not.toBeInTheDocument()

    const toggle = screen.getByTitle('Toggle channels & destinations')
    await userEvent.click(toggle)
    expect(screen.getByRole('heading', { name: 'Channels' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Destinations' })).toBeInTheDocument()

    await userEvent.click(toggle)
    expect(screen.queryByRole('heading', { name: 'Channels' })).not.toBeInTheDocument()
  })
})
