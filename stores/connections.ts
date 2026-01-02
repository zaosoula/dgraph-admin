import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Connection, ConnectionState, Environment } from '@/types/connection'

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

  // Environment-based computed properties
  const connectionsByEnvironment = computed(() => {
    const grouped: Record<string, Connection[]> = {
      Development: [],
      Production: [],
      Untagged: []
    }
    
    connections.value.forEach(connection => {
      if (connection.environment) {
        grouped[connection.environment].push(connection)
      } else {
        grouped.Untagged.push(connection)
      }
    })
    
    return grouped
  })

  // Get linked production connection for a development connection
  const getLinkedProduction = computed(() => (connectionId: string) => {
    const connection = connections.value.find(conn => conn.id === connectionId)
    if (!connection?.linkedProductionId) return null
    return connections.value.find(conn => conn.id === connection.linkedProductionId) || null
  })

  // Get all production connections for linking
  const productionConnections = computed(() => {
    return connections.value.filter(conn => conn.environment === 'Production')
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

    // Log activity
    if (process.client) {
      import('@/composables/useActivityHistory').then(({ useActivityHistory }) => {
        const { addActivity } = useActivityHistory()
        addActivity({
          type: 'connection_added',
          action: 'Connection added',
          connectionName: newConnection.name,
          connectionId: id,
          status: 'success',
          details: `New ${newConnection.environment || 'untagged'} connection created`
        })
      })
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
    
    const connectionToRemove = connections.value[index]
    connections.value.splice(index, 1)
    
    // Remove connection state
    if (connectionStates.value[id]) {
      delete connectionStates.value[id]
    }
    
    // If active connection is removed, set active to null
    if (activeConnectionId.value === id) {
      activeConnectionId.value = null
    }

    // Log activity
    if (process.client) {
      import('@/composables/useActivityHistory').then(({ useActivityHistory }) => {
        const { addActivity } = useActivityHistory()
        addActivity({
          type: 'connection_removed',
          action: 'Connection removed',
          connectionName: connectionToRemove.name,
          connectionId: id,
          status: 'info',
          details: `${connectionToRemove.environment || 'Untagged'} connection deleted`
        })
      })
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

  function linkConnectionToProduction(devConnectionId: string, prodConnectionId: string) {
    const devConnection = connections.value.find(conn => conn.id === devConnectionId)
    const prodConnection = connections.value.find(conn => conn.id === prodConnectionId)
    
    if (!devConnection || !prodConnection) {
      console.error('Connection not found for linking')
      return false
    }
    
    if (devConnection.environment !== 'Development') {
      console.error('Only Development connections can be linked to Production')
      return false
    }
    
    if (prodConnection.environment !== 'Production') {
      console.error('Can only link to Production connections')
      return false
    }
    
    return updateConnection(devConnectionId, { linkedProductionId: prodConnectionId })
  }

  function unlinkConnectionFromProduction(devConnectionId: string) {
    const devConnection = connections.value.find(conn => conn.id === devConnectionId)
    
    if (!devConnection) {
      console.error('Connection not found for unlinking')
      return false
    }
    
    return updateConnection(devConnectionId, { linkedProductionId: undefined })
  }

  // Bulk refresh state
  const isRefreshingAll = ref(false)
  const refreshProgress = ref(0)

  // Refresh all connections
  const refreshAllConnections = async () => {
    if (connections.value.length === 0) return { success: 0, failed: 0, results: [] }

    isRefreshingAll.value = true
    refreshProgress.value = 0

    const { useDgraphClient } = await import('@/composables/useDgraphClient')
    const { useActivityHistory } = await import('@/composables/useActivityHistory')
    
    const { testConnection } = useDgraphClient()
    const { addActivity } = useActivityHistory()

    const results: Array<{ connection: Connection; success: boolean; error?: string }> = []
    let completed = 0

    // Test all connections in parallel
    const testPromises = connections.value.map(async (connection) => {
      try {
        const success = await testConnection(connection)
        const result = { connection, success }
        
        // Log activity
        addActivity({
          type: 'connection_test',
          action: success ? 'Connection test passed' : 'Connection test failed',
          connectionName: connection.name,
          connectionId: connection.id,
          status: success ? 'success' : 'error',
          details: success ? 'Connection is healthy' : 'Connection failed health check'
        })

        results.push(result)
        completed++
        refreshProgress.value = Math.round((completed / connections.value.length) * 100)
        
        return result
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const result = { connection, success: false, error: errorMessage }
        
        // Log activity
        addActivity({
          type: 'connection_test',
          action: 'Connection test failed',
          connectionName: connection.name,
          connectionId: connection.id,
          status: 'error',
          details: errorMessage,
          error: errorMessage
        })

        results.push(result)
        completed++
        refreshProgress.value = Math.round((completed / connections.value.length) * 100)
        
        return result
      }
    })

    await Promise.allSettled(testPromises)

    isRefreshingAll.value = false
    refreshProgress.value = 100

    const successCount = results.filter(r => r.success).length
    const failedCount = results.filter(r => !r.success).length

    // Log summary activity
    addActivity({
      type: 'connection_test',
      action: 'Bulk connection refresh completed',
      connectionName: 'All Connections',
      connectionId: 'bulk',
      status: failedCount === 0 ? 'success' : failedCount === results.length ? 'error' : 'warning',
      details: `${successCount} successful, ${failedCount} failed out of ${results.length} connections`
    })

    return {
      success: successCount,
      failed: failedCount,
      total: results.length,
      results
    }
  }

  return {
    connections,
    activeConnectionId,
    connectionStates,
    activeConnection,
    activeConnectionState,
    connectionsByEnvironment,
    getLinkedProduction,
    productionConnections,
    isRefreshingAll,
    refreshProgress,
    addConnection,
    updateConnection,
    removeConnection,
    setActiveConnection,
    updateConnectionState,
    linkConnectionToProduction,
    unlinkConnectionFromProduction,
    refreshAllConnections
  }
})
