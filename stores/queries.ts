import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SavedQuery, QueryHistoryEntry, QueryVariables, QueryResult } from '@/types/query'

// Storage keys
const STORAGE_KEY_SAVED_QUERIES = 'dgraph_admin_saved_queries'
const STORAGE_KEY_QUERY_HISTORY = 'dgraph_admin_query_history'
const STORAGE_KEY_CURRENT_QUERY = 'dgraph_admin_current_query'

// Helper to safely parse JSON from localStorage
const safeParseJSON = <T>(key: string, defaultValue: T): T => {
  try {
    const storedValue = localStorage.getItem(key)
    if (!storedValue) return defaultValue
    
    // Parse the JSON
    const parsed = JSON.parse(storedValue)
    
    // Handle date conversion for saved queries
    if (key === STORAGE_KEY_SAVED_QUERIES) {
      return parsed.map((query: any) => ({
        ...query,
        createdAt: new Date(query.createdAt),
        updatedAt: new Date(query.updatedAt)
      })) as T
    }
    
    // Handle date conversion for query history
    if (key === STORAGE_KEY_QUERY_HISTORY) {
      return parsed.map((entry: any) => ({
        ...entry,
        timestamp: new Date(entry.timestamp)
      })) as T
    }
    
    return parsed as T
  } catch (error) {
    console.error(`Error parsing stored value for ${key}:`, error)
    return defaultValue
  }
}

// Helper to safely stringify and save JSON to localStorage
const saveToLocalStorage = (key: string, value: any): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error(`Error saving value to ${key}:`, error)
  }
}

export const useQueriesStore = defineStore('queries', () => {
  // State
  const savedQueries = ref<SavedQuery[]>(safeParseJSON<SavedQuery[]>(STORAGE_KEY_SAVED_QUERIES, []))
  const queryHistory = ref<QueryHistoryEntry[]>(safeParseJSON<QueryHistoryEntry[]>(STORAGE_KEY_QUERY_HISTORY, []))
  const currentQuery = ref<string>(safeParseJSON<string>(STORAGE_KEY_CURRENT_QUERY, ''))
  const currentVariables = ref<QueryVariables>({})
  const currentResult = ref<QueryResult | null>(null)
  const isExecuting = ref<boolean>(false)
  const executionError = ref<string | null>(null)
  
  // Computed properties
  const queriesForCurrentConnection = computed(() => (connectionId: string) => {
    return savedQueries.value
      .filter(query => query.connectionId === connectionId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  })
  
  const historyForCurrentConnection = computed(() => (connectionId: string) => {
    return queryHistory.value
      .filter(entry => entry.connectionId === connectionId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  })
  
  // Persist state to localStorage when it changes
  watch(savedQueries, (newSavedQueries) => {
    saveToLocalStorage(STORAGE_KEY_SAVED_QUERIES, newSavedQueries)
  }, { deep: true })
  
  watch(queryHistory, (newQueryHistory) => {
    // Limit history size to prevent localStorage from growing too large
    const limitedHistory = newQueryHistory.slice(0, 100)
    saveToLocalStorage(STORAGE_KEY_QUERY_HISTORY, limitedHistory)
  }, { deep: true })
  
  watch(currentQuery, (newCurrentQuery) => {
    saveToLocalStorage(STORAGE_KEY_CURRENT_QUERY, newCurrentQuery)
  })
  
  // Actions
  function setCurrentQuery(query: string) {
    currentQuery.value = query
  }
  
  function setCurrentVariables(variables: QueryVariables) {
    currentVariables.value = variables
  }
  
  function setCurrentResult(result: QueryResult | null) {
    currentResult.value = result
  }
  
  function setExecutionStatus(status: boolean, error: string | null = null) {
    isExecuting.value = status
    executionError.value = error
  }
  
  function saveQuery(name: string, description: string = '', connectionId: string) {
    const id = crypto.randomUUID()
    const now = new Date()
    
    const newQuery: SavedQuery = {
      id,
      name,
      description,
      query: currentQuery.value,
      variables: currentVariables.value,
      connectionId,
      createdAt: now,
      updatedAt: now
    }
    
    savedQueries.value.push(newQuery)
    
    return id
  }
  
  function updateSavedQuery(id: string, updates: Partial<Omit<SavedQuery, 'id' | 'createdAt'>>) {
    const index = savedQueries.value.findIndex(query => query.id === id)
    if (index === -1) return false
    
    savedQueries.value[index] = {
      ...savedQueries.value[index],
      ...updates,
      updatedAt: new Date()
    }
    
    return true
  }
  
  function deleteSavedQuery(id: string) {
    const index = savedQueries.value.findIndex(query => query.id === id)
    if (index === -1) return false
    
    savedQueries.value.splice(index, 1)
    
    return true
  }
  
  function loadSavedQuery(id: string) {
    const query = savedQueries.value.find(q => q.id === id)
    if (!query) return false
    
    currentQuery.value = query.query
    currentVariables.value = query.variables
    
    return true
  }
  
  function addHistoryEntry(entry: Omit<QueryHistoryEntry, 'id' | 'timestamp'>) {
    const id = crypto.randomUUID()
    const timestamp = new Date()
    
    const newEntry: QueryHistoryEntry = {
      ...entry,
      id,
      timestamp
    }
    
    queryHistory.value.unshift(newEntry)
    
    // Limit history size
    if (queryHistory.value.length > 100) {
      queryHistory.value = queryHistory.value.slice(0, 100)
    }
    
    return id
  }
  
  function clearHistory() {
    queryHistory.value = []
  }
  
  function loadHistoryEntry(id: string) {
    const entry = queryHistory.value.find(e => e.id === id)
    if (!entry) return false
    
    currentQuery.value = entry.query
    currentVariables.value = entry.variables
    
    return true
  }
  
  return {
    // State
    savedQueries,
    queryHistory,
    currentQuery,
    currentVariables,
    currentResult,
    isExecuting,
    executionError,
    
    // Computed
    queriesForCurrentConnection,
    historyForCurrentConnection,
    
    // Actions
    setCurrentQuery,
    setCurrentVariables,
    setCurrentResult,
    setExecutionStatus,
    saveQuery,
    updateSavedQuery,
    deleteSavedQuery,
    loadSavedQuery,
    addHistoryEntry,
    clearHistory,
    loadHistoryEntry
  }
})
