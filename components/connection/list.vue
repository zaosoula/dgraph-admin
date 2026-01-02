<script setup lang="ts">
import { computed } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useDgraphClient } from '@/composables/useDgraphClient'
import { useConnectionExportImport } from '@/composables/useConnectionExportImport'

const emit = defineEmits<{
  'edit': [id: string]
  'delete': [id: string]
}>()

const connectionsStore = useConnectionsStore()
const dgraphClient = useDgraphClient()
const { exportConnection } = useConnectionExportImport()

const connections = computed(() => connectionsStore.connections)
const activeConnectionId = computed(() => connectionsStore.activeConnectionId)

// Set active connection
const setActiveConnection = (id: string) => {
  connectionsStore.setActiveConnection(id)
  dgraphClient.initializeClient()
}

// Test connection
const testConnection = async (id: string) => {
  await dgraphClient.testConnection(connections.value.find(c => c.id === id))
}

// Export connection
const handleExportConnection = (id: string, event: Event) => {
  event.stopPropagation()
  exportConnection(id)
}

// Format date
const formatDate = (date: Date) => {
  return new Date(date).toLocaleString()
}
</script>

<template>
  <div>
    <div v-if="connections.length === 0" class="text-center py-8">
      <p class="text-muted-foreground">No connections added yet.</p>
    </div>
    
    <div v-else class="space-y-4">
      <UiCard 
        v-for="connection in connections" 
        :key="connection.id"
        :class="[
          'cursor-pointer transition-colors',
          activeConnectionId === connection.id ? 'border-primary' : 'hover:border-muted-foreground'
        ]"
        @click="setActiveConnection(connection.id)"
      >
        <UiCardHeader class="flex flex-row items-center justify-between pb-2">
          <div class="flex items-center space-x-2">
            <UiCardTitle>{{ connection.name }}</UiCardTitle>
            <span 
              v-if="connection.environment"
              class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
              :class="{
                'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200': connection.environment === 'Development',
                'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200': connection.environment === 'Production'
              }"
            >
              {{ connection.environment }}
            </span>
            <!-- Linked Production Indicator -->
            <span 
              v-if="connection.environment === 'Development' && connection.linkedProductionId"
              class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
              :title="`Linked to: ${connectionsStore.getLinkedProduction(connection.id)?.name || 'Unknown'}`"
            >
              <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.102m0 0l4-4a4 4 0 105.656-5.656l-1.102 1.102m-2.554 2.554l-4 4"></path>
              </svg>
              Linked
            </span>
          </div>
          <div 
            class="h-3 w-3 rounded-full" 
            :class="connectionsStore.connectionStates[connection.id]?.isConnected ? 'bg-green-500' : 'bg-red-500'"
            v-if="connectionsStore.connectionStates[connection.id]?.lastChecked"
          ></div>
        </UiCardHeader>
        
        <UiCardContent>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="text-muted-foreground">URL:</div>
            <div class="truncate">{{ connection.url }}</div>
            
            <div class="text-muted-foreground">Type:</div>
            <div>{{ connection.type.toUpperCase() }}</div>
            
            <div class="text-muted-foreground">Secure:</div>
            <div>{{ connection.isSecure ? 'Yes' : 'No' }}</div>
            
            <div class="text-muted-foreground">Last Updated:</div>
            <div>{{ formatDate(connection.updatedAt) }}</div>
          </div>
          
          <!-- Detailed Test Results -->
          <div v-if="connectionsStore.connectionStates[connection.id]?.testResults" class="mt-4 pt-4 border-t">
            <div class="text-sm font-medium mb-2">Connection Status:</div>
            <div class="grid grid-cols-3 gap-2 text-xs">
              <div class="flex items-center space-x-1">
                <div 
                  class="h-2 w-2 rounded-full" 
                  :class="connectionsStore.connectionStates[connection.id]?.testResults?.adminHealth.success ? 'bg-green-500' : 'bg-red-500'"
                ></div>
                <span class="text-muted-foreground">Admin</span>
              </div>
              <div class="flex items-center space-x-1">
                <div 
                  class="h-2 w-2 rounded-full" 
                  :class="connectionsStore.connectionStates[connection.id]?.testResults?.adminSchemaRead.success ? 'bg-green-500' : 'bg-red-500'"
                ></div>
                <span class="text-muted-foreground">Schema</span>
              </div>
              <div class="flex items-center space-x-1">
                <div 
                  class="h-2 w-2 rounded-full" 
                  :class="connectionsStore.connectionStates[connection.id]?.testResults?.clientIntrospection.success ? 'bg-green-500' : 'bg-red-500'"
                ></div>
                <span class="text-muted-foreground">Client</span>
              </div>
            </div>
          </div>
        </UiCardContent>
        
        <UiCardFooter class="flex justify-between">
          <UiButton 
            variant="outline" 
            size="sm"
            @click.stop="testConnection(connection.id)"
            :disabled="connectionsStore.connectionStates[connection.id]?.isLoading"
          >
            <span v-if="connectionsStore.connectionStates[connection.id]?.isLoading">Testing...</span>
            <span v-else>Test Connection</span>
          </UiButton>
          
          <div class="flex space-x-2">
            <UiButton 
              variant="outline" 
              size="sm"
              @click.stop="handleExportConnection(connection.id, $event)"
              title="Export Connection"
            >
              Export
            </UiButton>
            
            <UiButton 
              variant="outline" 
              size="sm"
              @click.stop="emit('edit', connection.id)"
            >
              Edit
            </UiButton>
            
            <UiButton 
              variant="destructive" 
              size="sm"
              @click.stop="emit('delete', connection.id)"
            >
              Delete
            </UiButton>
          </div>
        </UiCardFooter>
      </UiCard>
    </div>
  </div>
</template>
