import { useConnectionsStore } from '@/stores/connections'
import { useCredentialStorage } from '@/composables/useCredentialStorage'
import type { Connection, ConnectionCredentials, AuthMethod, AuthCredentials } from '@/types/connection'

export type ConnectionExport = {
  version: string
  connections: Array<Connection>
  exportedAt: string
}

export type ConnectionImportResult = {
  success: boolean
  message: string
  importedCount: number
  errors: string[]
}

export const useConnectionExportImport = () => {
  const connectionsStore = useConnectionsStore()
  const credentialStorage = useCredentialStorage()

  /**
   * Export a single connection to a JSON file
   */
  const exportConnection = (connectionId: string): boolean => {
    const connection = connectionsStore.connections.find(conn => conn.id === connectionId)
    if (!connection) return false

    // Create export object
    const exportData: ConnectionExport = {
      version: '1.0',
      connections: [connection],
      exportedAt: new Date().toISOString()
    }

    // Convert to JSON and create download
    downloadJson(exportData, `dgraph-connection-${connection.name.replace(/\s+/g, '-').toLowerCase()}.json`)
    return true
  }

  /**
   * Export all connections to a JSON file
   */
  const exportAllConnections = (): boolean => {
    if (connectionsStore.connections.length === 0) return false

    // Create export object
    const exportData: ConnectionExport = {
      version: '1.0',
      connections: connectionsStore.connections,
      exportedAt: new Date().toISOString()
    }

    // Convert to JSON and create download
    downloadJson(exportData, 'dgraph-connections.json')
    return true
  }

  /**
   * Import connections from a JSON file
   */
  const importConnections = async (file: File): Promise<ConnectionImportResult> => {
    const result: ConnectionImportResult = {
      success: false,
      message: '',
      importedCount: 0,
      errors: []
    }

    try {
      // Read file content
      const fileContent = await readFileAsText(file)
      
      // Parse JSON
      const importData = JSON.parse(fileContent) as unknown
      
      // Validate import data
      if (!isValidConnectionExport(importData)) {
        result.message = 'Invalid import file format'
        return result
      }

      const exportData = importData as ConnectionExport
      
      // Process each connection
      for (const connection of exportData.connections) {
        try {
          // Check if connection with same ID already exists
          const existingIndex = connectionsStore.connections.findIndex(conn => conn.id === connection.id)
          
          // Handle legacy credential format if needed
          let credentials = connection.credentials
          
          // Check if the credentials are in the old format (pre-separate auth)
          if (!credentials.graphql && !credentials.admin) {
            // Convert old format to new format
            const oldCredentials = credentials as unknown as {
              username?: string
              password?: string
              apiKey?: string
              token?: string
              authToken?: string
            }
            
            // Determine the auth method based on which credential is present
            let method: AuthMethod = 'none'
            if (oldCredentials.username && oldCredentials.password) {
              method = 'basic'
            } else if (oldCredentials.token) {
              method = 'token'
            } else if (oldCredentials.apiKey) {
              method = 'api-key'
            } else if (oldCredentials.authToken) {
              method = 'auth-token'
            }
            
            // Create new credentials structure
            credentials = {
              graphql: {
                method,
                username: oldCredentials.username || '',
                password: oldCredentials.password || '',
                apiKey: oldCredentials.apiKey || '',
                token: oldCredentials.token || '',
                authToken: oldCredentials.authToken || ''
              },
              admin: {
                method,
                username: oldCredentials.username || '',
                password: oldCredentials.password || '',
                apiKey: oldCredentials.apiKey || '',
                token: oldCredentials.token || '',
                authToken: oldCredentials.authToken || ''
              },
              useUnifiedAuth: true
            }
          }
          
          if (existingIndex >= 0) {
            // Update existing connection
            connectionsStore.updateConnection(connection.id, {
              name: connection.name,
              type: connection.type,
              url: connection.url,
              isSecure: connection.isSecure
            })
          } else {
            // Add new connection with potentially converted credentials
            const newId = connectionsStore.addConnection({
              name: connection.name,
              type: connection.type,
              url: connection.url,
              credentials: { 
                graphql: { method: 'none' },
                admin: { method: 'none' },
                useUnifiedAuth: credentials.useUnifiedAuth ?? true
              },
              isSecure: connection.isSecure
            })
            
            // Save credentials if secure
            if (connection.isSecure) {
              credentialStorage.saveCredentials(newId, credentials)
            }
          }
          
          result.importedCount++
        } catch (error) {
          result.errors.push(`Failed to import connection "${connection.name}": ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      
      result.success = result.importedCount > 0
      result.message = result.success 
        ? `Successfully imported ${result.importedCount} connection${result.importedCount !== 1 ? 's' : ''}`
        : 'Failed to import any connections'
      
    } catch (error) {
      result.success = false
      result.message = `Import failed: ${error instanceof Error ? error.message : String(error)}`
    }
    
    return result
  }

  /**
   * Helper to download JSON as a file
   */
  const downloadJson = (data: any, filename: string) => {
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    
    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 100)
  }

  /**
   * Helper to read file content as text
   */
  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (event) => {
        if (event.target?.result) {
          resolve(event.target.result as string)
        } else {
          reject(new Error('Failed to read file'))
        }
      }
      
      reader.onerror = () => {
        reject(new Error('Error reading file'))
      }
      
      reader.readAsText(file)
    })
  }

  /**
   * Validate if the imported data has the correct format
   */
  const isValidConnectionExport = (data: unknown): data is ConnectionExport => {
    if (!data || typeof data !== 'object') return false
    
    const exportData = data as Partial<ConnectionExport>
    
    // Check required fields
    if (!exportData.version || !exportData.connections || !Array.isArray(exportData.connections)) {
      return false
    }
    
    // Validate each connection
    for (const connection of exportData.connections) {
      if (!isValidConnection(connection)) {
        return false
      }
    }
    
    return true
  }

  /**
   * Validate if an object is a valid Connection
   */
  const isValidConnection = (data: unknown): data is Connection => {
    if (!data || typeof data !== 'object') return false
    
    const connection = data as Partial<Connection>
    
    // Check required fields
    const hasRequiredFields = !!(
      connection.id &&
      connection.name &&
      connection.type &&
      connection.url &&
      typeof connection.isSecure === 'boolean' &&
      connection.createdAt &&
      connection.updatedAt &&
      connection.credentials
    )
    
    if (!hasRequiredFields) return false
    
    // For backward compatibility, we accept both old and new credential formats
    const credentials = connection.credentials as any
    
    // New format: should have graphql and admin properties
    const isNewFormat = !!(credentials.graphql && credentials.admin)
    
    // Old format: should have at least one of these properties
    const isOldFormat = !!(
      'username' in credentials ||
      'password' in credentials ||
      'apiKey' in credentials ||
      'token' in credentials ||
      'authToken' in credentials
    )
    
    return isNewFormat || isOldFormat
  }

  return {
    exportConnection,
    exportAllConnections,
    importConnections
  }
}
