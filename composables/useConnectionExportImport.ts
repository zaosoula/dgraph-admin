import { useConnectionsStore } from '@/stores/connections'
import { useCredentialStorage } from '@/composables/useCredentialStorage'
import type { Connection, ConnectionCredentials, AuthMethod, AuthCredentials } from '@/types/connection'

export type ConnectionExport = {
  version: string
  connections: Array<Connection>
  exportedAt: string
  /**
   * Whether this file carries decrypted credentials. Absent on files written
   * by older versions, which always included them.
   */
  includesCredentials?: boolean
}

export type ConnectionExportOptions = {
  /**
   * Write decrypted passwords, tokens and API keys into the downloaded file.
   * Off by default — the file is plaintext JSON on disk.
   */
  includeCredentials?: boolean
}

/**
 * Outcome of an export.
 *
 * `includedCredentials` reports what actually landed in the file rather than
 * what was asked for, so the UI cannot warn about plaintext secrets in a file
 * that has none — or stay silent about a file that does.
 */
export type ConnectionExportResult =
  | { ok: true, includedCredentials: boolean, count: number }
  | { ok: false, reason: 'not-found' | 'empty' }

export type ConnectionImportResult = {
  success: boolean
  message: string
  importedCount: number
  errors: string[]
  /** Whether the imported file carried credentials. */
  credentialsIncluded: boolean
}

