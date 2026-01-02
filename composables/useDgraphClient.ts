import { ref, computed, watch } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useCredentialStorage } from '@/composables/useCredentialStorage'
import { DgraphClient } from '@/utils/dgraph-client'
import type { Connection } from '@/types/connection'

export const useDgraphClient = () => {
  const connectionsStore = useConnectionsStore()
  const credentialStorage = useCredentialStorage()
  
  const client = ref<DgraphClient | null>(null)
  const isInitialized = computed(() => client.value !== null)
  
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
      // Get stored credentials if the connection is secure
      if (activeConnection.isSecure) {
        const storedCredentials = credentialStorage.getCredentials(activeConnection.id)
        
        if (storedCredentials) {
          // Create a new connection object with the stored credentials
          const connectionWithCredentials = {
            ...activeConnection,
            credentials: storedCredentials
          }
          
          client.value = new DgraphClient(connectionWithCredentials)
          return true
        }
      }
      
      // If not secure or no stored credentials, use the connection as is
      client.value = new DgraphClient(activeConnection)
      return true
    } catch (error) {
      console.error('Failed to initialize Dgraph client:', error)
      return false
    }
  }
  
  // Test the connection
  const testConnection = async (connection?: Connection) => {
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
      let connectionWithCredentials = connectionToTest;
      
      // Get stored credentials if the connection is secure
      if (connectionToTest.isSecure) {
        const storedCredentials = credentialStorage.getCredentials(connectionToTest.id)
        
        if (storedCredentials) {
          // Create a new connection object with the stored credentials
          connectionWithCredentials = {
            ...connectionToTest,
            credentials: storedCredentials
          }
        }
      }
      
      const testClient = new DgraphClient(connectionWithCredentials)
      const testResults = await testClient.testConnection()
      
      // Update connection state with detailed results
      connectionsStore.updateConnectionState(connectionToTest.id, {
        isConnected: testResults.overallSuccess,
        isLoading: false,
        error: testResults.overallSuccess ? null : getConnectionErrorMessage(testResults),
        lastChecked: new Date(),
        testResults
      })
      
      return testResults.overallSuccess
    } catch (error) {
      // Update connection state with error
      connectionsStore.updateConnectionState(connectionToTest.id, {
        isConnected: false,
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
        lastChecked: new Date()
      })
      
      return false
    }
  }
  
  // Helper function to get a meaningful error message from test results
  const getConnectionErrorMessage = (testResults: any) => {
    const errors = []
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
    
    return await client.value!.updateSchema(schema)
  }
  
  // Execute query
  const executeQuery = async <T>(query: string, variables?: Record<string, any>) => {
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

  // Execute DQL query
  const executeDQLQuery = async <T>(query: string) => {
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
    
    return await client.value!.executeDQLQuery<T>(query)
  }
  
  // Test connection with detailed results
  const testConnectionDetailed = async (connection?: Connection) => {
    const connectionToTest = connection || connectionsStore.activeConnection
    
    if (!connectionToTest) {
      console.error('No connection to test')
      return null
    }
    
    try {
      let connectionWithCredentials = connectionToTest;
      
      // Get stored credentials if the connection is secure
      if (connectionToTest.isSecure) {
        const storedCredentials = credentialStorage.getCredentials(connectionToTest.id)
        
        if (storedCredentials) {
          // Create a new connection object with the stored credentials
          connectionWithCredentials = {
            ...connectionToTest,
            credentials: storedCredentials
          }
        }
      }
      
      const testClient = new DgraphClient(connectionWithCredentials)
      return await testClient.testConnection()
    } catch (error) {
      console.error('Detailed connection test failed:', error)
      return null
    }
  }

  return {
    client,
    isInitialized,
    initializeClient,
    testConnection,
    testConnectionDetailed,
    getSchema,
    updateSchema,
    executeQuery,
    executeDQLQuery
  }
}
