<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useQueriesStore } from '@/stores/queries'
import { useDgraphClient } from '@/composables/useDgraphClient'
import { useSchemaIntrospection } from '@/composables/useSchemaIntrospection'
import type { QueryVariables, QueryResult, SavedQuery, QueryHistoryEntry } from '@/types/query'
import type { IntrospectionField } from '@/utils/schema-introspection'

useHead({
  title: 'Dgraph Admin - Query Explorer',
  meta: [
    { name: 'description', content: 'Execute GraphQL queries against your Dgraph database' }
  ]
})

const connectionsStore = useConnectionsStore()
const queriesStore = useQueriesStore()
const dgraphClient = useDgraphClient()
const schemaIntrospection = useSchemaIntrospection()

// UI state
const activeTab = ref<'editor' | 'history' | 'saved' | 'schema'>('editor')
const showSchemaPanel = ref(false)
const variablesError = ref<string | null>(null)
const executionStartTime = ref<number | null>(null)

// Check if we have an active connection
const hasActiveConnection = computed(() => !!connectionsStore.activeConnection)

// Execute the current query
const executeQuery = async () => {
  if (!connectionsStore.activeConnectionId) {
    alert('No active connection selected')
    return
  }
  
  if (variablesError.value) {
    alert('Please fix the variables error before executing the query')
    return
  }
  
  // Set execution status
  queriesStore.setExecutionStatus(true)
  executionStartTime.value = Date.now()
  
  try {
    // Execute the query
    const result = await dgraphClient.executeQuery(
      queriesStore.currentQuery,
      queriesStore.currentVariables
    )
    
    // Calculate duration
    const duration = executionStartTime.value ? Date.now() - executionStartTime.value : null
    
    // Set the result
    const queryResult: QueryResult = {
      ...result,
      duration: duration || undefined
    }
    
    queriesStore.setCurrentResult(queryResult)
    
    // Add to history
    queriesStore.addHistoryEntry({
      query: queriesStore.currentQuery,
      variables: queriesStore.currentVariables,
      result: queryResult,
      connectionId: connectionsStore.activeConnectionId,
      duration: duration || undefined,
      status: result.error ? 'error' : 'success'
    })
  } catch (error) {
    // Handle execution error
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    // Calculate duration
    const duration = executionStartTime.value ? Date.now() - executionStartTime.value : null
    
    // Set error result
    queriesStore.setCurrentResult({
      errors: [{ message: errorMessage }],
      duration: duration || undefined
    })
    
    // Add to history
    queriesStore.addHistoryEntry({
      query: queriesStore.currentQuery,
      variables: queriesStore.currentVariables,
      result: {
        errors: [{ message: errorMessage }],
        duration: duration || undefined
      },
      connectionId: connectionsStore.activeConnectionId,
      duration: duration || undefined,
      status: 'error'
    })
  } finally {
    // Reset execution status
    queriesStore.setExecutionStatus(false)
    executionStartTime.value = null
  }
}

// Handle variables error
const handleVariablesError = (error: string) => {
  variablesError.value = error
}

// Load a saved query
const loadSavedQuery = (query: SavedQuery) => {
  queriesStore.loadSavedQuery(query.id)
  activeTab.value = 'editor'
}

// Load a history entry
const loadHistoryEntry = (entry: QueryHistoryEntry) => {
  queriesStore.loadHistoryEntry(entry.id)
  activeTab.value = 'editor'
}

// Insert a sample query from schema
const insertSampleQuery = (field: IntrospectionField) => {
  const sampleQuery = schemaIntrospection.generateSampleQuery(field)
  
  // Wrap in query operation
  const query = `query {
  ${sampleQuery}
}`
  
  queriesStore.setCurrentQuery(query)
  activeTab.value = 'editor'
}

// Load schema using introspection
const loadSchema = async () => {
  if (!schemaIntrospection.isSchemaLoaded.value) {
    await schemaIntrospection.fetchSchema()
  }
  
  showSchemaPanel.value = true
}

// Watch for active connection changes
watch(() => connectionsStore.activeConnectionId, (newId) => {
  if (newId) {
    // Initialize client
    dgraphClient.initializeClient()
    
    // Reset schema introspection
    schemaIntrospection.initialize()
  }
})

