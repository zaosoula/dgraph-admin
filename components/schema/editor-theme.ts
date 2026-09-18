import { Prec } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { tags as t } from "@lezer/highlight"

/**
 * CodeMirror wears the app's design tokens.
 *
 * Every value here is a CSS custom property, so light and dark are still
 * decided in one place (`assets/css/tailwind.css`) and the editor follows the
 * theme without a second definition or a runtime swap.
 */
const theme = EditorView.theme({
  "&": {
    color: "var(--foreground)",
    backgroundColor: "var(--card)",
    fontSize: "12px",
    height: "100%"
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.6"
  },
  ".cm-content": {
    caretColor: "var(--foreground)",
    padding: "8px 0"
  },
  ".cm-gutters": {
    backgroundColor: "var(--muted)",
    color: "var(--muted-foreground)",
    border: "none",
    borderRight: "1px solid var(--border)"
  },
  ".cm-activeLine": { backgroundColor: "var(--accent)" },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--accent)",
    color: "var(--foreground)"
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--cm-selection)"
  },
  ".cm-panels": {
    backgroundColor: "var(--card)",
    color: "var(--foreground)"
  },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: "6px"
  }
})

const highlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword], color: "var(--cm-keyword)" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--cm-type)" },
  { tag: [t.string, t.special(t.string)], color: "var(--cm-string)" },
  { tag: [t.number, t.bool, t.null], color: "var(--cm-number)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--cm-comment)", fontStyle: "italic" },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: "var(--cm-property)" },
  { tag: [t.variableName, t.attributeName], color: "var(--cm-variable)" },
  { tag: [t.punctuation, t.separator, t.bracket], color: "var(--cm-punctuation)" },
  { tag: [t.meta, t.annotation], color: "var(--cm-meta)" },
  { tag: t.invalid, color: "var(--danger)" }
])

/**
 * Appended after the extensions from `useCodeMirror`; the highlight style is
 * raised in precedence so it replaces CodeMirror's light-only default.
 */
export const editorTheme = [theme, Prec.highest(syntaxHighlighting(highlightStyle))]
