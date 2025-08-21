<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useDgraphClient } from '@/composables/useDgraphClient'
import { useCodeMirror } from '@/composables/useCodeMirror'
import { Codemirror } from 'vue-codemirror'

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

// Compute the diff between original and current schema
const schemaDiff = computed(() => {
  if (!originalSchema.value || !schema.value) return []
  
  // Simple line-by-line diff
  const originalLines = originalSchema.value.split('\n')
  const currentLines = schema.value.split('\n')
  
  const diff: Array<{ line: string; type: 'added' | 'removed' | 'unchanged' }> = []
  
  // Find the maximum length
  const maxLength = Math.max(originalLines.length, currentLines.length)
  
  for (let i = 0; i < maxLength; i++) {
    const originalLine = i < originalLines.length ? originalLines[i] : null
    const currentLine = i < currentLines.length ? currentLines[i] : null
    
    if (originalLine === currentLine) {
      // Line is unchanged
      if (originalLine !== null) {
        diff.push({ line: originalLine, type: 'unchanged' })
      }
    } else {
      // Line is changed
      if (originalLine !== null) {
        diff.push({ line: originalLine, type: 'removed' })
      }
      if (currentLine !== null) {
        diff.push({ line: currentLine, type: 'added' })
      }
    }
  }
  
  return diff
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
      <div class="font-mono text-sm p-4">
        <div v-for="(line, index) in schemaDiff" :key="index" class="flex">
          <div class="w-8 text-gray-500 select-none">{{ index + 1 }}</div>
          <div 
            class="flex-1" 
            :class="{
              'bg-red-100': line.type === 'removed',
              'bg-green-100': line.type === 'added'
            }"
          >
            <span v-if="line.type === 'removed'" class="text-red-700 select-none mr-1">-</span>
            <span v-if="line.type === 'added'" class="text-green-700 select-none mr-1">+</span>
            <span v-if="line.type === 'unchanged'" class="text-gray-500 select-none mr-1">&nbsp;</span>
            {{ line.line }}
          </div>
        </div>
      </div>
    </div>
    
    <div v-else class="flex-1 border rounded-md overflow-hidden">
      <!-- Vue CodeMirror editor with GraphQL syntax highlighting -->
      <Codemirror
        v-model="schema"
        :extensions="extensions"
        :indent-with-tab="true"
        :tab-size="2"
        class="w-full h-full"
      />
    </div>
  </div>
</template>

