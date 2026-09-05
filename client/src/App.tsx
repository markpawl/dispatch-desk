import { EditorContent, useEditor } from '@tiptap/react'
import Collaboration from '@tiptap/extension-collaboration'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useState } from 'react'
import './App.css'
import { createDesktopDoc } from './lib/desktopDoc'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

function App() {
  const [{ fragment, provider }] = useState(() => createDesktopDoc())
  const [status, setStatus] = useState<ConnectionStatus>('connecting')

  const editor = useEditor({
    extensions: [
      // Undo/redo comes from Collaboration's own Yjs-aware history instead,
      // so the two don't fight over the same keyboard shortcuts/state.
      StarterKit.configure({ undoRedo: false }),
      Collaboration.configure({ fragment }),
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
      <EditorContent className="desktop-editor" editor={editor} />
    </div>
  )
}

export default App