// Initialize
onMounted(() => {
  if (connectionsStore.activeConnectionId) {
    dgraphClient.initializeClient()
    schemaIntrospection.initialize()
  }
})
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold">Query Explorer</h1>
      
      <div class="flex space-x-2">
        <UiButton 
          variant="outline" 
          :class="activeTab === 'editor' ? 'bg-muted' : ''"
          @click="activeTab = 'editor'"
        >
          Editor
        </UiButton>
        
        <UiButton 
          variant="outline" 
          :class="activeTab === 'history' ? 'bg-muted' : ''"
          @click="activeTab = 'history'"
        >
          History
        </UiButton>
        
        <UiButton 
          variant="outline" 
          :class="activeTab === 'saved' ? 'bg-muted' : ''"
          @click="activeTab = 'saved'"
        >
          Saved Queries
        </UiButton>
        
        <UiButton 
          variant="outline" 
          @click="loadSchema"
          :disabled="!hasActiveConnection"
        >
          Schema
        </UiButton>
      </div>
    </div>
    
    <div v-if="!hasActiveConnection" class="text-center py-12">
      <p class="text-xl text-muted-foreground mb-4">No active connection selected</p>
      <NuxtLink to="/connections">
        <UiButton>Manage Connections</UiButton>
      </NuxtLink>
    </div>
    
    <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <!-- Main Editor Area -->
      <div v-if="activeTab === 'editor'" class="md:col-span-2">
        <div class="grid grid-cols-1 gap-6">
          <!-- Query Editor -->
          <div class="h-[400px]">
            <QueryEditor 
              v-model="queriesStore.currentQuery"
              :readOnly="queriesStore.isExecuting"
              @execute="executeQuery"
            />
          </div>
          
          <!-- Variables Editor -->
          <div class="h-[200px]">
            <VariablesEditor 
              v-model="queriesStore.currentVariables"
              :readOnly="queriesStore.isExecuting"
              @error="handleVariablesError"
            />
          </div>
        </div>
      </div>
      
      <!-- History Tab -->
      <div v-else-if="activeTab === 'history'" class="md:col-span-2">
        <QueryHistoryList @select="loadHistoryEntry" />
      </div>
      
      <!-- Saved Queries Tab -->
      <div v-else-if="activeTab === 'saved'" class="md:col-span-2">
        <QuerySavedQueries @select="loadSavedQuery" />
      </div>
      
      <!-- Results Panel (always visible) -->
      <div class="h-[600px]">
        <ResultsViewer 
          :result="queriesStore.currentResult"
          :isLoading="queriesStore.isExecuting"
        />
      </div>
    </div>
    
    <!-- Schema Panel (overlay) -->
    <div v-if="showSchemaPanel" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <UiCard class="w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <UiCardHeader class="flex-shrink-0">
          <UiCardTitle>GraphQL Schema</UiCardTitle>
          <UiCardDescription>
            Browse the schema and insert sample queries
          </UiCardDescription>
        </UiCardHeader>
        
        <UiCardContent class="flex-1 overflow-y-auto">
          <div v-if="schemaIntrospection.isLoading" class="flex items-center justify-center p-8">
            <div class="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
          </div>
          
          <div v-else-if="schemaIntrospection.error" class="p-4 bg-red-50 text-red-700 rounded">
            {{ schemaIntrospection.error }}
          </div>
          
          <div v-else-if="!schemaIntrospection.isSchemaLoaded" class="text-center py-8">
            <p class="text-muted-foreground mb-4">Schema not loaded yet</p>
            <UiButton @click="schemaIntrospection.fetchSchema">
              Load Schema
            </UiButton>
          </div>
          
          <div v-else>
            <div class="mb-6">
              <h3 class="text-lg font-medium mb-2">Queries</h3>
              <div class="space-y-2">
                <div 
                  v-for="field in schemaIntrospection.queryFields" 
                  :key="field.name"
                  class="p-3 border rounded-md hover:bg-muted cursor-pointer transition-colors"
                  @click="insertSampleQuery(field)"
                >
                  <div class="font-medium">{{ field.name }}</div>
                  <div v-if="field.description" class="text-sm text-muted-foreground mt-1">
                    {{ field.description }}
                  </div>
                </div>
              </div>
            </div>
            
            <div class="mb-6">
              <h3 class="text-lg font-medium mb-2">Mutations</h3>
              <div v-if="schemaIntrospection.mutationFields.length === 0" class="text-muted-foreground">
                No mutations available
              </div>
              <div v-else class="space-y-2">
                <div 
                  v-for="field in schemaIntrospection.mutationFields" 
                  :key="field.name"
                  class="p-3 border rounded-md hover:bg-muted cursor-pointer transition-colors"
                  @click="insertSampleQuery(field)"
                >
                  <div class="font-medium">{{ field.name }}</div>
                  <div v-if="field.description" class="text-sm text-muted-foreground mt-1">
                    {{ field.description }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </UiCardContent>
        
        <UiCardFooter class="flex-shrink-0">
          <UiButton variant="outline" @click="showSchemaPanel = false">
            Close
          </UiButton>
        </UiCardFooter>
      </UiCard>
    </div>
  </div>
</template>
