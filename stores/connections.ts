import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Connection, ConnectionState } from '@/types/connection'

// Storage keys
const STORAGE_KEY_CONNECTIONS = 'dgraph_admin_connections'
const STORAGE_KEY_ACTIVE_CONNECTION = 'dgraph_admin_active_connection'
const STORAGE_KEY_CONNECTION_STATES = 'dgraph_admin_connection_states'

// Helper to safely parse JSON from localStorage
const safeParseJSON = <T>(key: string, defaultValue: T): T => {
  try {
    const storedValue = localStorage.getItem(key)
    if (!storedValue) return defaultValue
    return JSON.parse(storedValue) as T
  } catch (error) {
    console.error(`Error parsing stored value for ${key}:`, error)
    return defaultValue
  }
}

// Helper to safely stringify and save JSON to localStorage
const saveToLocalStorage = (key: string, value: any): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error(`Error saving value to ${key}:`, error)
  }
}

export const useConnectionsStore = defineStore('connections', () => {
  // Load initial state from localStorage
  const connections = ref<Connection[]>(safeParseJSON<Connection[]>(STORAGE_KEY_CONNECTIONS, []))
  const activeConnectionId = ref<string | null>(safeParseJSON<string | null>(STORAGE_KEY_ACTIVE_CONNECTION, null))
  const connectionStates = ref<Record<string, ConnectionState>>(safeParseJSON<Record<string, ConnectionState>>(STORAGE_KEY_CONNECTION_STATES, {}))

  // Computed properties
  const activeConnection = computed(() => {
    if (!activeConnectionId.value) return null
    return connections.value.find(conn => conn.id === activeConnectionId.value) || null
  })

  const activeConnectionState = computed(() => {
    if (!activeConnectionId.value) return null
    return connectionStates.value[activeConnectionId.value] || null
  })

  // Persist state to localStorage when it changes
  watch(connections, (newConnections) => {
    saveToLocalStorage(STORAGE_KEY_CONNECTIONS, newConnections)
  }, { deep: true })

  watch(activeConnectionId, (newActiveConnectionId) => {
    saveToLocalStorage(STORAGE_KEY_ACTIVE_CONNECTION, newActiveConnectionId)
  })

  watch(connectionStates, (newConnectionStates) => {
    saveToLocalStorage(STORAGE_KEY_CONNECTION_STATES, newConnectionStates)
  }, { deep: true })

  // Store actions
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
