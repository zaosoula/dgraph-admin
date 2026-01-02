import { ref, computed } from 'vue'
import { useSchemaPromotion } from '@/composables/useSchemaPromotion'
import { useConnectionsStore } from '@/stores/connections'
import { useActivityHistory } from '@/composables/useActivityHistory'
import type { Connection } from '@/types/connection'
import type { SchemaComparisonResult } from '@/composables/useSchemaPromotion'

export type SchemaSyncStatus = {
  connectionId: string
  linkedProductionId: string
  isChecking: boolean
  lastChecked: Date | null
  hasDifferences: boolean | null
  comparisonResult: SchemaComparisonResult | null
  error: string | null
}

export const useSchemaSyncStatus = () => {
  const connectionsStore = useConnectionsStore()
  const { compareSchemas } = useSchemaPromotion()
  const { addActivity } = useActivityHistory()

  const syncStatuses = ref<Record<string, SchemaSyncStatus>>({})
  const isCheckingAll = ref(false)
  const checkProgress = ref(0)

  // Get sync status for a specific connection
  const getSyncStatus = computed(() => (connectionId: string): SchemaSyncStatus | null => {
    return syncStatuses.value[connectionId] || null
  })

  // Get all promotable connections (dev connections with linked production)
  const promotableConnections = computed(() => {
    return connectionsStore.connections.filter(conn => 
      conn.environment === 'Development' && 
      conn.linkedProductionId
    )
  })

  // Get connections with schema differences
  const connectionsWithDifferences = computed(() => {
    return promotableConnections.value.filter(conn => {
      const status = syncStatuses.value[conn.id]
      return status?.hasDifferences === true
    })
  })

  // Get connections that are synced
  const syncedConnections = computed(() => {
    return promotableConnections.value.filter(conn => {
      const status = syncStatuses.value[conn.id]
      return status?.hasDifferences === false
    })
  })

  // Get connections with unknown sync status
  const unknownSyncConnections = computed(() => {
    return promotableConnections.value.filter(conn => {
      const status = syncStatuses.value[conn.id]
      return !status || status.hasDifferences === null
    })
  })

  // Check sync status for a single connection
  const checkSyncStatus = async (connection: Connection): Promise<SchemaSyncStatus | null> => {
    if (!connection.linkedProductionId) {
      console.warn('Connection has no linked production database')
      return null
    }

    const prodConnection = connectionsStore.connections.find(
      conn => conn.id === connection.linkedProductionId
    )

    if (!prodConnection) {
      console.error('Linked production connection not found')
      return null
    }

    // Initialize or update status
    if (!syncStatuses.value[connection.id]) {
      syncStatuses.value[connection.id] = {
        connectionId: connection.id,
        linkedProductionId: connection.linkedProductionId,
        isChecking: false,
        lastChecked: null,
        hasDifferences: null,
        comparisonResult: null,
        error: null
      }
    }

    const status = syncStatuses.value[connection.id]
    status.isChecking = true
    status.error = null

    try {
      const comparisonResult = await compareSchemas(connection, prodConnection)
      
      if (comparisonResult) {
        status.comparisonResult = comparisonResult
        status.hasDifferences = comparisonResult.hasDifferences
        status.lastChecked = new Date()
        status.error = null

        // Log activity
        addActivity({
          type: 'schema_comparison',
          action: comparisonResult.hasDifferences 
            ? 'Schema differences detected' 
            : 'Schemas are in sync',
          connectionName: connection.name,
          connectionId: connection.id,
          status: comparisonResult.hasDifferences ? 'warning' : 'success',
          details: comparisonResult.hasDifferences 
            ? `${comparisonResult.differences?.length || 0} differences found`
            : 'Development and production schemas match'
        })
      } else {
        status.error = 'Failed to compare schemas'
        status.hasDifferences = null
        status.comparisonResult = null

        // Log error activity
        addActivity({
          type: 'schema_comparison',
          action: 'Schema comparison failed',
          connectionName: connection.name,
          connectionId: connection.id,
          status: 'error',
          details: 'Unable to retrieve or compare schemas',
          error: 'Schema comparison failed'
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      status.error = errorMessage
      status.hasDifferences = null
      status.comparisonResult = null

      // Log error activity
      addActivity({
        type: 'schema_comparison',
        action: 'Schema comparison failed',
        connectionName: connection.name,
        connectionId: connection.id,
        status: 'error',
        details: errorMessage,
        error: errorMessage
      })
    } finally {
      status.isChecking = false
    }

    return status
  }

  // Check sync status for all promotable connections
  const checkAllSyncStatuses = async () => {
    const connections = promotableConnections.value
    if (connections.length === 0) return { checked: 0, withDifferences: 0, errors: 0 }

    isCheckingAll.value = true
    checkProgress.value = 0

    const results: Array<{ connection: Connection; status: SchemaSyncStatus | null }> = []
    let completed = 0

    // Check all connections in parallel
    const checkPromises = connections.map(async (connection) => {
      try {
        const status = await checkSyncStatus(connection)
        results.push({ connection, status })
        completed++
        checkProgress.value = Math.round((completed / connections.length) * 100)
        return { connection, status }
      } catch (error) {
        console.error(`Failed to check sync status for ${connection.name}:`, error)
        results.push({ connection, status: null })
        completed++
        checkProgress.value = Math.round((completed / connections.length) * 100)
        return { connection, status: null }
      }
    })

    await Promise.allSettled(checkPromises)

    isCheckingAll.value = false
    checkProgress.value = 100

    const checkedCount = results.filter(r => r.status !== null).length
    const withDifferencesCount = results.filter(r => r.status?.hasDifferences === true).length
    const errorsCount = results.filter(r => r.status === null || r.status.error !== null).length

    // Log summary activity
    addActivity({
      type: 'schema_comparison',
      action: 'Bulk schema sync check completed',
      connectionName: 'All Promotable Connections',
      connectionId: 'bulk',
      status: errorsCount === 0 ? 'success' : errorsCount === results.length ? 'error' : 'warning',
      details: `${checkedCount} checked, ${withDifferencesCount} with differences, ${errorsCount} errors`
    })

    return {
      checked: checkedCount,
      withDifferences: withDifferencesCount,
      errors: errorsCount,
      total: connections.length
    }
  }

  // Clear sync status for a connection
  const clearSyncStatus = (connectionId: string) => {
    if (syncStatuses.value[connectionId]) {
      delete syncStatuses.value[connectionId]
    }
  }

  // Clear all sync statuses
  const clearAllSyncStatuses = () => {
    syncStatuses.value = {}
  }

  // Get summary statistics
  const syncSummary = computed(() => {
    const total = promotableConnections.value.length
    const withDifferences = connectionsWithDifferences.value.length
    const synced = syncedConnections.value.length
    const unknown = unknownSyncConnections.value.length
    const checking = Object.values(syncStatuses.value).filter(status => status.isChecking).length

    return {
      total,
      withDifferences,
      synced,
      unknown,
      checking,
      hasPromotableConnections: total > 0
    }
  })

  return {
    syncStatuses,
    isCheckingAll,
    checkProgress,
    getSyncStatus,
    promotableConnections,
    connectionsWithDifferences,
    syncedConnections,
    unknownSyncConnections,
    syncSummary,
    checkSyncStatus,
    checkAllSyncStatuses,
    clearSyncStatus,
    clearAllSyncStatuses
  }
}

