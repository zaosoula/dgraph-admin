<script setup lang="ts">
import { computed } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useQueriesStore } from '@/stores/queries'
import type { QueryHistoryEntry } from '@/types/query'

const props = defineProps<{
  limit?: number
}>()

const emit = defineEmits<{
  'select': [entry: QueryHistoryEntry]
  'clear': []
}>()

const connectionsStore = useConnectionsStore()
const queriesStore = useQueriesStore()

// Get history entries for the active connection
const historyEntries = computed(() => {
  if (!connectionsStore.activeConnectionId) return []
  
  const entries = queriesStore.historyForCurrentConnection(connectionsStore.activeConnectionId)
  
  // Apply limit if specified
  if (props.limit && entries.length > props.limit) {
    return entries.slice(0, props.limit)
  }
  
  return entries
})

// Format date for display
const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat('default', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date)
}

// Format query for display (truncate if too long)
const formatQuery = (query: string) => {
  const maxLength = 50
  const trimmed = query.replace(/\s+/g, ' ').trim()
  
  if (trimmed.length <= maxLength) {
    return trimmed
  }
  
  return trimmed.substring(0, maxLength) + '...'
}

// Handle entry selection
const selectEntry = (entry: QueryHistoryEntry) => {
  emit('select', entry)
}

// Clear history
const clearHistory = () => {
  if (confirm('Are you sure you want to clear all query history?')) {
    queriesStore.clearHistory()
    emit('clear')
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-medium">Query History</h3>
      
      <UiButton 
        size="sm" 
        variant="outline"
        @click="clearHistory" 
        :disabled="historyEntries.length === 0"
      >
        Clear History
      </UiButton>
    </div>
    
    <div v-if="historyEntries.length === 0" class="text-center py-8 text-muted-foreground">
      No query history yet
    </div>
    
    <div v-else class="space-y-2 overflow-y-auto">
      <div 
        v-for="entry in historyEntries" 
        :key="entry.id"
        class="p-3 border rounded-md hover:bg-muted cursor-pointer transition-colors"
        :class="{
          'border-red-200 bg-red-50 hover:bg-red-100': entry.status === 'error',
          'border-green-200 bg-green-50 hover:bg-green-100': entry.status === 'success'
        }"
        @click="selectEntry(entry)"
      >
        <div class="flex justify-between items-start">
          <div class="font-mono text-sm truncate">{{ formatQuery(entry.query) }}</div>
          <div class="text-xs text-muted-foreground ml-2">
            {{ entry.duration ? `${entry.duration.toFixed(1)}ms` : '' }}
          </div>
        </div>
        
        <div class="flex justify-between items-center mt-2 text-xs">
          <div class="text-muted-foreground">
            {{ formatDate(entry.timestamp) }}
          </div>
          
          <div v-if="entry.status === 'error'" class="text-red-500">
            Error
          </div>
          <div v-else-if="entry.status === 'success'" class="text-green-500">
            Success
          </div>
          <div v-else class="text-amber-500">
            Pending
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
