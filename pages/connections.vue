<script setup lang="ts">
import { ref } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useCredentialStorage } from '@/composables/useCredentialStorage'
import type { Connection } from '@/types/connection'

useHead({
  title: 'Dgraph Admin - Connections',
  meta: [
    { name: 'description', content: 'Manage your Dgraph connections' }
  ]
})

const connectionsStore = useConnectionsStore()
const credentialStorage = useCredentialStorage()

// UI state
const isAddingConnection = ref(false)
const isEditingConnection = ref(false)
const editingConnectionId = ref<string | null>(null)
const showDeleteConfirm = ref(false)
const deletingConnectionId = ref<string | null>(null)

// Get connection for editing
const editingConnection = computed(() => {
  if (!editingConnectionId.value) return null
  return connectionsStore.connections.find(conn => conn.id === editingConnectionId.value) || null
})

// Add new connection
const addConnection = () => {
  isAddingConnection.value = true
  isEditingConnection.value = false
  editingConnectionId.value = null
}

// Edit connection
const editConnection = (id: string) => {
  editingConnectionId.value = id
  isEditingConnection.value = true
  isAddingConnection.value = false
}

// Delete connection
const confirmDelete = (id: string) => {
  deletingConnectionId.value = id
  showDeleteConfirm.value = true
}

const deleteConnection = () => {
  if (!deletingConnectionId.value) return
  
  // Delete credentials first
  credentialStorage.deleteCredentials(deletingConnectionId.value)
  
  // Then delete the connection
  connectionsStore.removeConnection(deletingConnectionId.value)
  
  // Reset UI state
  showDeleteConfirm.value = false
  deletingConnectionId.value = null
}

// Handle form actions
const handleConnectionSaved = (connectionId: string) => {
  isAddingConnection.value = false
  isEditingConnection.value = false
  editingConnectionId.value = null
}

const handleFormCancelled = () => {
  isAddingConnection.value = false
  isEditingConnection.value = false
  editingConnectionId.value = null
}
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold">Connections</h1>
      
      <UiButton @click="addConnection" v-if="!isAddingConnection && !isEditingConnection">
        Add Connection
      </UiButton>
    </div>
    
    <div v-if="isAddingConnection">
      <UiCard>
        <UiCardHeader>
          <UiCardTitle>Add New Connection</UiCardTitle>
        </UiCardHeader>
        <UiCardContent>
          <ConnectionConnectionForm 
            @saved="handleConnectionSaved" 
            @cancelled="handleFormCancelled" 
          />
        </UiCardContent>
      </UiCard>
    </div>
    
    <div v-else-if="isEditingConnection && editingConnection">
      <UiCard>
        <UiCardHeader>
          <UiCardTitle>Edit Connection</UiCardTitle>
        </UiCardHeader>
        <UiCardContent>
          <ConnectionConnectionForm 
            :connection="editingConnection" 
            @saved="handleConnectionSaved" 
            @cancelled="handleFormCancelled" 
          />
        </UiCardContent>
      </UiCard>
    </div>
    
    <div v-else>
      <ConnectionConnectionList 
        @edit="editConnection" 
        @delete="confirmDelete" 
      />
    </div>
    
    <!-- Delete Confirmation Dialog -->
    <div v-if="showDeleteConfirm" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <UiCard class="w-full max-w-md mx-4">
        <UiCardHeader>
          <UiCardTitle>Confirm Deletion</UiCardTitle>
        </UiCardHeader>
        <UiCardContent>
          <p>Are you sure you want to delete this connection? This action cannot be undone.</p>
        </UiCardContent>
        <UiCardFooter class="flex justify-end space-x-2">
          <UiButton variant="outline" @click="showDeleteConfirm = false">
            Cancel
          </UiButton>
          <UiButton variant="destructive" @click="deleteConnection">
            Delete
          </UiButton>
        </UiCardFooter>
      </UiCard>
    </div>
  </div>
</template>

