import type { Editor } from '@tiptap/react'
import { localDateKey, localTimeLabel } from './localSendTime'

export type SendResult = { ok: true } | { ok: false; error: string }

// Sends the editor's current selection to a saved destination by id --
// shared between SendMenu.tsx (the toolbar's Send popover) and
// DestinationsPanel.tsx (sending directly from a sidebar row, see
// docs/CURRENT-WORK.md). localDate/localTime are read only when the
// destination resolves to email server-side, but harmless to always
// include (see server/src/requestHandler.ts's /api/send).
export async function sendSelectionToDestination(
  editor: Editor,
  destinationId: string,
): Promise<SendResult> {
  const { from, to } = editor.state.selection
  const text = editor.state.doc.textBetween(from, to, '\n')
  if (!text.trim()) return { ok: false, error: 'Select text first' }

  try {
    const response = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        destinationId,
        localDate: localDateKey(),
        localTime: localTimeLabel(),
      }),
    })
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as { error?: string } | null
      return { ok: false, error: errorBody?.error ?? 'Send failed' }
    }
    // The Send flow's default post-send action (see docs/REQUIREMENTS.md):
    // write a log entry (done server-side, above), then delete the sent
    // text from the desktop -- the desktop stays a transient working
    // surface, not an archive.
    editor.chain().focus().deleteSelection().run()
    return { ok: true }
  } catch {
    return { ok: false, error: 'Send failed' }
  }
}
