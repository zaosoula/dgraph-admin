<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useDgraphClient } from '@/composables/useDgraphClient'
import { useCodeMirror } from '@/composables/useCodeMirror'
import { Codemirror } from 'vue-codemirror'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { graphql } from 'cm6-graphql'
import { diffConfig, MergeView } from '@codemirror/merge'

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
const originalSchema = ref('') // Store the original schema from the server
const isLoading = ref(false)
const error = ref<string | null>(null)
const showDiff = ref(false)
const showConfirmDialog = ref(false)

// Initialize CodeMirror with vue-codemirror
const { extensions, value, updateContent, updateSchema } = useCodeMirror(schema.value, {
  readOnly: props.readOnly,
  onChange: (newValue) => {
    schema.value = newValue
    emit('update:schema', newValue)
  }
})

// DOM refs for diff view
const diffContainer = ref<HTMLElement | null>(null)
let mergeView: MergeView | null = null

// Count of changes
const changeCount = computed(() => {
  if (!originalSchema.value || !schema.value) return { additions: 0, deletions: 0, modifications: 0 }
  
  // This is a simplified count based on line differences
  const originalLines = originalSchema.value.split('\n').length
  const currentLines = schema.value.split('\n').length
  
  return {
    additions: Math.max(0, currentLines - originalLines),
    deletions: Math.max(0, originalLines - currentLines),
    modifications: 0 // This is harder to calculate without parsing the diff
  }
})

// Create and configure the merge view
const setupDiffView = () => {
  if (!diffContainer.value || !originalSchema.value || !schema.value) return
  
  // Clear the container
  diffContainer.value.innerHTML = ''
  
  // Configure the merge view
  const config = {
    a: {
      doc: originalSchema.value,
      extensions: [
        basicSetup,
        graphql(),
        EditorState.readOnly.of(true),
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-content": { fontFamily: "monospace" }
        })
      ]
    },
    b: {
      doc: schema.value,
      extensions: [
        basicSetup,
        graphql(),
        EditorState.readOnly.of(true),
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-content": { fontFamily: "monospace" }
        })
      ]
    },
    parent: diffContainer.value,
    revertControls: false,
    highlightChanges: true,
    collapseUnchanged: {
      margin: 10,
      minSize: 3
    }
  }
  
  // Create the merge view
  mergeView = new MergeView(diffConfig(config))
}

// Watch for changes in the schemas and update the merge view when in diff mode
watch([() => originalSchema.value, () => schema.value, () => showDiff.value], () => {
  if (showDiff.value && diffContainer.value) {
    // Destroy the previous merge view if it exists
    if (mergeView) {
      mergeView.destroy()
      mergeView = null
    }
    
    // Create a new merge view with the updated schemas
    setupDiffView()
  }
})

// Set up the diff view when it becomes visible
watch(() => showDiff.value, (newValue) => {
  if (newValue) {
    // Need to wait for the DOM to update
    setTimeout(() => {
      setupDiffView()
    }, 0)
  } else if (mergeView) {
    // Clean up when switching away from diff view
    mergeView.destroy()
    mergeView = null
  }
})

// Clean up when component is unmounted
onMounted(() => {
  return () => {
    if (mergeView) {
      mergeView.destroy()
      mergeView = null
    }
  }
})

