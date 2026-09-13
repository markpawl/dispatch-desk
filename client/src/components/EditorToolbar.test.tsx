import { useEditor } from '@tiptap/react'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { EditorToolbar } from './EditorToolbar'

// A real Tiptap editor (not a hand-rolled fake), same rationale as
// SendMenu.test.tsx's harness -- useEditorState's selectors need one.
function Harness({ disabled }: { disabled?: boolean }) {
  const editor = useEditor({
    extensions: [StarterKit, TextStyle, Color],
    content: '<p>hello</p>',
  })
  return <EditorToolbar editor={editor} disabled={disabled} />
}

describe('EditorToolbar', () => {
  it('returns null with no editor', () => {
    const { container } = render(<EditorToolbar editor={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders enabled, clickable buttons by default', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const bold = await screen.findByRole('button', { name: 'B' })
    expect(bold).toBeEnabled()
    await user.click(bold)
    expect(bold).toHaveClass('active')
  })

  it('disables every button when disabled is set, regardless of editor state', async () => {
    render(<Harness disabled />)
    const buttons = await screen.findAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) {
      expect(button).toBeDisabled()
    }
  })
})
