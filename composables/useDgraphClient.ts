import { ref, watch } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useCredentialStorage } from '@/composables/useCredentialStorage'
import { DgraphClient } from '@/utils/dgraph-client'
import type { Connection, ConnectionTestResult } from '@/types/connection'

export type ClientOptions = {
  /**
   * Resolve credentials from storage for secure connections. Pass false when
   * the caller already holds the credentials to use — a connection form
   * testing what the user just typed, for instance — so the stored copy does
   * not silently win over them.
   */
  useStoredCredentials?: boolean
}

/**
 * Build a DgraphClient aimed at a specific connection, resolving stored
 * credentials when the connection is secure. Safe to call outside of a
 * component setup: it registers no reactive effects.
 */
export const createClientForConnection = (
  connection: Connection,
  options: ClientOptions = {}
): DgraphClient => {
  const { useStoredCredentials = true } = options
  const { getCredentialsStrict } = useCredentialStorage()

  if (connection.isSecure && useStoredCredentials) {
    // Deliberately not caught: an unreadable vault must surface as an error,
    // never as a client that sends the connection's empty placeholder
    // credentials and fails with an opaque auth error.
    const storedCredentials = getCredentialsStrict(connection.id)

    if (storedCredentials) {
      return new DgraphClient({
        ...connection,
        credentials: storedCredentials
      })
    }
  }

  return new DgraphClient(connection)
}

export const useDgraphClient = () => {
  const connectionsStore = useConnectionsStore()
  
  const client = ref<DgraphClient | null>(null)
  
  // Watch for active connection changes and invalidate the cached client
  watch(() => connectionsStore.activeConnectionId, (newConnectionId, oldConnectionId) => {
    // Only invalidate if the connection actually changed
    if (newConnectionId !== oldConnectionId) {
      client.value = null
    }
  })
  
  // Initialize client with active connection
  const initializeClient = () => {
    const activeConnection = connectionsStore.activeConnection
    
    if (!activeConnection) {
      console.error('No active connection to initialize client')
      return false
    }
    
    try {
      client.value = createClientForConnection(activeConnection)
      return true
    } catch (error) {
      console.error('Failed to initialize Dgraph client:', error)
      return false
    }
  }
  
  // Test the connection
  const testConnection = async (connection?: Connection, options: ClientOptions = {}) => {
    const connectionToTest = connection || connectionsStore.activeConnection
    
    if (!connectionToTest) {
      console.error('No connection to test')
      return false
    }
    
    // Update connection state to loading
    connectionsStore.updateConnectionState(connectionToTest.id, {
      isLoading: true,
      error: null,
      lastChecked: new Date()
    })
    
    try {
      const testClient = createClientForConnection(connectionToTest, options)
      const testResults = await testClient.testConnection()
      
      // Update connection state with detailed results
      connectionsStore.updateConnectionState(connectionToTest.id, {
        isConnected: testResults.overallSuccess,
        isLoading: false,
        error: testResults.overallSuccess ? null : getConnectionErrorMessage(testResults),
        lastChecked: new Date(),
        testResults
      })

      // Log activity (only if not called from bulk refresh to avoid duplicate logging)
      if (!connection) {
        const { useActivityHistory } = await import('@/composables/useActivityHistory')
        const { addActivity } = useActivityHistory()
        
        addActivity({
          type: 'connection_test',
          action: testResults.overallSuccess ? 'Connection test passed' : 'Connection test failed',
          connectionName: connectionToTest.name,
          connectionId: connectionToTest.id,
          status: testResults.overallSuccess ? 'success' : 'error',
          details: testResults.overallSuccess 
            ? 'Connection is healthy' 
            : getConnectionErrorMessage(testResults)
        })
      }
      
      return testResults.overallSuccess
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      // Update connection state with error
      connectionsStore.updateConnectionState(connectionToTest.id, {
        isConnected: false,
        isLoading: false,
        error: errorMessage,
        lastChecked: new Date()
      })

      // Log activity (only if not called from bulk refresh to avoid duplicate logging)
      if (!connection) {
        const { useActivityHistory } = await import('@/composables/useActivityHistory')
        const { addActivity } = useActivityHistory()
        
        addActivity({
          type: 'connection_test',
          action: 'Connection test failed',
          connectionName: connectionToTest.name,
          connectionId: connectionToTest.id,
          status: 'error',
          details: errorMessage,
          error: errorMessage
        })
      }
      
      return false
    }
  }
  
  // Helper function to get a meaningful error message from test results
  const getConnectionErrorMessage = (testResults: ConnectionTestResult) => {
    const errors: string[] = []
    if (!testResults.adminHealth.success) {
      errors.push(`Admin: ${testResults.adminHealth.error}`)
    }
    if (!testResults.adminSchemaRead.success) {
      errors.push(`Schema: ${testResults.adminSchemaRead.error}`)
    }
    if (!testResults.clientIntrospection.success) {
      errors.push(`Client: ${testResults.clientIntrospection.error}`)
    }
    return errors.length > 0 ? errors.join('; ') : 'Connection failed'
  }
  
  // Get schema
  const getSchema = async () => {
    if (!client.value) {
      const initialized = initializeClient()
      if (!initialized) {
        return { 
          error: { 
            message: 'Failed to initialize client. Please check your connection settings and try again.',
            code: 'CLIENT_INIT_ERROR'
          } 
        }
      }
    }
    
    return await client.value!.getSchema()
  }
  
  // Update schema
  const updateSchema = async (schema: string) => {
    if (!client.value) {
      const initialized = initializeClient()
      if (!initialized) {
        return { 
          error: { 
            message: 'Failed to initialize client. Please check your connection settings and try again.',
            code: 'CLIENT_INIT_ERROR'
          } 
        }
      }
    }
    
    const result = await client.value!.updateSchema(schema)

    // A successful write makes any cached dev/prod comparison involving this
    // connection untrue, so refresh the affected pairs rather than leaving a
    // stale "Synced" badge on screen. Dynamic import breaks the cycle back
    // through useSchemaPromotion into this composable.
    if (!result.error && connectionsStore.activeConnectionId) {
      const connectionId = connectionsStore.activeConnectionId
      import('@/composables/useSchemaSyncStatus').then(({ useSchemaSyncStatus }) => {
        // Returned, so a rejection from the refresh reaches the catch below
        // rather than escaping as an unhandled rejection.
        return useSchemaSyncStatus().refreshForConnection(connectionId)
      }).catch((error) => {
        console.error('Failed to refresh schema sync status after write:', error)
      })
    }

    return result
  }
  
  // Execute query
  const executeQuery = async <T>(query: string, variables?: Record<string, unknown>) => {
    if (!client.value) {
      const initialized = initializeClient()
      if (!initialized) {
        return { 
          error: { 
            message: 'Failed to initialize client. Please check your connection settings and try again.',
            code: 'CLIENT_INIT_ERROR'
          } 
        }
      }
    }
    
    return await client.value!.executeQuery<T>(query, variables)
  }
  
  // Test connection with detailed results
  const testConnectionDetailed = async (connection?: Connection, options: ClientOptions = {}) => {
    const connectionToTest = connection || connectionsStore.activeConnection
    
    if (!connectionToTest) {
      console.error('No connection to test')
      return null
    }
    
    try {
      const testClient = createClientForConnection(connectionToTest, options)
      return await testClient.testConnection()
    } catch (error) {
      console.error('Detailed connection test failed:', error)
      return null
    }
  }

  return {
    client,
    initializeClient,
    testConnection,
    testConnectionDetailed,
    getSchema,
    updateSchema,
    executeQuery
  }
}
