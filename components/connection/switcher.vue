<script setup lang="ts">
import { computed } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useDgraphClient } from '@/composables/useDgraphClient'

const connectionsStore = useConnectionsStore()
const dgraphClient = useDgraphClient()

const connections = computed(() => connectionsStore.connections)
const activeConnection = computed(() => connectionsStore.activeConnection)
const activeConnectionState = computed(() => connectionsStore.activeConnectionState)

// Computed for v-model binding
const selectedConnectionId = computed({
  get: () => connectionsStore.activeConnectionId,
  set: (id: string | null) => {
    if (id) {
      connectionsStore.setActiveConnection(id)
      dgraphClient.initializeClient()
    }
  }
})

// Switch connection (legacy method for backward compatibility)
const switchConnection = (id: string) => {
  connectionsStore.setActiveConnection(id)
  dgraphClient.initializeClient()
}
</script>

<template>
  <div class="relative">
    <!-- Custom dropdown slot (if provided) -->
    <div v-if="$slots.dropdown">
      <button 
        class="flex items-center space-x-2 rounded-md border px-3 py-2 text-sm w-full"
        :class="activeConnection ? 'border-input' : 'border-dashed border-muted-foreground'"
        @click="$emit('open-selector')"
      >
        <div v-if="activeConnection" class="flex flex-1 items-center justify-between">
          <div class="flex items-center space-x-2">
            <div 
              class="h-2 w-2 rounded-full" 
              :class="activeConnectionState?.isConnected ? 'bg-green-500' : 'bg-red-500'"
              v-if="activeConnectionState?.lastChecked"
            ></div>
            <span>{{ activeConnection.name }}</span>
            <span 
              v-if="activeConnection.environment"
              class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium"
              :class="{
                'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200': activeConnection.environment === 'Development',
                'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200': activeConnection.environment === 'Production'
              }"
            >
              {{ activeConnection.environment }}
            </span>
          </div>
          <span class="text-xs text-muted-foreground">{{ activeConnection.url }}</span>
        </div>
        <div v-else class="text-muted-foreground">
          Select a connection
        </div>
      </button>
      
      <div v-if="connections.length > 0" class="absolute top-full left-0 right-0 mt-1 z-10">
        <div class="bg-popover border rounded-md shadow-md overflow-hidden">
          <slot name="dropdown" />
        </div>
      </div>
    </div>

    <!-- Default Select implementation -->
    <UiSelect v-else v-model="selectedConnectionId" :disabled="connections.length === 0">
      <UiSelectTrigger 
        :class="activeConnection ? 'border-input' : 'border-dashed border-muted-foreground'"
      >
        <UiSelectValue>
          <div v-if="activeConnection" class="flex flex-1 items-center justify-between">
            <div class="flex items-center space-x-2">
              <div 
                class="h-2 w-2 rounded-full" 
                :class="activeConnectionState?.isConnected ? 'bg-green-500' : 'bg-red-500'"
                v-if="activeConnectionState?.lastChecked"
              ></div>
              <span>{{ activeConnection.name }}</span>
              <span 
                v-if="activeConnection.environment"
                class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium"
                :class="{
                  'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200': activeConnection.environment === 'Development',
                  'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200': activeConnection.environment === 'Production'
                }"
              >
                {{ activeConnection.environment }}
              </span>
            </div>
            <span class="text-xs text-muted-foreground ml-2">{{ activeConnection.url }}</span>
          </div>
          <span v-else class="text-muted-foreground">Select a connection</span>
        </UiSelectValue>
      </UiSelectTrigger>
      
      <UiSelectContent>
        <UiSelectItem 
          v-for="connection in connections" 
          :key="connection.id" 
          :value="connection.id"
        >
          <div class="flex items-center justify-between w-full">
            <div class="flex items-center space-x-2">
              <div 
                class="h-2 w-2 rounded-full" 
                :class="connectionsStore.connectionStates[connection.id]?.isConnected ? 'bg-green-500' : 'bg-red-500'"
                v-if="connectionsStore.connectionStates[connection.id]?.lastChecked"
              ></div>
              <span>{{ connection.name }}</span>
              <span 
                v-if="connection.environment"
                class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium"
                :class="{
                  'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200': connection.environment === 'Development',
                  'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200': connection.environment === 'Production'
                }"
              >
                {{ connection.environment }}
              </span>
            </div>
            <span class="text-xs text-muted-foreground ml-2">{{ connection.url }}</span>
          </div>
        </UiSelectItem>
      </UiSelectContent>
    </UiSelect>
  </div>
</template>
