import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type SchemaVersion = {
  id: string
  connectionId: string
  schema: string
  timestamp: Date
  description: string
}

const STORAGE_KEY_SCHEMA_HISTORY = 'dgraph_admin_schema_history'

// Cap the number of versions kept per connection so localStorage cannot grow
// without bound (each version holds a full copy of the schema text).
const MAX_VERSIONS_PER_CONNECTION = 20

// When a quota error hits, retry with a tighter cap before giving up.
const FALLBACK_VERSIONS_PER_CONNECTION = 5

type StoredSchemaVersion = Omit<SchemaVersion, 'timestamp'> & { timestamp: string }

const isQuotaExceeded = (error: unknown): boolean =>
  error instanceof DOMException &&
  (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')

// Keep only the newest `limit` versions of every connection
const pruneVersions = (versions: SchemaVersion[], limit: number): SchemaVersion[] => {
  const kept: SchemaVersion[] = []
  const countPerConnection = new Map<string, number>()

  // Newest first, so the ones dropped are always the oldest
  const newestFirst = [...versions].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

  newestFirst.forEach(version => {
    const count = countPerConnection.get(version.connectionId) ?? 0
    if (count < limit) {
      kept.push(version)
      countPerConnection.set(version.connectionId, count + 1)
    }
  })

  return kept
}

const serialize = (versions: SchemaVersion[]): StoredSchemaVersion[] =>
  versions.map(v => ({ ...v, timestamp: v.timestamp.toISOString() }))

export const useSchemaHistoryStore = defineStore('schema-history', () => {
  const schemaVersions = ref<SchemaVersion[]>([])

  // Last persistence failure, so the UI can surface a lost version instead of
  // the store dropping it silently.
  const storageError = ref<string | null>(null)

  // Get versions for a specific connection
  const getVersionsForConnection = computed(() => {
    return (connectionId: string) => {
      return schemaVersions.value
        .filter(version => version.connectionId === connectionId)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    }
  })

  // Save to localStorage. Returns false when the versions could not be persisted.
  const saveToLocalStorage = (): boolean => {
    try {
      localStorage.setItem(STORAGE_KEY_SCHEMA_HISTORY, JSON.stringify(serialize(schemaVersions.value)))
      storageError.value = null
      return true
    } catch (error) {
      if (isQuotaExceeded(error)) {
        // Drop the oldest versions and try once more before reporting a failure
        const pruned = pruneVersions(schemaVersions.value, FALLBACK_VERSIONS_PER_CONNECTION)
        try {
          localStorage.setItem(STORAGE_KEY_SCHEMA_HISTORY, JSON.stringify(serialize(pruned)))
          schemaVersions.value = pruned
          storageError.value = `Storage was full: older schema versions were discarded (keeping the last ${FALLBACK_VERSIONS_PER_CONNECTION} per connection).`
          console.warn(storageError.value)
          return true
        } catch (retryError) {
          storageError.value = 'Storage is full: this schema version could not be saved and will be lost on reload.'
          console.error('Failed to save schema history to localStorage:', retryError)
          return false
        }
      }

      storageError.value = error instanceof Error ? error.message : String(error)
      console.error('Failed to save schema history to localStorage:', error)
      return false
    }
  }

  // Add a new schema version
  const addVersion = (connectionId: string, schema: string, description: string = 'Manual save') => {
    const id = crypto.randomUUID()

    schemaVersions.value.push({
      id,
      connectionId,
      schema,
      timestamp: new Date(),
      description
    })

    // Enforce the per-connection cap before persisting
    schemaVersions.value = pruneVersions(schemaVersions.value, MAX_VERSIONS_PER_CONNECTION)

    // Store in localStorage
    saveToLocalStorage()

    return id
  }

  // Get a specific version
  const getVersion = (id: string) => {
    return schemaVersions.value.find(version => version.id === id) || null
  }

  // Delete a version
  const deleteVersion = (id: string) => {
    const index = schemaVersions.value.findIndex(version => version.id === id)
    if (index === -1) return false

    schemaVersions.value.splice(index, 1)

    // Update localStorage
    saveToLocalStorage()

    return true
  }

  // Delete every version belonging to a connection (called when it is removed)
  const deleteVersionsForConnection = (connectionId: string) => {
    const remaining = schemaVersions.value.filter(version => version.connectionId !== connectionId)
    const removed = schemaVersions.value.length - remaining.length

    if (removed === 0) return 0

    schemaVersions.value = remaining
    saveToLocalStorage()

    return removed
  }

  const clearStorageError = () => {
    storageError.value = null
  }

  // Load from localStorage
  const loadFromLocalStorage = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SCHEMA_HISTORY)
      if (stored) {
        const parsed = JSON.parse(stored) as StoredSchemaVersion[]
        schemaVersions.value = pruneVersions(
          parsed.map(v => ({ ...v, timestamp: new Date(v.timestamp) })),
          MAX_VERSIONS_PER_CONNECTION
        )
      }
    } catch (error) {
      console.error('Failed to load schema history from localStorage:', error)
    }
  }

  // Initialize
  loadFromLocalStorage()

  return {
    schemaVersions,
    storageError,
    getVersionsForConnection,
    addVersion,
    getVersion,
    deleteVersion,
    deleteVersionsForConnection,
    clearStorageError
  }
})
