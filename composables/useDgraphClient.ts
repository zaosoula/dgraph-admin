import { ref, computed } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useCredentialStorage } from '@/composables/useCredentialStorage'
import { DgraphClient } from '@/utils/dgraph-client'
import type { Connection } from '@/types/connection'

export const useDgraphClient = () => {
  const connectionsStore = useConnectionsStore()
  const credentialStorage = useCredentialStorage()
  
  const client = ref<DgraphClient | null>(null)
  const isInitialized = computed(() => client.value !== null)
  
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
      const isConnected = await testClient.testConnection()
      
      // Update connection state
      connectionsStore.updateConnectionState(connectionToTest.id, {
        isConnected,
        isLoading: false,
        error: isConnected ? null : 'Connection failed',
        lastChecked: new Date()
      })
      
      return isConnected
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
  
  // Get schema
  const getSchema = async () => {
    if (!client.value) {
      const initialized = initializeClient()
      if (!initialized) return { error: { message: 'Failed to initialize client' } }
    }
    
    return await client.value!.getSchema()
  }
  
  // Update schema
  const updateSchema = async (schema: string) => {
    if (!client.value) {
      const initialized = initializeClient()
      if (!initialized) return { error: { message: 'Failed to initialize client' } }
    }
    
    return await client.value!.updateSchema(schema)
  }
  
  // Execute query
  const executeQuery = async <T>(query: string, variables?: Record<string, any>) => {
    if (!client.value) {
      const initialized = initializeClient()
      if (!initialized) return { error: { message: 'Failed to initialize client' } }
    }
    
    return await client.value!.executeQuery<T>(query, variables)
  }
  
  return {
    client,
    isInitialized,
    initializeClient,
    testConnection,
    getSchema,
    updateSchema,
    executeQuery
  }
}
