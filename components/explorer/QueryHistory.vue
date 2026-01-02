<script setup lang="ts">
import { computed } from 'vue'
import { 
  History, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  RotateCcw,
  X
} from 'lucide-vue-next'
import type { QueryHistoryItem } from '@/types/explorer'

type Props = {
  history: QueryHistoryItem[]
  isCollapsed?: boolean
}

type Emits = {
  'select-query': [query: string]
  'remove-item': [id: string]
  'clear-history': []
  'toggle-collapsed': []
}

const props = withDefaults(defineProps<Props>(), {
  isCollapsed: false
})

const emit = defineEmits<Emits>()

// Computed properties
const recentHistory = computed(() => props.history.slice(0, 20))
const hasHistory = computed(() => props.history.length > 0)

// Format timestamp
const formatTimestamp = (timestamp: Date): string => {
  const now = new Date()
  const diff = now.getTime() - timestamp.getTime()
  
  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

// Format execution time
const formatExecutionTime = (ms?: number): string => {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

// Truncate query for display
const truncateQuery = (query: string, maxLength = 60): string => {
  if (query.length <= maxLength) return query
  return query.substring(0, maxLength) + '...'
}

// Event handlers
const handleSelectQuery = (query: string) => {
  emit('select-query', query)
}

const handleRemoveItem = (id: string) => {
  emit('remove-item', id)
}

const handleClearHistory = () => {
  emit('clear-history')
}

const handleToggleCollapsed = () => {
  emit('toggle-collapsed')
}
</script>

<template>
  <UiCard class="hover-lift h-fit">
    <UiCardHeader class="pb-3">
      <div class="flex items-center justify-between">
        <UiCardTitle class="flex items-center space-x-2 text-base">
          <History class="h-4 w-4" />
          <span>Query History</span>
          <span v-if="hasHistory" class="ml-2 px-2 py-1 text-xs bg-muted rounded-full">
            {{ history.length }}
          </span>
        </UiCardTitle>
        
        <div class="flex items-center space-x-1">
          <UiButton
            v-if="hasHistory"
            variant="ghost"
            size="sm"
            @click="handleClearHistory"
            class="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 class="h-3 w-3" />
          </UiButton>
          
          <UiButton
            variant="ghost"
            size="sm"
            @click="handleToggleCollapsed"
            class="h-7 w-7 p-0 md:hidden"
          >
            <X v-if="!isCollapsed" class="h-3 w-3" />
            <History v-else class="h-3 w-3" />
          </UiButton>
        </div>
      </div>
    </UiCardHeader>
    
    <UiCardContent v-if="!isCollapsed" class="pt-0">
      <!-- Empty state -->
      <div v-if="!hasHistory" class="text-center py-8">
        <div class="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <History class="h-6 w-6 text-muted-foreground" />
        </div>
        <p class="text-sm text-muted-foreground">No query history yet</p>
        <p class="text-xs text-muted-foreground mt-1">
          Execute queries to see them here
        </p>
      </div>
      
      <!-- History list -->
      <div v-else class="h-[400px] overflow-y-auto pr-4">
        <div class="space-y-2">
          <div
            v-for="item in recentHistory"
            :key="item.id"
            class="group relative p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
            @click="handleSelectQuery(item.query)"
          >
            <!-- Status indicator -->
            <div class="flex items-start space-x-2">
              <div class="flex-shrink-0 mt-1">
                <CheckCircle2 
                  v-if="item.success" 
                  class="h-3 w-3 text-green-500" 
                />
                <AlertCircle 
                  v-else 
                  class="h-3 w-3 text-red-500" 
                />
              </div>
              
              <div class="flex-1 min-w-0">
                <!-- Query preview -->
                <div class="text-xs font-mono text-foreground mb-1 leading-relaxed">
                  {{ truncateQuery(item.query) }}
                </div>
                
                <!-- Metadata -->
                <div class="flex items-center space-x-3 text-xs text-muted-foreground">
                  <div class="flex items-center space-x-1">
                    <Clock class="h-3 w-3" />
                    <span>{{ formatTimestamp(item.timestamp) }}</span>
                  </div>
                  
                  <div v-if="item.executionTime" class="flex items-center space-x-1">
                    <span>{{ formatExecutionTime(item.executionTime) }}</span>
                  </div>
                </div>
              </div>
              
              <!-- Actions -->
              <div class="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <UiButton
                  variant="ghost"
                  size="sm"
                  @click.stop="handleSelectQuery(item.query)"
                  class="h-6 w-6 p-0"
                  title="Load query"
                >
                  <RotateCcw class="h-3 w-3" />
                </UiButton>
                
                <UiButton
                  variant="ghost"
                  size="sm"
                  @click.stop="handleRemoveItem(item.id)"
                  class="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  title="Remove from history"
                >
                  <X class="h-3 w-3" />
                </UiButton>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Show more indicator -->
        <div v-if="history.length > 20" class="text-center pt-4">
          <p class="text-xs text-muted-foreground">
            Showing 20 of {{ history.length }} queries
          </p>
        </div>
      </div>
    </UiCardContent>
  </UiCard>
</template>
