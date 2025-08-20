<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useQueriesStore } from '@/stores/queries'
import type { SavedQuery } from '@/types/query'

const emit = defineEmits<{
  'select': [query: SavedQuery]
  'delete': [id: string]
}>()

const connectionsStore = useConnectionsStore()
const queriesStore = useQueriesStore()

// UI state
const showSaveDialog = ref(false)
const queryName = ref('')
const queryDescription = ref('')

// Get saved queries for the active connection
const savedQueries = computed(() => {
  if (!connectionsStore.activeConnectionId) return []
  return queriesStore.queriesForCurrentConnection(connectionsStore.activeConnectionId)
})

// Format date for display
const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat('default', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date)
}

// Handle query selection
const selectQuery = (query: SavedQuery) => {
  emit('select', query)
}

// Handle query deletion
const deleteQuery = (id: string, event: Event) => {
  event.stopPropagation()
  
  if (confirm('Are you sure you want to delete this saved query?')) {
    queriesStore.deleteSavedQuery(id)
    emit('delete', id)
  }
}

// Open save dialog
const openSaveDialog = () => {
  queryName.value = ''
  queryDescription.value = ''
  showSaveDialog.value = true
}

// Save current query
const saveCurrentQuery = () => {
  if (!queryName.value.trim()) {
    alert('Please enter a name for the query')
    return
  }
  
  if (!connectionsStore.activeConnectionId) {
    alert('No active connection selected')
    return
  }
  
  queriesStore.saveQuery(
    queryName.value.trim(),
    queryDescription.value.trim(),
    connectionsStore.activeConnectionId
  )
  
  showSaveDialog.value = false
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-medium">Saved Queries</h3>
      
      <UiButton 
        size="sm" 
        @click="openSaveDialog" 
        :disabled="!connectionsStore.activeConnectionId"
      >
        Save Current Query
      </UiButton>
    </div>
    
    <div v-if="savedQueries.length === 0" class="text-center py-8 text-muted-foreground">
      No saved queries yet
    </div>
    
    <div v-else class="space-y-2 overflow-y-auto">
      <div 
        v-for="query in savedQueries" 
        :key="query.id"
        class="p-3 border rounded-md hover:bg-muted cursor-pointer transition-colors"
        @click="selectQuery(query)"
      >
        <div class="flex justify-between items-start">
          <div class="font-medium">{{ query.name }}</div>
          <button 
            class="text-muted-foreground hover:text-red-500 transition-colors"
            @click="(e) => deleteQuery(query.id, e)"
          >
            <span class="sr-only">Delete</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"></path>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
            </svg>
          </button>
        </div>
        
        <div v-if="query.description" class="mt-1 text-sm text-muted-foreground">
          {{ query.description }}
        </div>
        
        <div class="mt-2 text-xs text-muted-foreground">
          Saved on {{ formatDate(query.updatedAt) }}
        </div>
      </div>
    </div>
    
    <!-- Save Dialog -->
    <div v-if="showSaveDialog" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <UiCard class="w-full max-w-md mx-4">
        <UiCardHeader>
          <UiCardTitle>Save Query</UiCardTitle>
        </UiCardHeader>
        <UiCardContent>
          <div class="space-y-4">
            <div class="space-y-2">
              <label for="query-name" class="text-sm font-medium">Name</label>
              <UiInput 
                id="query-name" 
                v-model="queryName" 
                placeholder="Enter a name for this query"
              />
            </div>
            
            <div class="space-y-2">
              <label for="query-description" class="text-sm font-medium">Description (optional)</label>
              <UiInput 
                id="query-description" 
                v-model="queryDescription" 
                placeholder="Enter a description"
              />
            </div>
          </div>
        </UiCardContent>
        <UiCardFooter class="flex justify-end space-x-2">
          <UiButton variant="outline" @click="showSaveDialog = false">
            Cancel
          </UiButton>
          <UiButton @click="saveCurrentQuery">
            Save Query
          </UiButton>
        </UiCardFooter>
      </UiCard>
    </div>
  </div>
</template>
