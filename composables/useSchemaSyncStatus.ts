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

// Module-scope state — shared by every consumer of this composable, so a second
// caller (sidebar badge, connection list, ...) sees the same sync results.
const syncStatuses = ref<Record<string, SchemaSyncStatus>>({})
const isCheckingAll = ref(false)
const checkProgress = ref(0)

export const useSchemaSyncStatus = () => {
  const connectionsStore = useConnectionsStore()
  const { compareSchemas } = useSchemaPromotion()
  const { addActivity } = useActivityHistory()

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

        // No activity logged here: `compareSchemas` already recorded this exact
        // comparison. Logging again wrote two rows per check, and with the
        // history now a shared store that burned the 25-entry cap on
        // duplicates and evicted real history.
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

  /**
   * Development connections whose sync status a write to `connectionId` invalidates.
   *
   * Writing a development instance changes one side of its own pair. Writing a
   * production instance changes the other side of every pair pointing at it, so
   * a single promotion target can stale several rows at once.
   */
  const pairsAffectedBy = (connectionId: string): Connection[] => {
    const written = connectionsStore.connections.find(conn => conn.id === connectionId)
    if (!written) return []

    if (written.environment === 'Production') {
      return connectionsStore.connections.filter(conn => conn.linkedProductionId === connectionId)
    }

    return written.linkedProductionId ? [written] : []
  }

  /** Drop cached results a write to `connectionId` has made untrue. */
  const invalidateForConnection = (connectionId: string) => {
    pairsAffectedBy(connectionId).forEach(conn => {
      const status = syncStatuses.value[conn.id]
      if (!status) return

      status.hasDifferences = null
      status.comparisonResult = null
      status.lastChecked = null
      status.error = null
    })
  }

  /** Invalidate, then re-compare the affected pairs. Failures surface per status. */
  const refreshForConnection = async (connectionId: string) => {
    const affected = pairsAffectedBy(connectionId)
    if (affected.length === 0) return

    invalidateForConnection(connectionId)

    await Promise.allSettled(
      affected
        // A check already in flight will observe the new schema anyway.
        .filter(conn => !syncStatuses.value[conn.id]?.isChecking)
        .map(conn => checkSyncStatus(conn))
    )
  }

  /**
   * Record a pair as synced without re-comparing.
   *
   * Straight after a successful promotion both sides hold the schema we just
   * wrote, so spending two round-trips to rediscover that is pure latency.
   */
  const markPairSynced = (devConnectionId: string) => {
    const connection = connectionsStore.connections.find(conn => conn.id === devConnectionId)
    if (!connection?.linkedProductionId) return

    syncStatuses.value[devConnectionId] = {
      connectionId: devConnectionId,
      linkedProductionId: connection.linkedProductionId,
      isChecking: false,
      lastChecked: new Date(),
      hasDifferences: false,
      comparisonResult: null,
      error: null
    }
  }

  /** Default window before a cached comparison is treated as stale. */
  const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000

  /**
   * Compare any pair that is unknown or older than `maxAgeMs`.
   *
   * Used on dashboard mount so the rows are not stuck on "Unknown" until
   * someone presses Check All; a recent result is reused rather than refetched.
   */
  const ensureFreshStatuses = async ({ maxAgeMs = DEFAULT_MAX_AGE_MS }: { maxAgeMs?: number } = {}) => {
    const now = Date.now()

    const stale = promotableConnections.value.filter(conn => {
      const status = syncStatuses.value[conn.id]
      if (!status || status.isChecking) return !status
      if (status.hasDifferences === null || !status.lastChecked) return true
      return now - new Date(status.lastChecked).getTime() > maxAgeMs
    })

    if (stale.length === 0) return { checked: 0 }

    await Promise.allSettled(stale.map(conn => checkSyncStatus(conn)))

    return { checked: stale.length }
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
    refreshForConnection,
    markPairSynced,
    ensureFreshStatuses
  }
}

