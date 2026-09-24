import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useSchemaHistoryStore } from '@/stores/schema-history'
import type {
  Connection,
  ConnectionState,
  ConnectionTestCheckResult,
  ConnectionTestResult
} from '@/types/connection'

// Storage keys
const STORAGE_KEY_CONNECTIONS = 'dgraph_admin_connections'
const STORAGE_KEY_ACTIVE_CONNECTION = 'dgraph_admin_active_connection'
const STORAGE_KEY_CONNECTION_STATES = 'dgraph_admin_connection_states'

// Fields that are typed as `Date` and therefore need reviving after JSON.parse
const DATE_FIELDS = new Set(['createdAt', 'updatedAt', 'lastChecked', 'timestamp'])
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

// JSON.parse reviver: turn stored ISO strings back into `Date` instances so the
// runtime values match what `types/connection.ts` declares.
const reviveDates = (key: string, value: unknown): unknown => {
  if (DATE_FIELDS.has(key) && typeof value === 'string' && ISO_DATE_PATTERN.test(value)) {
    return new Date(value)
  }
  return value
}

// Helper to safely parse JSON from localStorage
const safeParseJSON = <T>(key: string, defaultValue: T): T => {
  try {
    const storedValue = localStorage.getItem(key)
    if (!storedValue) return defaultValue
    return JSON.parse(storedValue, reviveDates) as T
  } catch (error) {
    console.error(`Error parsing stored value for ${key}:`, error)
    return defaultValue
  }
}

const isQuotaExceeded = (error: unknown): boolean =>
  error instanceof DOMException &&
  (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')

// Helper to safely stringify and save JSON to localStorage
const saveToLocalStorage = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    if (isQuotaExceeded(error)) {
      console.warn(`LocalStorage quota exceeded for ${key}, removing it to make space...`)
      localStorage.removeItem(key)
    } else {
      console.error(`Error saving value to ${key}:`, error)
    }
  }
}

// Cap persisted error strings; the full text stays in memory for the UI to read.
const MAX_PERSISTED_ERROR_LENGTH = 200

const trimCheckResult = (result: ConnectionTestCheckResult): ConnectionTestCheckResult => ({
  success: result.success,
  responseTime: result.responseTime,
  error: result.error ? result.error.slice(0, MAX_PERSISTED_ERROR_LENGTH) : null,
  timestamp: result.timestamp
})

const trimTestResults = (results: ConnectionTestResult): ConnectionTestResult => ({
  adminHealth: trimCheckResult(results.adminHealth),
  adminSchemaRead: trimCheckResult(results.adminSchemaRead),
  clientIntrospection: trimCheckResult(results.clientIntrospection),
  overallSuccess: results.overallSuccess,
  totalTime: results.totalTime
})

// Shrink connection states on the way to disk only — in-memory state keeps the
// full test results so consumers can read `testResults.adminHealth.error`.
const toPersistableStates = (
  states: Record<string, ConnectionState>,
  includeTestResults: boolean
): Record<string, ConnectionState> => {
  const persistable: Record<string, ConnectionState> = {}

  Object.entries(states).forEach(([connectionId, state]) => {
    persistable[connectionId] = {
      isConnected: state.isConnected,
      isLoading: false, // Never persist a loading state
      error: state.error,
      lastChecked: state.lastChecked,
      ...(includeTestResults && state.testResults
        ? { testResults: trimTestResults(state.testResults) }
        : {})
    }
  })

  return persistable
}

const saveConnectionStates = (states: Record<string, ConnectionState>): void => {
  try {
    localStorage.setItem(
      STORAGE_KEY_CONNECTION_STATES,
      JSON.stringify(toPersistableStates(states, true))
    )
  } catch (error) {
    if (!isQuotaExceeded(error)) {
      console.error(`Error saving value to ${STORAGE_KEY_CONNECTION_STATES}:`, error)
      return
    }

    console.warn('LocalStorage quota exceeded for connection states, dropping test results...')
    try {
      localStorage.setItem(
        STORAGE_KEY_CONNECTION_STATES,
        JSON.stringify(toPersistableStates(states, false))
      )
    } catch (retryError) {
      console.error('Failed to save even minimal connection states:', retryError)
      localStorage.removeItem(STORAGE_KEY_CONNECTION_STATES)
    }
  }
}

