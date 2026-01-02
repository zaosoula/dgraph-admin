<script setup lang="ts">
import { onMounted } from 'vue'
import { 
  Database, 
  RefreshCw, 
  Search, 
  Hash,
  ChevronRight,
  AlertCircle
} from 'lucide-vue-next'
import { useTypeBrowser } from '@/composables/useTypeBrowser'

type Emits = {
  'select-type': [typeName: string, query: string]
}

const emit = defineEmits<Emits>()

// Use the type browser composable
const {
  types,
  isLoading,
  error,
  hasTypes,
  loadSchemaTypes,
  generateTypeQuery,
  refresh
} = useTypeBrowser()

// Load types on mount
onMounted(() => {
  loadSchemaTypes()
})

// Handle type selection
const handleSelectType = (typeName: string) => {
  const query = generateTypeQuery(typeName, 20)
  emit('select-type', typeName, query)
}

// Handle refresh
const handleRefresh = async () => {
  await refresh()
}

// Format count display
const formatCount = (count?: number): string => {
  if (count === undefined) return '...'
  if (count === 0) return '0'
  if (count < 1000) return count.toString()
  if (count < 1000000) return `${(count / 1000).toFixed(1)}k`
  return `${(count / 1000000).toFixed(1)}M`
}
</script>

<template>
  <UiCard class="hover-lift">
    <UiCardHeader class="pb-3">
      <div class="flex items-center justify-between">
        <UiCardTitle class="flex items-center space-x-2 text-base">
          <Database class="h-4 w-4" />
          <span>Schema Types</span>
        </UiCardTitle>
        
        <UiButton
          variant="ghost"
          size="sm"
          @click="handleRefresh"
          :disabled="isLoading"
          class="h-7 w-7 p-0"
        >
          <RefreshCw :class="['h-3 w-3', { 'animate-spin': isLoading }]" />
        </UiButton>
      </div>
      
      <UiCardDescription>
        Explore data by type. Click a type to see sample records.
      </UiCardDescription>
    </UiCardHeader>
    
    <UiCardContent class="pt-0">
      <!-- Loading state -->
      <div v-if="isLoading && !hasTypes" class="flex items-center justify-center py-8">
        <div class="flex items-center space-x-3">
          <div class="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span class="text-muted-foreground">Loading schema types...</span>
        </div>
      </div>
      
      <!-- Error state -->
      <div v-else-if="error" class="py-6">
        <div class="flex items-start space-x-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <AlertCircle class="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <h4 class="font-medium text-destructive text-sm mb-1">Error Loading Types</h4>
            <p class="text-xs text-destructive/80">{{ error }}</p>
          </div>
        </div>
      </div>
      
      <!-- Empty state -->
      <div v-else-if="!hasTypes" class="text-center py-8">
        <div class="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <Database class="h-6 w-6 text-muted-foreground" />
        </div>
        <p class="text-sm text-muted-foreground">No types found</p>
        <p class="text-xs text-muted-foreground mt-1">
          Make sure your schema defines types
        </p>
      </div>
      
      <!-- Types list -->
      <div v-else class="space-y-1">
        <div
          v-for="type in types"
          :key="type.name"
          class="group flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
          @click="handleSelectType(type.name)"
        >
          <div class="flex items-center space-x-3 flex-1 min-w-0">
            <!-- Type icon -->
            <div class="flex-shrink-0">
              <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Database class="h-4 w-4 text-primary" />
              </div>
            </div>
            
            <!-- Type info -->
            <div class="flex-1 min-w-0">
              <div class="font-medium text-sm text-foreground">
                {{ type.name }}
              </div>
              <div class="flex items-center space-x-2 text-xs text-muted-foreground">
                <Hash class="h-3 w-3" />
                <span v-if="type.isLoading">Loading...</span>
                <span v-else>{{ formatCount(type.count) }} records</span>
              </div>
            </div>
          </div>
          
          <!-- Action indicator -->
          <div class="flex items-center space-x-2">
            <div class="opacity-0 group-hover:opacity-100 transition-opacity">
              <UiButton
                variant="ghost"
                size="sm"
                class="h-6 w-6 p-0"
                @click.stop="handleSelectType(type.name)"
              >
                <Search class="h-3 w-3" />
              </UiButton>
            </div>
            <ChevronRight class="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </div>
      
      <!-- Footer info -->
      <div v-if="hasTypes" class="mt-4 pt-3 border-t">
        <p class="text-xs text-muted-foreground text-center">
          {{ types.length }} type{{ types.length !== 1 ? 's' : '' }} found
        </p>
      </div>
    </UiCardContent>
  </UiCard>
</template>