// Check if there are changes
const hasChanges = computed(() => {
  return originalSchema.value !== schema.value
})

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
      // For authentication errors, show a more user-friendly message
      if (result.error.code === 'AUTH_ERROR' || result.error.code === 'ErrorUnauthorized') {
        error.value = result.error.message
        // Add details if they exist
        if (result.error.details) {
          try {
            // Try to parse the details as JSON
            const parsedDetails = JSON.parse(result.error.details)
            if (Array.isArray(parsedDetails) && parsedDetails.length > 0) {
              // Add the first error message to the error display
              error.value += `: ${parsedDetails[0].message}`
            }
          } catch (e) {
            // If parsing fails, just log the error
            console.error('Failed to parse error details:', e)
          }
        }
      } else {
        // For other errors, just show the message
        error.value = result.error.message
      }
      
      // Log details for debugging
      if (result.error.details) {
        console.error(`Schema load error (${result.error.code || 'unknown'}) details:`, result.error.details)
      }
      return
    }
    
    if (result.data) {
      schema.value = result.data.schema
      value.value = result.data.schema // Update CodeMirror content
      originalSchema.value = result.data.schema // Store the original schema
      emit('update:schema', schema.value)
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
  
  // If showing diff, toggle back to editor
  if (showDiff.value) {
    showDiff.value = false
  }
  
  // If there are changes, show confirmation dialog
  if (hasChanges.value && !showConfirmDialog.value) {
    showConfirmDialog.value = true
    return
  }
  
  // Reset confirmation dialog
  showConfirmDialog.value = false
  
  isLoading.value = true
  error.value = null
  
  try {
    const result = await dgraphClient.updateSchema(schema.value)
    
    if (result.error) {
      // For authentication errors, show a more user-friendly message
      if (result.error.code === 'AUTH_ERROR' || result.error.code === 'ErrorUnauthorized') {
        error.value = result.error.message
        // Add details if they exist
        if (result.error.details) {
          try {
            // Try to parse the details as JSON
            const parsedDetails = JSON.parse(result.error.details)
            if (Array.isArray(parsedDetails) && parsedDetails.length > 0) {
              // Add the first error message to the error display
              error.value += `: ${parsedDetails[0].message}`
            }
          } catch (e) {
            // If parsing fails, just log the error
            console.error('Failed to parse error details:', e)
          }
        }
      } else {
        // For other errors, just show the message
        error.value = result.error.message
      }
      
      // Log details for debugging
      if (result.error.details) {
        console.error(`Schema save error (${result.error.code || 'unknown'}) details:`, result.error.details)
      }
      return
    }
    
    // Update the original schema after successful save
    originalSchema.value = schema.value
    
    emit('save', schema.value)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    isLoading.value = false
  }
}

// Cancel save operation
const cancelSave = () => {
  showConfirmDialog.value = false
}

// Toggle diff view
const toggleDiff = () => {
  showDiff.value = !showDiff.value
}

// Watch for active connection changes
watch(() => connectionsStore.activeConnectionId, (newId) => {
  if (newId) {
    loadSchema()
  }
})

// Watch for initialSchema changes
watch(() => props.initialSchema, (newSchema) => {
  if (newSchema !== undefined && newSchema !== schema.value) {
    schema.value = newSchema
    value.value = newSchema // Update CodeMirror content
  }
})

// Initialize
onMounted(() => {
  if (connectionsStore.activeConnectionId) {
    loadSchema()
  }
})
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex justify-between items-center mb-2">
      <h3 class="text-lg font-medium">GraphQL Schema</h3>
      
      <div class="flex space-x-2">
        <!-- Toggle diff view button -->
        <UiButton 
          v-if="hasChanges"
          variant="outline" 
          size="sm" 
          @click="toggleDiff" 
          :disabled="isLoading || !connectionsStore.activeConnection"
        >
          {{ showDiff ? 'Edit Mode' : 'Show Diff' }}
        </UiButton>
        
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
    
    <!-- Confirmation dialog -->
    <div v-if="showConfirmDialog" class="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded mb-2">
      <h4 class="font-medium mb-2">Confirm Schema Update</h4>
      <p class="mb-2">Are you sure you want to update the schema? This action cannot be undone.</p>
      <div class="flex justify-end space-x-2">
        <UiButton 
          variant="outline" 
          size="sm" 
          @click="cancelSave"
        >
          Cancel
        </UiButton>
        <UiButton 
          size="sm" 
          @click="saveSchema"
        >
          Confirm Update
        </UiButton>
      </div>
    </div>
    
    <div v-if="isLoading" class="flex items-center justify-center p-4">
      <div class="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
    </div>
    
    <div v-else-if="showDiff" class="flex-1 border rounded-md overflow-auto">
      <!-- Diff view -->
      <div ref="diffContainer" class="h-full"></div>
    </div>
    
    <div v-else class="flex-1 border rounded-md overflow-hidden">
      <!-- Vue CodeMirror editor with GraphQL syntax highlighting -->
      <div class="w-full h-full overflow-auto">
        <Codemirror
          v-model="schema"
          :extensions="extensions"
          :indent-with-tab="true"
          :tab-size="2"
          class="w-full h-full"
          style="height: 100%; overflow: auto;"
        />
      </div>
    </div>
  </div>
</template>

<style>
/* CodeMirror Merge Styles */
.cm-merge {
  height: 100%;
}

.cm-merge-gap {
  background-color: #f9fafb;
  border-left: 1px solid #e5e7eb;
  border-right: 1px solid #e5e7eb;
}

.cm-merge-2pane .cm-merge-pane {
  width: 50%;
}

.cm-merge-pane-original {
  border-right: 1px solid #e5e7eb;
}

/* Diff highlighting */
.cm-merge-deleted {
  background-color: #fee2e2;
}

.cm-merge-inserted {
  background-color: #dcfce7;
}

/* Make sure the editors take full height */
.cm-editor {
  height: 100%;
}
</style>
