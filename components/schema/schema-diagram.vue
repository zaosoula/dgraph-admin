<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { Voyager } from 'graphql-voyager'
import { buildClientSchema, getIntrospectionQuery, IntrospectionQuery } from 'graphql'
import { useDgraphClient } from '@/composables/useDgraphClient'
import { useConnectionsStore } from '@/stores/connections'

// Import the CSS for GraphQL Voyager
import 'graphql-voyager/dist/voyager.css'

const props = defineProps<{
  schema?: string
}>()

const connectionsStore = useConnectionsStore()
const dgraphClient = useDgraphClient()

const isLoading = ref(false)
const error = ref<string | null>(null)
const introspectionData = ref<IntrospectionQuery | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

// Load introspection data from the GraphQL endpoint
const loadIntrospectionData = async () => {
  if (!connectionsStore.activeConnection) {
    error.value = 'No active connection'
    return
  }
  
  isLoading.value = true
  error.value = null
  
  try {
    // Execute the introspection query
    const result = await dgraphClient.executeQuery(getIntrospectionQuery())
    
    if (result.error) {
      error.value = result.error.message
      return
    }
    
    if (result.data) {
      introspectionData.value = result.data as IntrospectionQuery
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    isLoading.value = false
  }
}

// Initialize the Voyager component
const initVoyager = () => {
  if (!containerRef.value || !introspectionData.value) return
  
  // Clear the container first
  containerRef.value.innerHTML = ''
  
  // Create a new Voyager instance
  new Voyager({
    elem: containerRef.value,
    introspection: introspectionData.value,
    displayOptions: {
      skipRelay: true,
      skipDeprecated: false,
      sortByAlphabet: true,
      showLeafFields: true,
      hideRoot: false
    },
    hideDocs: false,
    hideSettings: false
  })
}

// Watch for active connection changes
watch(() => connectionsStore.activeConnectionId, (newId) => {
  if (newId) {
    loadIntrospectionData()
  }
})

// Watch for introspection data changes
watch(introspectionData, () => {
  nextTick(() => {
    initVoyager()
  })
})

// Initialize
onMounted(() => {
  if (connectionsStore.activeConnectionId) {
    loadIntrospectionData()
  }
})
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex justify-between items-center mb-2">
      <h3 class="text-lg font-medium">GraphQL Schema Diagram</h3>
      
      <div class="flex space-x-2">
        <UiButton 
          variant="outline" 
          size="sm" 
          @click="loadIntrospectionData" 
          :disabled="isLoading || !connectionsStore.activeConnection"
        >
          Reload
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
      <div ref="containerRef" class="w-full h-full" style="min-height: 600px;"></div>
    </div>
  </div>
</template>

<style>
/* Override some of the Voyager styles to better match our app */
:deep(.voyager-wrapper) {
  height: 100%;
  width: 100%;
}

:deep(.doc-explorer-title) {
  font-weight: 600;
}

:deep(.type-link) {
  color: var(--primary);
}

:deep(.doc-category-item) {
  padding: 4px 8px;
}
</style>

