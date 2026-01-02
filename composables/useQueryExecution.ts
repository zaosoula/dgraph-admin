import { ref, computed } from 'vue'
import type { QueryResult, QueryHistoryItem, QueryExecutionState, DQLQuery } from '@/types/explorer'
import { useDgraphClient } from '@/composables/useDgraphClient'

export const useQueryExecution = () => {
  const { executeQuery } = useDgraphClient()
  
  // Reactive state
  const queryResults = ref<QueryResult | null>(null)
  const queryHistory = ref<QueryHistoryItem[]>([])
  const executionState = ref<QueryExecutionState>({
    isExecuting: false,
    hasError: false,
    errorMessage: null
  })

  // Load query history from localStorage on initialization
  const loadQueryHistory = () => {
    try {
      const stored = localStorage.getItem('dgraph-query-history')
      if (stored) {
        const parsed = JSON.parse(stored)
        queryHistory.value = parsed.map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp)
        }))
      }
    } catch (error) {
      console.warn('Failed to load query history from localStorage:', error)
    }
  }

  // Save query history to localStorage
  const saveQueryHistory = () => {
    try {
      localStorage.setItem('dgraph-query-history', JSON.stringify(queryHistory.value))
    } catch (error) {
      console.warn('Failed to save query history to localStorage:', error)
    }
  }

  // Add query to history
  const addToHistory = (query: string, success: boolean, executionTime?: number) => {
    const historyItem: QueryHistoryItem = {
      id: Date.now().toString(),
      query: query.trim(),
      timestamp: new Date(),
      success,
      executionTime
    }
    
    // Add to beginning of array and limit to 50 items
    queryHistory.value.unshift(historyItem)
    if (queryHistory.value.length > 50) {
      queryHistory.value = queryHistory.value.slice(0, 50)
    }
    
    saveQueryHistory()
  }

  // Execute DQL query
  const executeQueryWithHistory = async (queryInput: string): Promise<QueryResult> => {
    if (!queryInput.trim()) {
      throw new Error('Query cannot be empty')
    }

    executionState.value = {
      isExecuting: true,
      hasError: false,
      errorMessage: null
    }

    const startTime = Date.now()

    try {
      const result = await executeQuery(queryInput)
      const executionTime = Date.now() - startTime

      const queryResult: QueryResult = {
        data: result,
        metadata: {
          executionTime,
          rowCount: Array.isArray(result) ? result.length : result ? 1 : 0,
          queryType: detectQueryType(queryInput)
        },
        success: true
      }

      queryResults.value = queryResult
      addToHistory(queryInput, true, executionTime)
      
      executionState.value = {
        isExecuting: false,
        hasError: false,
        errorMessage: null
      }

      return queryResult
    } catch (error) {
      const executionTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      
      const queryResult: QueryResult = {
        data: null,
        metadata: {
          executionTime,
          rowCount: 0,
          queryType: detectQueryType(queryInput)
        },
        success: false,
        error: errorMessage
      }

      queryResults.value = queryResult
      addToHistory(queryInput, false, executionTime)
      
      executionState.value = {
        isExecuting: false,
        hasError: true,
        errorMessage
      }

      throw error
    }
  }

  // Detect query type based on query content
  const detectQueryType = (query: string): string => {
    const trimmedQuery = query.trim().toLowerCase()
    
    if (trimmedQuery.includes('mutation')) return 'mutation'
    if (trimmedQuery.includes('schema')) return 'schema'
    if (trimmedQuery.includes('func:')) return 'query'
    if (trimmedQuery.includes('count(')) return 'aggregation'
    
    return 'query'
  }

  // Clear query history
  const clearHistory = () => {
    queryHistory.value = []
    saveQueryHistory()
  }

  // Remove specific history item
  const removeHistoryItem = (id: string) => {
    queryHistory.value = queryHistory.value.filter(item => item.id !== id)
    saveQueryHistory()
  }

  // Clear current results
  const clearResults = () => {
    queryResults.value = null
    executionState.value = {
      isExecuting: false,
      hasError: false,
      errorMessage: null
    }
  }

  // Computed properties
  const isExecuting = computed(() => executionState.value.isExecuting)
  const hasError = computed(() => executionState.value.hasError)
  const errorMessage = computed(() => executionState.value.errorMessage)
  const hasResults = computed(() => queryResults.value !== null)
  const successfulQueries = computed(() => 
    queryHistory.value.filter(item => item.success).length
  )

  // Initialize history on composable creation
  loadQueryHistory()

  return {
    // State
    queryResults: readonly(queryResults),
    queryHistory: readonly(queryHistory),
    executionState: readonly(executionState),
    
    // Computed
    isExecuting,
    hasError,
    errorMessage,
    hasResults,
    successfulQueries,
    
    // Methods
    executeQueryWithHistory,
    clearHistory,
    removeHistoryItem,
    clearResults,
    loadQueryHistory
  }
}
