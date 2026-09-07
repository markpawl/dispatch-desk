import { useEffect, useRef } from 'react'

export interface LinkFollowMenuState {
  href: string
  x: number
  y: number
}

interface LinkFollowMenuProps {
  state: LinkFollowMenuState | null
  onClose: () => void
}

// The popup opened by `linkFollowMenu.ts`'s right-click/long-press
// detection. Deliberately a single action for now -- the desktop's general
// right-click menu (select text -> destinations, see docs/REQUIREMENTS.md's
// Send flow) doesn't exist yet, so this isn't trying to anticipate its
// shape.
export function LinkFollowMenu({ state, onClose }: LinkFollowMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!state) return

    const onOutsidePress = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', onOutsidePress)
    document.addEventListener('touchstart', onOutsidePress)
    document.addEventListener('keydown', onKeyDown)
    // A menu left pointing at coordinates the page has since scrolled past
    // is worse than none -- close rather than let it drift out of place.
    document.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onOutsidePress)
      document.removeEventListener('touchstart', onOutsidePress)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [state, onClose])

  if (!state) return null

  const follow = () => {
    window.open(state.href, '_blank', 'noopener,noreferrer')
    onClose()
  }

  return (
    <div
      className="link-follow-menu"
      ref={menuRef}
      role="menu"
      style={{ left: state.x, top: state.y }}
    >
      <button type="button" role="menuitem" onClick={follow}>
        Follow Link
      </button>
    </div>
  )
}
