import { useEffect, useState } from 'react'
import './App.css'
import { createDesktopDoc } from './lib/desktopDoc'
import { useDesktopText } from './lib/useDesktopText'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

function App() {
  const [{ text, provider }] = useState(() => createDesktopDoc())
  const [value, setValue] = useDesktopText(text)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')

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
      <textarea
        className="desktop-editor"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Type anything. Destinations and Smart send come later — for now this is just the shared desktop."
        autoFocus
      />
    </div>
  )
}

export default App
