<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useDgraphClient } from '@/composables/useDgraphClient'
import { useCodeMirror } from '@/composables/useCodeMirror'
import { Codemirror } from 'vue-codemirror'
import * as diffLib from 'diff'

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
const processedDiff = computed(() => {
  if (!originalSchema.value || !schema.value) return []
  
  // First, get line-level diff to identify changed lines
  const lineDiff = diffLib.diffLines(originalSchema.value, schema.value)
  
  // Process the line diff to create a structured representation
  const result: {
    leftLineNumber: number | null
    rightLineNumber: number | null
    leftContent: string | null
    rightContent: string | null
    leftClass: string
    rightClass: string
    leftHighlights?: Array<{ start: number; end: number; isRemoved: boolean }>
    rightHighlights?: Array<{ start: number; end: number; isAdded: boolean }>
  }[] = []
  
  let leftLineCount = 0
  let rightLineCount = 0
  
  // Process each chunk from the line diff
  lineDiff.forEach(part => {
    const lines = part.value.split('\n')
    // Remove the last empty line that results from splitting a string that ends with \n
    if (lines[lines.length - 1] === '') {
      lines.pop()
    }
    
    if (part.added) {
      // Added lines - show only on the right
      lines.forEach(line => {
        rightLineCount++
        result.push({
          leftLineNumber: null,
          rightLineNumber: rightLineCount,
          leftContent: null,
          rightContent: line,
          leftClass: '',
          rightClass: 'bg-green-50 text-green-600'
        })
      })
    } else if (part.removed) {
      // Removed lines - show only on the left
      lines.forEach(line => {
        leftLineCount++
        result.push({
          leftLineNumber: leftLineCount,
          rightLineNumber: null,
          leftContent: line,
          rightContent: null,
          leftClass: 'bg-red-50 text-red-600',
          rightClass: ''
        })
      })
    } else {
      // Unchanged lines - show on both sides
      lines.forEach(line => {
        leftLineCount++
        rightLineCount++
        result.push({
          leftLineNumber: leftLineCount,
          rightLineNumber: rightLineCount,
          leftContent: line,
          rightContent: line,
          leftClass: '',
          rightClass: ''
        })
      })
    }
  })
  
  // Now, find pairs of removed/added lines that might be modifications of each other
  // and apply word-level diffing to them
  for (let i = 0; i < result.length - 1; i++) {
    const current = result[i]
    const next = result[i + 1]
    
    // Check if we have a removed line followed by an added line
    if (current.leftContent !== null && current.rightContent === null &&
        next.leftContent === null && next.rightContent !== null) {
      
      // Apply word-level diffing
      const wordDiff = diffLib.diffWords(current.leftContent, next.rightContent)
      
      // Process word diff for highlighting
      const leftHighlights: Array<{ start: number; end: number; isRemoved: boolean }> = []
      const rightHighlights: Array<{ start: number; end: number; isAdded: boolean }> = []
      
      let leftPos = 0
      let rightPos = 0
      
      wordDiff.forEach(part => {
        if (part.removed) {
          leftHighlights.push({
            start: leftPos,
            end: leftPos + part.value.length,
            isRemoved: true
          })
          leftPos += part.value.length
        } else if (part.added) {
          rightHighlights.push({
            start: rightPos,
            end: rightPos + part.value.length,
            isAdded: true
          })
          rightPos += part.value.length
        } else {
          leftPos += part.value.length
          rightPos += part.value.length
        }
      })
      
      // Add the highlights to the result
      current.leftHighlights = leftHighlights
      next.rightHighlights = rightHighlights
      
      // Mark these lines as a pair
      current.rightLineNumber = next.rightLineNumber
      next.leftLineNumber = current.leftLineNumber
    }
  }
  
  return result
})

// Count of changes
const changeCount = computed(() => {
  return {
    additions: processedDiff.value.filter(line => line.rightContent !== null && line.leftContent === null).length,
    deletions: processedDiff.value.filter(line => line.leftContent !== null && line.rightContent === null).length,
    modifications: processedDiff.value.filter(line => 
      (line.leftHighlights && line.leftHighlights.length > 0) || 
      (line.rightHighlights && line.rightHighlights.length > 0)
    ).length / 2 // Divide by 2 because each modification is counted twice (once for left, once for right)
  }
})

// Helper function to highlight parts of a line
const highlightLine = (line: string, highlights?: Array<{ start: number; end: number; isRemoved?: boolean; isAdded?: boolean }>) => {
  if (!highlights || highlights.length === 0 || !line) {
    return line
  }
  
  // Sort highlights by start position
  const sortedHighlights = [...highlights].sort((a, b) => a.start - b.start)
  
  // Build the highlighted line
  let result = ''
  let lastEnd = 0
  
  for (const highlight of sortedHighlights) {
    // Add the text before the highlight
    result += line.substring(lastEnd, highlight.start)
    
    // Add the highlighted text
    const highlightClass = highlight.isRemoved ? 'bg-red-200' : highlight.isAdded ? 'bg-green-200' : ''
    result += `<span class="${highlightClass}">${line.substring(highlight.start, highlight.end)}</span>`
    
    lastEnd = highlight.end
  }
  
  // Add any remaining text
  result += line.substring(lastEnd)
  
  return result
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
      <div class="flex font-mono text-sm">
        <!-- Left column (removed) -->
        <div class="w-1/2 border-r">
          <div class="flex">
            <!-- Line numbers -->
            <div class="w-10 text-right pr-2 text-gray-500 select-none border-r bg-gray-50">
              <div v-for="line in processedDiff" :key="`left-${line.leftLineNumber || 'empty'}`" class="px-2">
                {{ line.leftLineNumber || ' ' }}
              </div>
            </div>
            <!-- Content -->
            <div class="flex-1 overflow-x-auto">
              <div 
                v-for="line in processedDiff" 
                :key="`left-content-${line.leftLineNumber || 'empty'}`"
                :class="line.leftClass"
                class="px-2 whitespace-pre"
              >
                <template v-if="line.leftContent !== null">
                  <span v-if="line.leftHighlights" v-html="highlightLine(line.leftContent, line.leftHighlights)"></span>
                  <span v-else>{{ line.leftContent }}</span>
                </template>
                <span v-else>&nbsp;</span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Right column (added) -->
        <div class="w-1/2">
          <div class="flex">
            <!-- Line numbers -->
            <div class="w-10 text-right pr-2 text-gray-500 select-none border-r bg-gray-50">
              <div v-for="line in processedDiff" :key="`right-${line.rightLineNumber || 'empty'}`" class="px-2">
                {{ line.rightLineNumber || ' ' }}
              </div>
            </div>
            <!-- Content -->
            <div class="flex-1 overflow-x-auto">
              <div 
                v-for="line in processedDiff" 
                :key="`right-content-${line.rightLineNumber || 'empty'}`"
                :class="line.rightClass"
                class="px-2 whitespace-pre"
              >
                <template v-if="line.rightContent !== null">
                  <span v-if="line.rightHighlights" v-html="highlightLine(line.rightContent, line.rightHighlights)"></span>
                  <span v-else>{{ line.rightContent }}</span>
                </template>
                <span v-else>&nbsp;</span>
              </div>
            </div>
          </div>
        </div>
      </div>
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
