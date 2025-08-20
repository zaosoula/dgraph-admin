<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount, shallowRef } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useDgraphClient } from '@/composables/useDgraphClient'
import { EditorState, Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { sql, SQLDialect } from '@codemirror/lang-sql'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'

const props = defineProps<{
  initialSchema?: string
  readOnly?: boolean
}>()

const emit = defineEmits<{
  'update:schema': [schema: string]
  'save': [schema: string]
}>()

const connectionsStore = useConnectionsStore()
const dgraphClient = useDgraphClient()

const schema = ref(props.initialSchema || '')
const isLoading = ref(false)
const error = ref<string | null>(null)
const editorContainer = ref<HTMLDivElement | null>(null)
const editorView = shallowRef<EditorView | null>(null)

// Custom GraphQL-like dialect for SQL language (as a fallback for GraphQL)
const graphqlDialect = SQLDialect.define({
  keywords: [
    'type', 'input', 'interface', 'enum', 'union', 'scalar', 'directive',
    'extend', 'schema', 'query', 'mutation', 'subscription', 'fragment',
    'on', 'implements', 'repeatable'
  ],
  types: [
    'ID', 'String', 'Int', 'Float', 'Boolean', 'DateTime'
  ],
  builtin: [
    '@deprecated', '@skip', '@include', '@specifiedBy'
  ],
  operatorChars: "@!:=<>",
  identifierQuotes: '""\'\'``',
  specialVar: []
})

// Create CodeMirror editor
const createEditor = () => {
  if (!editorContainer.value) return
  
  // Clear container first
  editorContainer.value.innerHTML = ''
  
  // Define extensions
  const extensions: Extension[] = [
    lineNumbers(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    highlightActiveLine(),
    syntaxHighlighting(defaultHighlightStyle),
    sql({ dialect: graphqlDialect }),
    EditorView.updateListener.of(update => {
      if (update.docChanged) {
        schema.value = update.state.doc.toString()
        emit('update:schema', schema.value)
      }
    }),
    EditorView.theme({
      "&": {
        height: "100%",
        fontSize: "14px",
        fontFamily: "monospace"
      },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily: "monospace"
      },
      ".cm-content": {
        caretColor: "#0D9488"
      },
      ".cm-cursor": {
        borderLeftColor: "#0D9488"
      },
      ".cm-activeLine": {
        backgroundColor: "rgba(226, 232, 240, 0.5)"
      },
      ".cm-gutters": {
        backgroundColor: "#f8fafc",
        color: "#64748b",
        border: "none"
      }
    })
  ]
  
  // Add read-only extension if needed
  if (props.readOnly) {
    extensions.push(EditorState.readOnly.of(true))
  }
  
  // Create editor state
  const state = EditorState.create({
    doc: schema.value,
    extensions
  })
  
  // Create editor view
  editorView.value = new EditorView({
    state,
    parent: editorContainer.value
  })
}

// Update editor content when schema changes externally
const updateEditorContent = () => {
  if (!editorView.value) return
  
  const currentContent = editorView.value.state.doc.toString()
  if (currentContent !== schema.value) {
    editorView.value.dispatch({
      changes: {
        from: 0,
        to: currentContent.length,
        insert: schema.value
      }
    })
  }
}

// Load schema from active connection
const loadSchema = async () => {
  if (!connectionsStore.activeConnection) {
    error.value = 'No active connection'
    return
  }
  
  isLoading.value = true
  error.value = null
  
  try {
    const result = await dgraphClient.getSchema()
    
    if (result.error) {
      error.value = result.error.message
      if (result.error.details) {
        console.error('Schema load error details:', result.error.details)
      }
      return
    }
    
    if (result.data) {
      schema.value = result.data.schema
      emit('update:schema', schema.value)
      updateEditorContent()
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    isLoading.value = false
  }
}

// Save schema to active connection
const saveSchema = async () => {
  if (!connectionsStore.activeConnection) {
    error.value = 'No active connection'
    return
  }
  
  isLoading.value = true
  error.value = null
  
  try {
    const result = await dgraphClient.updateSchema(schema.value)
    
    if (result.error) {
      error.value = result.error.message
      if (result.error.details) {
        console.error('Schema save error details:', result.error.details)
      }
      return
    }
    
    emit('save', schema.value)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    isLoading.value = false
  }
}

// Watch for schema changes from parent component
watch(() => props.initialSchema, (newSchema) => {
  if (newSchema !== undefined && newSchema !== schema.value) {
    schema.value = newSchema
    updateEditorContent()
  }
})

// Watch for active connection changes
watch(() => connectionsStore.activeConnectionId, (newId) => {
  if (newId) {
    loadSchema()
  }
})

// Initialize
onMounted(() => {
  createEditor()
  
  if (connectionsStore.activeConnectionId) {
    loadSchema()
  }
})

// Cleanup
onBeforeUnmount(() => {
  if (editorView.value) {
    editorView.value.destroy()
  }
})
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex justify-between items-center mb-2">
      <h3 class="text-lg font-medium">GraphQL Schema</h3>
      
      <div class="flex space-x-2">
        <UiButton 
          variant="outline" 
          size="sm" 
          @click="loadSchema" 
          :disabled="isLoading || !connectionsStore.activeConnection"
        >
          Reload
        </UiButton>
        
        <UiButton 
          size="sm" 
          @click="saveSchema" 
          :disabled="isLoading || !connectionsStore.activeConnection || props.readOnly"
        >
          Save Schema
        </UiButton>
      </div>
    </div>
    
    <div v-if="error" class="bg-red-50 text-red-700 p-2 rounded mb-2">
      {{ error }}
    </div>
    
    <div v-if="isLoading" class="flex items-center justify-center p-4">
      <div class="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
    </div>
    
    <div v-else class="flex-1 border rounded-md overflow-hidden">
      <!-- CodeMirror editor container -->
      <div 
        ref="editorContainer" 
        class="w-full h-full"
        style="min-height: 400px;"
      ></div>
    </div>
  </div>
</template>
