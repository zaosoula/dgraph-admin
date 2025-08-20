<script setup lang="ts">
import { useConnectionsStore } from '@/stores/connections'

const connectionsStore = useConnectionsStore()

useHead({
  title: 'Dgraph Admin - Dashboard',
  meta: [
    { name: 'description', content: 'Admin interface for managing Dgraph instances' }
  ]
})

// Connection stats
const connectionCount = computed(() => connectionsStore.connections.length)
const activeConnections = computed(() => {
  return connectionsStore.connections.filter(conn => {
    const state = connectionsStore.connectionStates[conn.id]
    return state?.isConnected
  }).length
})
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold mb-6">Dashboard</h1>
    
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <UiCard>
        <UiCardHeader>
          <UiCardTitle>Connections</UiCardTitle>
          <UiCardDescription>Total configured connections</UiCardDescription>
        </UiCardHeader>
        <UiCardContent>
          <p class="text-3xl font-bold">{{ connectionCount }}</p>
        </UiCardContent>
      </UiCard>
      
      <UiCard>
        <UiCardHeader>
          <UiCardTitle>Active Connections</UiCardTitle>
          <UiCardDescription>Currently active connections</UiCardDescription>
        </UiCardHeader>
        <UiCardContent>
          <p class="text-3xl font-bold">{{ activeConnections }}</p>
        </UiCardContent>
      </UiCard>
      
      <UiCard>
        <UiCardHeader>
          <UiCardTitle>Current Connection</UiCardTitle>
          <UiCardDescription>Currently selected connection</UiCardDescription>
        </UiCardHeader>
        <UiCardContent>
          <p v-if="connectionsStore.activeConnection" class="font-medium">
            {{ connectionsStore.activeConnection.name }}
          </p>
          <p v-else class="text-muted-foreground">No active connection</p>
        </UiCardContent>
      </UiCard>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <UiCard>
        <UiCardHeader>
          <UiCardTitle>Quick Actions</UiCardTitle>
        </UiCardHeader>
        <UiCardContent>
          <div class="space-y-2">
            <NuxtLink to="/connections">
              <UiButton class="w-full justify-start">
                Manage Connections
              </UiButton>
            </NuxtLink>
            
            <NuxtLink to="/schema">
              <UiButton class="w-full justify-start" :disabled="!connectionsStore.activeConnection">
                Edit Schema
              </UiButton>
            </NuxtLink>
            
            <NuxtLink to="/settings">
              <UiButton class="w-full justify-start">
                Settings
              </UiButton>
            </NuxtLink>
          </div>
        </UiCardContent>
      </UiCard>
      
      <UiCard>
        <UiCardHeader>
          <UiCardTitle>Getting Started</UiCardTitle>
        </UiCardHeader>
        <UiCardContent>
          <div class="space-y-4">
            <p>Welcome to Dgraph Admin! Here's how to get started:</p>
            
            <ol class="list-decimal list-inside space-y-2">
              <li>Add a connection to your Dgraph instance</li>
              <li>Select the connection to make it active</li>
              <li>Navigate to the Schema page to view and edit your GraphQL schema</li>
              <li>Use the diff mode to compare schema versions</li>
            </ol>
          </div>
        </UiCardContent>
      </UiCard>
    </div>
  </div>
</template>

