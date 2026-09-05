import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'

// A default palette rather than a full color picker -- "an easy way to
// change font color" doesn't need a full <input type="color"> to start.
const COLORS = ['#1a1a1a', '#c0392b', '#2a8a4a', '#1f6feb', '#b8860b']

interface EditorToolbarProps {
  editor: Editor | null
}

// Subscribes to just the bits of editor state the toolbar needs to
// highlight active formatting, re-rendering only when one of them actually
// changes (Tiptap v3's replacement for re-rendering on every transaction).
function useToolbarState(editor: Editor | null) {
  return useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return null
      return {
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        underline: editor.isActive('underline'),
        strike: editor.isActive('strike'),
        link: editor.isActive('link'),
        bulletList: editor.isActive('bulletList'),
        orderedList: editor.isActive('orderedList'),
        headingLevel: ([1, 2, 3] as const).find((level) =>
          editor.isActive('heading', { level }),
        ),
        color: editor.getAttributes('textStyle').color as string | undefined,
      }
    },
  })
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const state = useToolbarState(editor)

  if (!editor || !state) return null

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link URL', previousUrl ?? 'https://')
    if (url === null) return // cancelled
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="editor-toolbar">
      <button
        type="button"
        className={state.bold ? 'active' : ''}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold (Ctrl+B)"
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        className={state.italic ? 'active' : ''}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic (Ctrl+I)"
      >
        <em>i</em>
      </button>
      <button
        type="button"
        className={state.underline ? 'active' : ''}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline (Ctrl+U)"
      >
        <u>U</u>
      </button>
      <button
        type="button"
        className={state.strike ? 'active' : ''}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="Strikethrough"
      >
        <s>S</s>
      </button>

      <span className="toolbar-divider" />

      {([1, 2, 3] as const).map((level) => (
        <button
          key={level}
          type="button"
          className={state.headingLevel === level ? 'active' : ''}
          onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
          title={`Heading ${level}`}
        >
          H{level}
        </button>
      ))}
      <button
        type="button"
        className={state.bulletList ? 'active' : ''}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet list"
      >
        •—
      </button>
      <button
        type="button"
        className={state.orderedList ? 'active' : ''}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered list"
      >
        1.—
      </button>

      <span className="toolbar-divider" />

      <button
        type="button"
        className={state.link ? 'active' : ''}
        onClick={setLink}
        title="Link"
      >
        🔗
      </button>

      <span className="toolbar-divider" />

      {COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={`color-swatch ${state.color === color ? 'active' : ''}`}
          style={{ backgroundColor: color }}
          onClick={() => editor.chain().focus().setColor(color).run()}
          title={color}
          aria-label={`Text color ${color}`}
        />
      ))}
      <button
        type="button"
        onClick={() => editor.chain().focus().unsetColor().run()}
        title="Clear color"
      >
        ⌀
      </button>
    </div>
  )
}
