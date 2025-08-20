import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Connection, ConnectionState } from '@/types/connection'

export const useConnectionsStore = defineStore('connections', () => {
  const connections = ref<Connection[]>([])
  const activeConnectionId = ref<string | null>(null)
  const connectionStates = ref<Record<string, ConnectionState>>({})

  const activeConnection = computed(() => {
    if (!activeConnectionId.value) return null
    return connections.value.find(conn => conn.id === activeConnectionId.value) || null
  })

  const activeConnectionState = computed(() => {
    if (!activeConnectionId.value) return null
    return connectionStates.value[activeConnectionId.value] || null
  })

  function addConnection(connection: Omit<Connection, 'id' | 'createdAt' | 'updatedAt'>) {
    const id = crypto.randomUUID()
    const now = new Date()
    
    const newConnection: Connection = {
      ...connection,
      id,
      createdAt: now,
      updatedAt: now
    }
    
    connections.value.push(newConnection)
    
    // Initialize connection state
    connectionStates.value[id] = {
      isConnected: false,
      isLoading: false,
      error: null,
      lastChecked: null
    }
    
    return id
  }

  function updateConnection(id: string, updates: Partial<Omit<Connection, 'id' | 'createdAt' | 'updatedAt'>>) {
    const index = connections.value.findIndex(conn => conn.id === id)
    if (index === -1) return false
    
    connections.value[index] = {
      ...connections.value[index],
      ...updates,
      updatedAt: new Date()
    }
    
    return true
  }

  function removeConnection(id: string) {
    const index = connections.value.findIndex(conn => conn.id === id)
    if (index === -1) return false
    
    connections.value.splice(index, 1)
    
    // Remove connection state
    if (connectionStates.value[id]) {
      delete connectionStates.value[id]
    }
    
    // If active connection is removed, set active to null
    if (activeConnectionId.value === id) {
      activeConnectionId.value = null
    }
    
    return true
  }

  function setActiveConnection(id: string | null) {
    if (id === null) {
      activeConnectionId.value = null
      return true
    }
    
    const exists = connections.value.some(conn => conn.id === id)
    if (!exists) return false
    
    activeConnectionId.value = id
    return true
  }

  function updateConnectionState(id: string, state: Partial<ConnectionState>) {
    if (!connectionStates.value[id]) {
      connectionStates.value[id] = {
        isConnected: false,
        isLoading: false,
        error: null,
        lastChecked: null
      }
    }
    
    connectionStates.value[id] = {
      ...connectionStates.value[id],
      ...state
    }
  }

  return {
    connections,
    activeConnectionId,
    connectionStates,
    activeConnection,
    activeConnectionState,
    addConnection,
    updateConnection,
    removeConnection,
    setActiveConnection,
    updateConnectionState
  }
})

