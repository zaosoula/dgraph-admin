import { ref, watch, onMounted, type Ref } from 'vue'
import { Codemirror } from 'vue-codemirror'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { graphql } from 'cm6-graphql'
import { showMinimap } from '@replit/codemirror-minimap'
import { useGraphQLSchemaParser } from './useGraphQLSchemaParser'
import { createGraphQLHoverExtension } from './extensions/graphqlHoverExtension'
import { createGraphQLNavigationExtension } from './extensions/graphqlNavigationExtension'

export function useCodeMirror(
  initialValue: string = '',
  options: {
    readOnly?: boolean
    onChange?: (value: string) => void
    schema?: any
    enableReferenceLinks?: boolean
  } = {}
) {
  const { readOnly = false, onChange, schema, enableReferenceLinks = true } = options
  const value = ref(initialValue)
  const editorRef = ref<InstanceType<typeof Codemirror> | null>(null)
  
  // Initialize schema parser for reference linking
  const schemaParser = enableReferenceLinks ? useGraphQLSchemaParser(value) : null
  
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
      // Add minimap for better navigation
      showMinimap.of({
        side: 'right',
        showOverlay: 'mouse'
      }),
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          const newValue = update.state.doc.toString()
          value.value = newValue
          onChange?.(newValue)
        }
      })
    ]

    // Add reference linking extensions if enabled and parser is available
    if (enableReferenceLinks && schemaParser && !readOnly) {
      extensions.push(
        createGraphQLHoverExtension(
          schemaParser.findTypeDefinition,
          schemaParser.findTypeAtPosition
        ),
        ...createGraphQLNavigationExtension(
          schemaParser.findTypeDefinition,
          schemaParser.findTypeAtPosition
        )
      )
    }

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

  return {
    value,
    editorRef,
    extensions: createExtensions(),
    updateContent,
    updateSchema,
    // Expose schema parser for debugging/inspection
    schemaParser: schemaParser ? {
      typeDefinitions: schemaParser.typeDefinitions,
      typeReferences: schemaParser.typeReferences,
      parseError: schemaParser.parseError,
      allTypeNames: schemaParser.allTypeNames
    } : null
  }
}
