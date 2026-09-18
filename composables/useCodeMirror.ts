import { ref, type Ref } from 'vue'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { graphql } from 'cm6-graphql'
import type { GraphQLSchema } from 'graphql'
import { useGraphQLSchemaParser } from './useGraphQLSchemaParser'
import { createGraphQLHoverExtension } from './extensions/graphqlHoverExtension'
import { createGraphQLNavigationExtension } from './extensions/graphqlNavigationExtension'

/**
 * Build the CodeMirror extension set for a GraphQL schema editor.
 *
 * `value` is the single source of truth for the document: pass the same ref the
 * host component binds with `v-model` on `<Codemirror>` so the editor, the
 * component and the schema parser all read and write one string.
 */
export function useCodeMirror(
  value: Ref<string> = ref(''),
  options: {
    readOnly?: boolean
    onChange?: (value: string) => void
    schema?: GraphQLSchema
    enableReferenceLinks?: boolean
  } = {}
) {
  const { readOnly = false, onChange, schema, enableReferenceLinks = true } = options

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

  return {
    value,
    extensions: createExtensions(),
    // Expose schema parser for debugging/inspection
    schemaParser: schemaParser ? {
      typeDefinitions: schemaParser.typeDefinitions,
      typeReferences: schemaParser.typeReferences,
      parseError: schemaParser.parseError,
      allTypeNames: schemaParser.allTypeNames
    } : null
  }
}
