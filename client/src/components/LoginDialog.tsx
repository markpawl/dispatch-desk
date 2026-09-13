import { useEffect, useRef, useState } from 'react'

// The signed-out counterpart to AccountMenu.tsx: a corner button reading
// "Log In" that opens a popover of login options -- just "Sign in with
// Google" for now, laid out as a list so a future provider is just another
// row. Never opens on its own; only via clicking the button (see
// docs/CURRENT-WORK.md).
export function LoginDialog() {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const onClickAway = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [isOpen])

  return (
    <div className="login-dialog" ref={containerRef}>
      <button
        type="button"
        className="login-dialog-button"
        onClick={() => setIsOpen((open) => !open)}
        title="Log in"
      >
        Log In
      </button>
      {isOpen && (
        <div className="login-dialog-popover">
          <a className="login-dialog-option" href="/auth/login/google">
            Sign in with Google
          </a>
        </div>
      )}
    </div>
  )
}