export const useConnectionsStore = defineStore('connections', () => {
  // Load initial state from localStorage
  const connections = ref<Connection[]>(safeParseJSON<Connection[]>(STORAGE_KEY_CONNECTIONS, []))
  const activeConnectionId = ref<string | null>(safeParseJSON<string | null>(STORAGE_KEY_ACTIVE_CONNECTION, null))
  const connectionStates = ref<Record<string, ConnectionState>>(safeParseJSON<Record<string, ConnectionState>>(STORAGE_KEY_CONNECTION_STATES, {}))

  // Flag to prevent infinite loops during cleanup
  const isCleaningUp = ref(false)

  // Clean up localStorage on initialization if needed
  const cleanupLocalStorage = () => {
    if (isCleaningUp.value) return // Prevent recursive cleanup
    
    try {
      isCleaningUp.value = true
      
      // Check localStorage usage
      const totalSize = Object.keys(localStorage).reduce(
        (size, key) => size + (localStorage.getItem(key)?.length ?? 0),
        0
      )
      
      // If we're using more than 3MB, clean up connection states
      if (totalSize > 3 * 1024 * 1024) {
        console.log('LocalStorage usage high, cleaning up connection states...')
        // Drop test results to save space
        const cleanedStates = toPersistableStates(connectionStates.value, false)
        
        // Update the ref directly without triggering watchers
        connectionStates.value = cleanedStates
        
        // Save directly to localStorage without going through saveToLocalStorage to avoid recursion
        try {
          localStorage.setItem(STORAGE_KEY_CONNECTION_STATES, JSON.stringify(cleanedStates))
          console.log('Successfully cleaned up connection states')
        } catch (error) {
          console.error('Failed to save cleaned states:', error)
          // As last resort, clear the key
          localStorage.removeItem(STORAGE_KEY_CONNECTION_STATES)
        }
      }
    } catch (error) {
      console.warn('Error during localStorage cleanup:', error)
    } finally {
      isCleaningUp.value = false
    }
  }

  // Run cleanup on initialization
  if (import.meta.client) {
    cleanupLocalStorage()
  }

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
      // An imported file can carry any string here, so fall back to Untagged
      // rather than pushing onto an undefined bucket.
      const environment = connection.environment
      if (environment && Object.prototype.hasOwnProperty.call(grouped, environment)) {
        grouped[environment].push(connection)
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
    if (!isCleaningUp.value) {
      saveToLocalStorage(STORAGE_KEY_CONNECTIONS, newConnections)
    }
  }, { deep: true })

  watch(activeConnectionId, (newActiveConnectionId) => {
    if (!isCleaningUp.value) {
      saveToLocalStorage(STORAGE_KEY_ACTIVE_CONNECTION, newActiveConnectionId)
    }
  })

  watch(connectionStates, (newConnectionStates) => {
    if (!isCleaningUp.value) {
      saveConnectionStates(newConnectionStates)
    }
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
    if (import.meta.client) {
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

    // Drop dangling dev -> prod links pointing at the removed connection
    connections.value.forEach(connection => {
      if (connection.linkedProductionId === id) {
        connection.linkedProductionId = undefined
        connection.updatedAt = new Date()
      }
    })

    // Drop the schema history versions keyed to the removed connection
    try {
      useSchemaHistoryStore().deleteVersionsForConnection(id)
    } catch (error) {
      console.error('Failed to clean up schema history for removed connection:', error)
    }
    
    // If active connection is removed, set active to null
    if (activeConnectionId.value === id) {
      activeConnectionId.value = null
    }

    // Log activity
    if (import.meta.client) {
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
    
    // Keep the full results in memory; `saveConnectionStates` trims on the way
    // to localStorage so consumers can still read `testResults.adminHealth.error`.
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
