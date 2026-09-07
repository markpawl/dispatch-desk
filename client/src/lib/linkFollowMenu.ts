import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export interface LinkFollowMenuOptions {
  onRequestMenu: (href: string, x: number, y: number) => void
}

// How long a touch has to be held on a link before it counts as a
// long-press, matching typical OS/browser long-press thresholds closely
// enough that a native long-press context menu -- where the browser
// supports one -- tends to fire the `contextmenu` handler below first and
// cancel this timer, rather than racing it.
const LONG_PRESS_MS = 600

// How far a touch may drift while held before it's treated as a
// scroll/drag rather than a long-press, in CSS pixels.
const MOVE_TOLERANCE_PX = 10

function findLink(target: EventTarget | null): HTMLAnchorElement | null {
  return target instanceof Element ? target.closest('a[href]') : null
}

// Opens a small "Follow Link" menu (see LinkFollowMenu.tsx) on right-click
// or touch long-press over a link, in place of the browser's own context
// menu. The Link extension bundled in StarterKit is configured with
// `openOnClick: false` (App.tsx) since a plain click/tap on a link needs to
// place the cursor, not navigate -- which otherwise leaves no way at all to
// actually open a link from the desktop.
export const LinkFollowMenu = Extension.create<LinkFollowMenuOptions>({
  name: 'linkFollowMenu',

  addOptions() {
    return { onRequestMenu: () => {} }
  },

  addProseMirrorPlugins() {
    const { onRequestMenu } = this.options

    let pressTimer: ReturnType<typeof setTimeout> | null = null
    let pressStart: { x: number; y: number } | null = null

    const clearPress = () => {
      if (pressTimer !== null) clearTimeout(pressTimer)
      pressTimer = null
      pressStart = null
    }

    return [
      new Plugin({
        key: new PluginKey('linkFollowMenu'),
        props: {
          handleDOMEvents: {
            contextmenu: (_view, event) => {
              const link = findLink(event.target)
              if (!link) return false
              // A native long-press that already reached here (some
              // touch browsers dispatch `contextmenu` on long-press)
              // supersedes the manual touch timer below.
              clearPress()
              event.preventDefault()
              onRequestMenu(link.href, event.clientX, event.clientY)
              return true
            },
            touchstart: (_view, event) => {
              const link = findLink(event.target)
              if (!link || event.touches.length !== 1) return false
              const { clientX, clientY } = event.touches[0]
              pressStart = { x: clientX, y: clientY }
              pressTimer = setTimeout(() => {
                pressTimer = null
                onRequestMenu(link.href, clientX, clientY)
              }, LONG_PRESS_MS)
              return false
            },
            touchmove: (_view, event) => {
              if (!pressStart) return false
              const touch = event.touches[0]
              if (!touch) return false
              const dx = touch.clientX - pressStart.x
              const dy = touch.clientY - pressStart.y
              if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) clearPress()
              return false
            },
            touchend: () => {
              clearPress()
              return false
            },
            touchcancel: () => {
              clearPress()
              return false
            },
          },
        },
      }),
    ]
  },
})