export const useConnectionExportImport = () => {
  const connectionsStore = useConnectionsStore()
  const credentialStorage = useCredentialStorage()

  const emptyCredentials = (useUnifiedAuth?: boolean): ConnectionCredentials => ({
    graphql: { method: 'none' },
    admin: { method: 'none' },
    useUnifiedAuth: useUnifiedAuth ?? true
  })

  /**
   * Build the exportable copy of a connection. Credentials are only read out of
   * storage when the caller explicitly asked for them; otherwise the copy
   * carries an empty credential block.
   */
  const buildConnectionCopy = (connection: Connection, includeCredentials: boolean): Connection => {
    // Create a deep copy of the connection to avoid modifying the original
    const connectionCopy = JSON.parse(JSON.stringify(connection)) as Connection

    if (!includeCredentials) {
      connectionCopy.credentials = emptyCredentials(connection.credentials?.useUnifiedAuth)
      return connectionCopy
    }

    const storedCredentials = credentialStorage.getCredentials(connection.id)
    connectionCopy.credentials = storedCredentials ?? emptyCredentials(connection.credentials?.useUnifiedAuth)

    return connectionCopy
  }

  /**
   * Export a single connection to a JSON file
   */
  const exportConnection = (connectionId: string, options: ConnectionExportOptions = {}): ConnectionExportResult => {
    const connection = connectionsStore.connections.find(conn => conn.id === connectionId)
    if (!connection) return { ok: false, reason: 'not-found' }

    const includeCredentials = options.includeCredentials === true

    const copy = buildConnectionCopy(connection, includeCredentials)

    const exportData: ConnectionExport = {
      version: '1.1',
      connections: [copy],
      includesCredentials: includeCredentials,
      exportedAt: new Date().toISOString()
    }

    // Derived from the copy, not the request: asking for credentials on a
    // connection that has none must not produce a plaintext warning about a
    // file that contains none.
    const includedCredentials = carriesSecrets(copy.credentials)
    exportData.includesCredentials = includedCredentials

    downloadJson(exportData, `dgraph-connection-${connection.name.replace(/\s+/g, '-').toLowerCase()}.json`)
    return { ok: true, includedCredentials, count: 1 }
  }

  /**
   * Export all connections to a JSON file
   */
  const exportAllConnections = (options: ConnectionExportOptions = {}): ConnectionExportResult => {
    if (connectionsStore.connections.length === 0) return { ok: false, reason: 'empty' }

    const includeCredentials = options.includeCredentials === true

    const copies = connectionsStore.connections.map(connection => buildConnectionCopy(connection, includeCredentials))

    const exportData: ConnectionExport = {
      version: '1.1',
      connections: copies,
      includesCredentials: includeCredentials,
      exportedAt: new Date().toISOString()
    }

    const includedCredentials = copies.some(copy => carriesSecrets(copy.credentials))
    exportData.includesCredentials = includedCredentials

    downloadJson(exportData, 'dgraph-connections.json')
    return { ok: true, includedCredentials, count: copies.length }
  }

  const normalizeCredentials = (credentials: ConnectionCredentials): ConnectionCredentials => {
    if (credentials.graphql || credentials.admin) {
      return credentials
    }

    // Convert old format to new format
    const oldCredentials = credentials as unknown as {
      username?: string
      password?: string
      apiKey?: string
      token?: string
      authToken?: string
      dgAuth?: string
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
    } else if (oldCredentials.dgAuth) {
      method = 'dg-auth'
    }

    const converted: AuthCredentials = {
      method,
      username: oldCredentials.username || '',
      password: oldCredentials.password || '',
      apiKey: oldCredentials.apiKey || '',
      token: oldCredentials.token || '',
      authToken: oldCredentials.authToken || '',
      dgAuth: oldCredentials.dgAuth || ''
    }

    return {
      graphql: { ...converted },
      admin: { ...converted },
      useUnifiedAuth: true
    }
  }

  const carriesSecrets = (credentials: ConnectionCredentials): boolean => {
    const authCarriesSecrets = (auth?: AuthCredentials): boolean =>
      !!auth && (
        auth.method !== 'none' ||
        !!(auth.username || auth.password || auth.apiKey || auth.token || auth.authToken || auth.dgAuth)
      )

    return authCarriesSecrets(credentials.graphql) || authCarriesSecrets(credentials.admin)
  }

  /**
   * Import connections from a JSON file
   */
  const importConnections = async (file: File): Promise<ConnectionImportResult> => {
    const result: ConnectionImportResult = {
      success: false,
      message: '',
      importedCount: 0,
      errors: [],
      credentialsIncluded: false
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

      // Files written before the credentials opt-out always carried credentials
      result.credentialsIncluded = exportData.includesCredentials ?? true

      // First pass: create or update every connection and record where each
      // imported ID ended up, since `addConnection` mints a fresh UUID.
      const idMap = new Map<string, string>()

      for (const connection of exportData.connections) {
        try {
          // Handle legacy credential format if needed
          const credentials = normalizeCredentials(connection.credentials)

          // Check if connection with same ID already exists
          const existingIndex = connectionsStore.connections.findIndex(conn => conn.id === connection.id)

          let targetId: string

          if (existingIndex >= 0) {
            // Update existing connection. Links are resolved in the second pass.
            connectionsStore.updateConnection(connection.id, {
              name: connection.name,
              type: connection.type,
              url: connection.url,
              isSecure: connection.isSecure,
              environment: connection.environment
            })
            targetId = connection.id
          } else {
            // Add new connection; credentials live in credential storage, not the store
            targetId = connectionsStore.addConnection({
              name: connection.name,
              type: connection.type,
              url: connection.url,
              credentials: {
                graphql: { method: 'none' },
                admin: { method: 'none' },
                useUnifiedAuth: credentials.useUnifiedAuth ?? true
              },
              isSecure: connection.isSecure,
              environment: connection.environment
            })
          }

          idMap.set(connection.id, targetId)

          // Write credentials on both the create and the update path, so
          // re-importing a file with a rotated token actually refreshes it.
          if (carriesSecrets(credentials) && !credentialStorage.saveCredentials(targetId, credentials)) {
            result.errors.push(`Connection "${connection.name}" was imported, but its credentials could not be stored. Re-enter them before connecting.`)
          }

          result.importedCount++
        } catch (error) {
          result.errors.push(`Failed to import connection "${connection.name}": ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      // Second pass: remap dev to production links onto the new IDs
      for (const connection of exportData.connections) {
        const targetId = idMap.get(connection.id)
        if (!targetId) continue

        if (!connection.linkedProductionId) {
          connectionsStore.updateConnection(targetId, { linkedProductionId: undefined })
          continue
        }

        const remappedId = idMap.get(connection.linkedProductionId)
          ?? (connectionsStore.connections.some(conn => conn.id === connection.linkedProductionId)
            ? connection.linkedProductionId
            : undefined)

        if (!remappedId) {
          result.errors.push(`Connection "${connection.name}" was linked to a production connection that is not in this file; the link was dropped.`)
        }

        connectionsStore.updateConnection(targetId, { linkedProductionId: remappedId })
      }

      result.success = result.importedCount > 0
      result.message = result.success
        ? `Successfully imported ${result.importedCount} connection${result.importedCount !== 1 ? 's' : ''}${result.credentialsIncluded ? '' : ' (no credentials in file \u2014 re-enter them before connecting)'}`
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
  const downloadJson = (data: ConnectionExport, filename: string) => {
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
    
    // Check required fields. `createdAt`/`updatedAt` are deliberately not
    // required: the import path discards them and lets the store set its own.
    const hasRequiredFields = !!(
      connection.id &&
      connection.name &&
      connection.type &&
      connection.url &&
      typeof connection.isSecure === 'boolean' &&
      connection.credentials
    )
    
    if (!hasRequiredFields) return false
    
    // For backward compatibility, we accept both old and new credential formats
    const credentials = connection.credentials as Record<string, unknown>
    
    // New format: should have graphql and admin properties
    const isNewFormat = !!(credentials.graphql && credentials.admin)
    
    // Old format: should have at least one of these properties
    const isOldFormat = !!(
      'username' in credentials ||
      'password' in credentials ||
      'apiKey' in credentials ||
      'token' in credentials ||
      'authToken' in credentials ||
      'dgAuth' in credentials
    )
    
    return isNewFormat || isOldFormat
  }

  return {
    exportConnection,
    exportAllConnections,
    importConnections
  }
}
