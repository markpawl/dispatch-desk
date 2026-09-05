import '@testing-library/jest-dom'

// jsdom doesn't implement layout, so it has no getClientRects/
// getBoundingClientRect on Range or Element -- ProseMirror's view (used by
// the Tiptap editor in App.tsx) calls these on every selection change to
// scroll the cursor into view. Stub them out with empty-but-valid rects so
// that codepath doesn't throw in tests, which don't care about real layout.
const emptyRect: DOMRect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  toJSON: () => ({}),
}
const emptyRectList = (): DOMRectList =>
  Object.assign([], { item: () => null }) as unknown as DOMRectList

Range.prototype.getBoundingClientRect = () => emptyRect
Range.prototype.getClientRects = emptyRectList
Element.prototype.getClientRects = emptyRectList

// Same story for hit-testing: ProseMirror maps a mousedown's screen
// coordinates back to a document position via elementFromPoint, which jsdom
// doesn't implement either.
document.elementFromPoint = () => null
