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
          <UiCardTitle>{{ connection.name }}</UiCardTitle>
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
