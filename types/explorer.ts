export type QueryResult = {
  data: any
  metadata: {
    executionTime: number
    rowCount: number
    queryType: string
  }
  success: boolean
  error?: string
}

export type QueryHistoryItem = {
  id: string
  query: string
  timestamp: Date
  success: boolean
  executionTime?: number
}

export type QueryExecutionState = {
  isExecuting: boolean
  hasError: boolean
  errorMessage: string | null
}

export type DQLQuery = {
  query: string
  variables?: Record<string, any>
}

export type ViewMode = 'json' | 'table' | 'graph'

export type ExportFormat = 'json' | 'csv'

export type ExampleQuery = {
  id: string
  title: string
  description: string
  query: string
  category: 'basic' | 'advanced' | 'aggregation'
}
