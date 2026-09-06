import { BulletList } from '@tiptap/extension-bullet-list'

/**
 * StarterKit's BulletList registers an input rule that turns "-", "+", or "*"
 * followed by a space at the start of a line into a bullet list as you type
 * (Markdown-style shorthand). That's surprising in a plain writing surface --
 * a line meant to literally start with a dash/asterisk silently becomes a
 * list item -- so this variant drops the input rule while keeping every
 * other bulletList behavior (the toolbar button, Mod-Shift-8, list-to-list
 * conversion, etc) intact.
 */
export const BulletListNoAutoConvert = BulletList.extend({
  addInputRules() {
    return []
  },
})
