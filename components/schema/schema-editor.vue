<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useDgraphClient } from '@/composables/useDgraphClient'
import { useCodeMirror } from '@/composables/useCodeMirror'
import { Codemirror } from 'vue-codemirror'
import * as diffLib from 'diff'
import Prism from 'prismjs'
import 'prismjs/components/prism-graphql'
import 'prismjs/themes/prism.css'
import SchemaMinimap from './SchemaMinimap.vue'
import type { MinimapChange } from '@/composables/useMinimap'

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
const showMinimap = ref(true)

// Initialize CodeMirror with vue-codemirror
const { extensions, value, updateContent, updateSchema, editorView } = useCodeMirror(schema.value, {
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

// Apply syntax highlighting to a line
const applySyntaxHighlighting = (code: string): string => {
  return Prism.highlight(code, Prism.languages.graphql, 'graphql')
}

// Helper function to highlight parts of a line with both syntax highlighting and diff highlighting
const highlightLine = (line: string, highlights?: Array<{ start: number; end: number; isRemoved?: boolean; isAdded?: boolean }>) => {
  if (!line) return ''
  
  // If no diff highlights, just apply syntax highlighting
  if (!highlights || highlights.length === 0) {
    return applySyntaxHighlighting(line)
  }
  
  // Sort highlights by start position
  const sortedHighlights = [...highlights].sort((a, b) => a.start - b.start)
  
  // Build the highlighted line
  let result = ''
  let lastEnd = 0
  
  for (const highlight of sortedHighlights) {
    // Add the text before the highlight with syntax highlighting
    const beforeText = line.substring(lastEnd, highlight.start)
    if (beforeText) {
      result += applySyntaxHighlighting(beforeText)
    }
    
    // Add the highlighted text with both syntax and diff highlighting
    const highlightedText = line.substring(highlight.start, highlight.end)
    const syntaxHighlighted = applySyntaxHighlighting(highlightedText)
    const highlightClass = highlight.isRemoved ? 'bg-red-200' : highlight.isAdded ? 'bg-green-200' : ''
    
    result += `<span class="${highlightClass}">${syntaxHighlighted}</span>`
    
    lastEnd = highlight.end
  }
  
  // Add any remaining text with syntax highlighting
  const remainingText = line.substring(lastEnd)
  if (remainingText) {
    result += applySyntaxHighlighting(remainingText)
  }
  
  return result
}

// Apply syntax highlighting to all lines
const syntaxHighlightedDiff = computed(() => {
  return processedDiff.value.map(line => {
    return {
      ...line,
      leftContentHighlighted: line.leftContent !== null ? 
        (line.leftHighlights ? highlightLine(line.leftContent, line.leftHighlights) : applySyntaxHighlighting(line.leftContent)) : null,
      rightContentHighlighted: line.rightContent !== null ? 
        (line.rightHighlights ? highlightLine(line.rightContent, line.rightHighlights) : applySyntaxHighlighting(line.rightContent)) : null
    }
  })
})

// Check if there are changes
const hasChanges = computed(() => {
  return originalSchema.value !== schema.value
})

// Convert diff data to minimap changes
const minimapChanges = computed((): MinimapChange[] => {
  if (!originalSchema.value || !schema.value) return []
  
  const changes: MinimapChange[] = []
  const lineDiff = diffLib.diffLines(originalSchema.value, schema.value)
  
  let lineNumber = 1
  
  lineDiff.forEach(part => {
    const lines = part.value.split('\n')
    // Remove the last empty line that results from splitting a string that ends with \n
    if (lines[lines.length - 1] === '') {
      lines.pop()
    }
    
    if (part.added) {
      // Added lines
      lines.forEach(() => {
        changes.push({
          lineNumber,
          type: 'added',
          content: lines[lineNumber - 1]
        })
        lineNumber++
      })
    } else if (part.removed) {
      // Removed lines - we'll mark them at their original position
      lines.forEach((line, index) => {
        changes.push({
          lineNumber: lineNumber + index,
          type: 'removed',
          content: line
        })
      })
      // Don't increment lineNumber for removed lines as they don't exist in the new version
    } else {
      // Unchanged lines
      lineNumber += lines.length
    }
  })
  
  return changes
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

// Toggle minimap
const toggleMinimap = () => {
  showMinimap.value = !showMinimap.value
}

// Handle minimap events
const handleMinimapLineClick = (lineNumber: number) => {
  // Line click is handled by the minimap composable
  console.log('Navigated to line:', lineNumber)
}

const handleMinimapVisibilityToggle = (visible: boolean) => {
  showMinimap.value = visible
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
        <!-- Toggle minimap button -->
        <UiButton 
          variant="outline" 
          size="sm" 
          @click="toggleMinimap"
          :disabled="isLoading"
          class="hidden lg:flex"
        >
          {{ showMinimap ? 'Hide Map' : 'Show Map' }}
        </UiButton>
        
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
      <!-- Diff view with minimap -->
      <div class="flex h-full">
        <!-- Diff content -->
        <div class="flex-1 font-mono text-sm">
          <div class="flex h-full">
            <!-- Left column (removed) -->
            <div class="w-1/2 border-r">
              <div class="flex">
                <!-- Line numbers -->
                <div class="w-10 text-right pr-2 text-gray-500 select-none border-r bg-gray-50">
                  <div v-for="line in syntaxHighlightedDiff" :key="`left-${line.leftLineNumber || 'empty'}`" class="px-2">
                    {{ line.leftLineNumber || ' ' }}
                  </div>
                </div>
                <!-- Content -->
                <div class="flex-1 overflow-x-auto">
                  <div 
                    v-for="line in syntaxHighlightedDiff" 
                    :key="`left-content-${line.leftLineNumber || 'empty'}`"
                    :class="line.leftClass"
                    class="px-2 whitespace-pre"
                  >
                    <template v-if="line.leftContent !== null">
                      <span v-html="line.leftContentHighlighted"></span>
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
                  <div v-for="line in syntaxHighlightedDiff" :key="`right-${line.rightLineNumber || 'empty'}`" class="px-2">
                    {{ line.rightLineNumber || ' ' }}
                  </div>
                </div>
                <!-- Content -->
                <div class="flex-1 overflow-x-auto">
                  <div 
                    v-for="line in syntaxHighlightedDiff" 
                    :key="`right-content-${line.rightLineNumber || 'empty'}`"
                    :class="line.rightClass"
                    class="px-2 whitespace-pre"
                  >
                    <template v-if="line.rightContent !== null">
                      <span v-html="line.rightContentHighlighted"></span>
                    </template>
                    <span v-else>&nbsp;</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Minimap for diff view -->
        <div v-if="showMinimap" class="hidden lg:block">
          <SchemaMinimap
            :key="`diff-${schema.length}`"
            :editor-view="editorView"
            :changes="minimapChanges"
            :is-diff-mode="true"
            :height="400"
            @line-click="handleMinimapLineClick"
            @toggle-visibility="handleMinimapVisibilityToggle"
          />
        </div>
      </div>
    </div>
    
    <div v-else class="flex-1 border rounded-md overflow-hidden">
      <!-- Editor view with minimap -->
      <div class="flex h-full">
        <!-- Vue CodeMirror editor with GraphQL syntax highlighting -->
        <div class="flex-1 overflow-auto">
          <Codemirror
            v-model="schema"
            :extensions="extensions"
            :indent-with-tab="true"
            :tab-size="2"
            class="w-full h-full"
            style="height: 100%; overflow: auto;"
          />
        </div>
        
        <!-- Minimap for editor view -->
        <div v-if="showMinimap" class="hidden lg:block">
          <SchemaMinimap
            :key="`editor-${schema.length}`"
            :editor-view="editorView"
            :changes="minimapChanges"
            :is-diff-mode="false"
            :height="400"
            @line-click="handleMinimapLineClick"
            @toggle-visibility="handleMinimapVisibilityToggle"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* Override Prism styles to ensure they work well with our diff highlighting */
.token {
  background: transparent !important;
}
</style>
