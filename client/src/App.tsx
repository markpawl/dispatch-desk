import { EditorContent, useEditor } from '@tiptap/react'
import Collaboration from '@tiptap/extension-collaboration'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useState } from 'react'
import './App.css'
import { EditorToolbar } from './components/EditorToolbar'
import { createDesktopDoc } from './lib/desktopDoc'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

function App() {
  const [{ fragment, provider }] = useState(() => createDesktopDoc())
  const [status, setStatus] = useState<ConnectionStatus>('connecting')

  const editor = useEditor({
    extensions: [
      // Undo/redo comes from Collaboration's own Yjs-aware history instead,
      // so the two don't fight over the same keyboard shortcuts/state.
      // Underline and Link are already bundled in StarterKit (Tiptap v3) --
      // only Link's default (open-on-click, wrong for an editable surface)
      // needs overriding.
      StarterKit.configure({ undoRedo: false, link: { openOnClick: false } }),
      Collaboration.configure({ fragment }),
      TextStyle,
      Color,
    ],
    autofocus: true,
  })

  useEffect(() => {
    const onStatus = ({ status }: { status: ConnectionStatus }) => setStatus(status)
    provider.on('status', onStatus)
    return () => {
      provider.off('status', onStatus)
      provider.destroy()
    }
  }, [provider])

  return (
    <div className="desktop">
      <header className="desktop-header">
        <h1>Dispatch Desk</h1>
        <span className={`status status-${status}`}>{status}</span>
      </header>
      <EditorToolbar editor={editor} />
      <EditorContent className="desktop-editor" editor={editor} />
    </div>
  )
}

export default App
