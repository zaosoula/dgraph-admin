import { ref, onMounted, watch, type Ref } from 'vue'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { graphql } from 'cm6-graphql'

export function useCodeMirror(
  element: Ref<HTMLElement | null>,
  initialValue: string = '',
  options: {
    readOnly?: boolean
    onChange?: (value: string) => void
  } = {}
) {
  const { readOnly = false, onChange } = options
  const value = ref(initialValue)
  let view: EditorView | null = null

  const createState = (doc: string) => {
    const extensions: Extension[] = [
      lineNumbers(),
      history(),
      indentOnInput(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      syntaxHighlighting(defaultHighlightStyle),
      graphql(),
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          const newValue = update.state.doc.toString()
          value.value = newValue
          onChange?.(newValue)
        }
      })
    ]

    if (readOnly) {
      extensions.push(EditorState.readOnly.of(true))
    }

    return EditorState.create({
      doc,
      extensions
    })
  }

  const initEditor = () => {
    if (!element.value) return

    view = new EditorView({
      state: createState(value.value),
      parent: element.value
    })
  }

  const updateContent = (newContent: string) => {
    if (!view) return

    const currentContent = view.state.doc.toString()
    if (currentContent !== newContent) {
      view.dispatch({
        changes: { from: 0, to: currentContent.length, insert: newContent }
      })
    }
  }

  onMounted(() => {
    if (element.value) {
      initEditor()
    }
  })

  watch(element, (newElement) => {
    if (newElement && !view) {
      initEditor()
    }
  })

  watch(value, (newValue) => {
    if (view && view.state.doc.toString() !== newValue) {
      updateContent(newValue)
    }
  })

  return {
    value,
    updateContent
  }
}

