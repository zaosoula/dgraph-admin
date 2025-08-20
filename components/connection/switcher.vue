<script setup lang="ts">
import { computed } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useDgraphClient } from '@/composables/useDgraphClient'

const connectionsStore = useConnectionsStore()
const dgraphClient = useDgraphClient()

const connections = computed(() => connectionsStore.connections)
const activeConnection = computed(() => connectionsStore.activeConnection)
const activeConnectionState = computed(() => connectionsStore.activeConnectionState)

// Switch connection
const switchConnection = (id: string) => {
  connectionsStore.setActiveConnection(id)
  dgraphClient.initializeClient()
}
</script>

<template>
  <div class="relative">
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
        </div>
        <span class="text-xs text-muted-foreground">{{ activeConnection.url }}</span>
      </div>
      <div v-else class="text-muted-foreground">
        Select a connection
      </div>
    </button>
    
    <div v-if="connections.length > 0" class="absolute top-full left-0 right-0 mt-1 z-10">
      <div 
        v-if="$slots.dropdown" 
        class="bg-popover border rounded-md shadow-md overflow-hidden"
      >
        <slot name="dropdown" />
      </div>
    </div>
  </div>
</template>

