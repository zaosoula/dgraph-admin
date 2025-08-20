import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type SchemaVersion = {
  id: string
  connectionId: string
  schema: string
  timestamp: Date
  description: string
}

export const useSchemaHistoryStore = defineStore('schema-history', () => {
  const schemaVersions = ref<SchemaVersion[]>([])
  
  // Get versions for a specific connection
  const getVersionsForConnection = computed(() => {
    return (connectionId: string) => {
      return schemaVersions.value
        .filter(version => version.connectionId === connectionId)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    }
  })
  
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
  
  // Save to localStorage
  const saveToLocalStorage = () => {
    try {
      localStorage.setItem('dgraph_admin_schema_history', JSON.stringify(
        schemaVersions.value.map(v => ({
          ...v,
          timestamp: v.timestamp.toISOString()
        }))
      ))
    } catch (error) {
      console.error('Failed to save schema history to localStorage:', error)
    }
  }
  
  // Load from localStorage
  const loadFromLocalStorage = () => {
    try {
      const stored = localStorage.getItem('dgraph_admin_schema_history')
      if (stored) {
        schemaVersions.value = JSON.parse(stored).map((v: any) => ({
          ...v,
          timestamp: new Date(v.timestamp)
        }))
      }
    } catch (error) {
      console.error('Failed to load schema history from localStorage:', error)
    }
  }
  
  // Initialize
  loadFromLocalStorage()
  
  return {
    schemaVersions,
    getVersionsForConnection,
    addVersion,
    getVersion,
    deleteVersion
  }
})

