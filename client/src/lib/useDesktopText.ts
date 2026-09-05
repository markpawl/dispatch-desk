import { useEffect, useRef, useState } from 'react'
import type * as Y from 'yjs'

// Tags transactions this hook itself made, so its own Y.Text observer doesn't
// react to (and re-render from) the very edit it just applied.
const LOCAL_ORIGIN = 'local-edit'

// Computes the minimal [start, deleteLength, insertedText] edit that turns
// `oldValue` into `newValue`, by trimming the common prefix and suffix.
// Good enough for a single-cursor textarea (typing, pasting, deleting) --
// small, targeted CRDT updates merge with a remote edit far better than
// replacing the whole buffer on every keystroke would.
export function diff(oldValue: string, newValue: string) {
  let start = 0
  const maxStart = Math.min(oldValue.length, newValue.length)
  while (start < maxStart && oldValue[start] === newValue[start]) start++

  let oldEnd = oldValue.length
  let newEnd = newValue.length
  while (
    oldEnd > start &&
    newEnd > start &&
    oldValue[oldEnd - 1] === newValue[newEnd - 1]
  ) {
    oldEnd--
    newEnd--
  }

  return {
    start,
    deleteLength: oldEnd - start,
    insertedText: newValue.slice(start, newEnd),
  }
}

// Binds a Y.Text to React state: typing calls `setValue`, which applies a
// minimal diff to the shared doc (see `diff` above); edits arriving from
// other clients update `value` via the Y.Text observer.
export function useDesktopText(ytext: Y.Text): [string, (next: string) => void] {
  const [value, setValue] = useState(() => ytext.toString())
  // Tracks the text this hook last knew about, for diffing against on the
  // next call to `update` -- written only from event handlers/effects below,
  // never during render, so it's safe to read a stale value mid-render.
  const lastKnownRef = useRef(value)

  useEffect(() => {
    const observer = (_event: Y.YTextEvent, transaction: Y.Transaction) => {
      if (transaction.origin === LOCAL_ORIGIN) return
      const next = ytext.toString()
      lastKnownRef.current = next
      setValue(next)
    }
    ytext.observe(observer)
    return () => ytext.unobserve(observer)
    // No catch-up read needed here: the initial `useState` lazy initializer
    // above already captured ytext's content as of this render, and nothing
    // else can mutate it between that render and this effect subscribing.
  }, [ytext])

  const update = (next: string) => {
    const { start, deleteLength, insertedText } = diff(lastKnownRef.current, next)
    ytext.doc?.transact(() => {
      if (deleteLength > 0) ytext.delete(start, deleteLength)
      if (insertedText.length > 0) ytext.insert(start, insertedText)
    }, LOCAL_ORIGIN)
    lastKnownRef.current = next
    setValue(next)
  }

  return [value, update]
}
