<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useDgraphClient } from '@/composables/useDgraphClient'
import { useCodeMirror } from '@/composables/useCodeMirror'
import { Codemirror } from 'vue-codemirror'
import { editorTheme } from './editor-theme'
import { useToast } from '@/components/ui/toast'

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
const toast = useToast()

const schema = ref(props.initialSchema || '')
const originalSchema = ref('') // Store the original schema from the server
const isLoading = ref(false)
const error = ref<string | null>(null)
const showDiff = ref(false)
const showConfirmDialog = ref(false)

// Initialize CodeMirror with vue-codemirror and reference linking.
// `schema` is the single source of truth: it backs the v-model below and feeds the parser.
const { extensions: baseExtensions } = useCodeMirror(schema, {
  readOnly: props.readOnly,
  enableReferenceLinks: true,
  onChange: (newValue) => {
    emit('update:schema', newValue)
  }
})

// The editor wears the app's tokens rather than CodeMirror's light-only default
const extensions = [...baseExtensions, editorTheme]

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
  
  // Writing to the database always requires an explicit confirmation
  if (!showConfirmDialog.value) {
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

    toast.success(
      'Schema written',
      `${connectionsStore.activeConnection?.name ?? 'The connection'} is now running this schema.`
    )

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
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-[13px] font-semibold tracking-tight">GraphQL schema</h3>
      
      <div class="flex space-x-2">
        <!-- Toggle diff view button -->
        <UiButton 
          v-if="hasChanges"
          variant="outline" 
          size="sm" 
          :disabled="isLoading || !connectionsStore.activeConnection" 
          @click="toggleDiff"
        >
          {{ showDiff ? 'Back to editor' : 'Show changes' }}
        </UiButton>
        
        <UiButton 
          variant="outline" 
          size="sm" 
          :disabled="isLoading || !connectionsStore.activeConnection" 
          @click="loadSchema"
        >
          Reload schema
        </UiButton>
        
        <UiButton 
          size="sm" 
          :disabled="isLoading || !connectionsStore.activeConnection || props.readOnly" 
          @click="saveSchema"
        >
          Save schema
        </UiButton>
      </div>
    </div>
    
    <div
      v-if="error"
      class="mb-2 rounded-md border border-danger-border bg-danger-subtle px-3 py-2 text-xs leading-5 text-danger"
    >
      {{ error }}
    </div>
    
    <!-- Confirmation dialog -->
    <div
      v-if="showConfirmDialog"
      class="mb-2 rounded-md border border-warning-border bg-warning-subtle px-3 py-3"
    >
      <h4 class="text-[13px] font-medium text-warning">
        Write this schema to {{ connectionsStore.activeConnection?.name }}?
      </h4>
      <p class="mt-0.5 text-xs leading-5 text-foreground/80">
        The live schema is replaced with what is in the editor. This cannot be undone.
      </p>
      <div class="mt-3 flex justify-end gap-2">
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
      <div class="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"/>
    </div>
    
    <div v-else-if="showDiff" class="min-h-0 flex-1">
      <SchemaDiffViewer
        class="h-full"
        :original-schema="originalSchema"
        :new-schema="schema"
        left-label="Saved on server"
        right-label="Editor"
      />
    </div>
    
    <div v-else class="flex-1 overflow-hidden rounded-md border border-border">
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
/* GraphQL hover tooltip styling */
::deep(.graphql-hover-tooltip) {
  z-index: 1000;
  font-family: var(--font-sans);
}

::deep(.graphql-hover-tooltip .font-mono) {
  font-family: var(--font-mono);
}

/* GraphQL navigation styling */
@keyframes graphql-highlight-fade {
  0% {
    background-color: var(--warning-subtle);
  }
  100% {
    background-color: transparent;
  }
}

::deep(.cm-editor .cm-content) {
  position: relative;
}

::deep(.cm-editor .graphql-type-hover) {
  cursor: pointer;
}

/* Type reference hover effects */
::deep(.graphql-type-hover) {
  text-decoration: underline;
  text-decoration-color: var(--cm-type);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

::deep(.graphql-definition-highlight) {
  background-color: var(--warning-subtle);
  border-radius: 2px;
  animation: graphql-highlight-fade 2s ease-out;
}

</style>
