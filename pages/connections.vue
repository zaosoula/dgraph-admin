<script setup lang="ts">
import { ref } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useCredentialStorage } from '@/composables/useCredentialStorage'
import { useConnectionExportImport } from '@/composables/useConnectionExportImport'
import type { Connection } from '@/types/connection'
import type { ConnectionImportResult } from '@/composables/useConnectionExportImport'

useHead({
  title: 'Dgraph Admin - Connections',
  meta: [
    { name: 'description', content: 'Manage your Dgraph connections' }
  ]
})

const connectionsStore = useConnectionsStore()
const credentialStorage = useCredentialStorage()
const { exportConnection, exportAllConnections } = useConnectionExportImport()

// UI state
const isAddingConnection = ref(false)
const isEditingConnection = ref(false)
const isImportingConnections = ref(false)
const editingConnectionId = ref<string | null>(null)
const showDeleteConfirm = ref(false)
const deletingConnectionId = ref<string | null>(null)
const showExportMenu = ref(false)
const importResult = ref<ConnectionImportResult | null>(null)

// Get connection for editing
const editingConnection = computed(() => {
  if (!editingConnectionId.value) return null
  return connectionsStore.connections.find(conn => conn.id === editingConnectionId.value) || null
})

// Add new connection
const addConnection = () => {
  isAddingConnection.value = true
  isEditingConnection.value = false
  isImportingConnections.value = false
  editingConnectionId.value = null
  importResult.value = null
}

// Import connections
const importConnections = () => {
  isImportingConnections.value = true
  isAddingConnection.value = false
  isEditingConnection.value = false
  editingConnectionId.value = null
  importResult.value = null
}

// Edit connection
const editConnection = (id: string) => {
  editingConnectionId.value = id
  isEditingConnection.value = true
  isAddingConnection.value = false
  isImportingConnections.value = false
  importResult.value = null
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

// Export connections
const handleExportConnection = (id: string) => {
  exportConnection(id)
  showExportMenu.value = false
}

const handleExportAllConnections = () => {
  exportAllConnections()
  showExportMenu.value = false
}

// Handle form actions
const handleConnectionSaved = (connectionId: string) => {
  isAddingConnection.value = false
  isEditingConnection.value = false
  isImportingConnections.value = false
  editingConnectionId.value = null
}

const handleFormCancelled = () => {
  isAddingConnection.value = false
  isEditingConnection.value = false
  isImportingConnections.value = false
  editingConnectionId.value = null
}

// Handle import result
const handleImportResult = (result: ConnectionImportResult) => {
  importResult.value = result
  isImportingConnections.value = false
}
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold">Connections</h1>
      
      <div class="flex space-x-2" v-if="!isAddingConnection && !isEditingConnection && !isImportingConnections">
        <!-- Export Menu -->
        <div class="relative">
          <UiButton 
            variant="outline" 
            @click="showExportMenu = !showExportMenu"
            :disabled="connectionsStore.connections.length === 0"
          >
            Export
          </UiButton>
          
          <div 
            v-if="showExportMenu" 
            class="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-background border z-10"
          >
            <div class="py-1">
              <button 
                class="w-full text-left px-4 py-2 text-sm hover:bg-muted"
                @click="handleExportAllConnections"
              >
                Export All Connections
              </button>
              
              <div v-if="connectionsStore.connections.length > 0" class="border-t my-1"></div>
              
              <button 
                v-for="connection in connectionsStore.connections" 
                :key="connection.id"
                class="w-full text-left px-4 py-2 text-sm hover:bg-muted truncate"
                @click="handleExportConnection(connection.id)"
              >
                Export "{{ connection.name }}"
              </button>
            </div>
          </div>
        </div>
        
        <UiButton variant="outline" @click="importConnections">
          Import
        </UiButton>
        
        <UiButton @click="addConnection">
          Add Connection
        </UiButton>
      </div>
    </div>
    
    <div v-if="isAddingConnection">
      <UiCard>
        <UiCardHeader>
          <UiCardTitle>Add New Connection</UiCardTitle>
        </UiCardHeader>
        <UiCardContent>
          <ConnectionForm 
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
          <ConnectionForm 
            :connection="editingConnection" 
            @saved="handleConnectionSaved" 
            @cancelled="handleFormCancelled" 
          />
        </UiCardContent>
      </UiCard>
    </div>
    
    <div v-else-if="isImportingConnections">
      <UiCard>
        <UiCardHeader>
          <UiCardTitle>Import Connections</UiCardTitle>
        </UiCardHeader>
        <UiCardContent>
          <ConnectionImport 
            @imported="handleImportResult" 
            @cancelled="handleFormCancelled" 
          />
        </UiCardContent>
      </UiCard>
    </div>
    
    <div v-else-if="importResult">
      <UiCard>
        <UiCardHeader>
          <UiCardTitle>Import Result</UiCardTitle>
        </UiCardHeader>
        <UiCardContent>
          <div 
            class="p-4 rounded-md mb-4" 
            :class="importResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'"
          >
            <p class="font-medium">{{ importResult.message }}</p>
          </div>
          
          <div v-if="importResult.errors.length > 0" class="space-y-2">
            <h3 class="text-sm font-medium">Errors:</h3>
            <ul class="list-disc pl-5 text-sm space-y-1">
              <li v-for="(error, index) in importResult.errors" :key="index">
                {{ error }}
              </li>
            </ul>
          </div>
        </UiCardContent>
        <UiCardFooter>
          <UiButton @click="importResult = null">
            Back to Connections
          </UiButton>
        </UiCardFooter>
      </UiCard>
    </div>
    
    <div v-else>
      <ConnectionList 
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
    
    <!-- Click outside handler for export menu -->
    <div 
      v-if="showExportMenu" 
      class="fixed inset-0 z-0"
      @click="showExportMenu = false"
    ></div>
  </div>
</template>
