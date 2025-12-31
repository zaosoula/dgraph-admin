import { ref, watch, onMounted, type Ref } from 'vue'
import { Codemirror } from 'vue-codemirror'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { graphql } from 'cm6-graphql'

export function useCodeMirror(
  initialValue: string = '',
  options: {
    readOnly?: boolean
    onChange?: (value: string) => void
    schema?: any
  } = {}
) {
  const { readOnly = false, onChange, schema } = options
  const value = ref(initialValue)
  const editorRef = ref<InstanceType<typeof Codemirror> | null>(null)
  
  // Create extensions array with GraphQL support
  const createExtensions = () => {
    const extensions: Extension[] = [
      lineNumbers(),
      history(),
      indentOnInput(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      syntaxHighlighting(defaultHighlightStyle),
      // Use schema if provided, otherwise just basic GraphQL syntax
      schema ? graphql(schema) : graphql(),
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

    return extensions
  }

  // Update editor content
  const updateContent = (newContent: string) => {
    if (!editorRef.value?.view) return
    
    const view = editorRef.value.view
    const currentContent = view.state.doc.toString()
    
    if (currentContent !== newContent) {
      view.dispatch({
        changes: { from: 0, to: currentContent.length, insert: newContent }
      })
    }
  }

  // Update schema
  const updateSchema = (newSchema: any) => {
    if (!editorRef.value?.view) return
    
    // Use the updateSchema function from cm6-graphql
    if (typeof window !== 'undefined') {
      const { updateSchema: updateGraphQLSchema } = require('cm6-graphql')
      updateGraphQLSchema(editorRef.value.view, newSchema)
    }
  }

  // Watch for value changes
  watch(value, (newValue) => {
    if (editorRef.value?.view && editorRef.value.view.state.doc.toString() !== newValue) {
      updateContent(newValue)
    }
  })

  // Computed to get the editor view
  const editorView = computed(() => editorRef.value?.view || null)

  // Get document metrics
  const getDocumentMetrics = () => {
    if (!editorView.value) return null
    
    const view = editorView.value
    const doc = view.state.doc
    
    return {
      totalLines: doc.lines,
      scrollTop: view.scrollDOM.scrollTop,
      scrollHeight: view.scrollDOM.scrollHeight,
      clientHeight: view.scrollDOM.clientHeight,
      lineHeight: view.defaultLineHeight
    }
  }

  // Scroll to line
  const scrollToLine = (lineNumber: number) => {
    if (!editorView.value) return
    
    const view = editorView.value
    const doc = view.state.doc
    
    if (lineNumber < 1 || lineNumber > doc.lines) return
    
    const line = doc.line(lineNumber)
    view.dispatch({
      effects: EditorView.scrollIntoView(line.from, { y: 'start' })
    })
  }

  // Get line at position
  const getLineAtPosition = (pos: number) => {
    if (!editorView.value) return null
    
    const doc = editorView.value.state.doc
    try {
      return doc.lineAt(pos)
    } catch {
      return null
    }
  }

  return {
    value,
    editorRef,
    editorView,
    extensions: createExtensions(),
    updateContent,
    updateSchema,
    getDocumentMetrics,
    scrollToLine,
    getLineAtPosition
  }
}
