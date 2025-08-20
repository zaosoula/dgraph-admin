// Types for GraphQL queries, variables, and results

export type QueryVariables = Record<string, any>

export type QueryResult = {
  data?: any
  errors?: Array<{
    message: string
    locations?: Array<{ line: number; column: number }>
    path?: string[]
    extensions?: Record<string, any>
  }>
  duration?: number
}

export type SavedQuery = {
  id: string
  name: string
  description?: string
  query: string
  variables: QueryVariables
  connectionId: string
  createdAt: Date
  updatedAt: Date
}

export type QueryHistoryEntry = {
  id: string
  query: string
  variables: QueryVariables
  result?: QueryResult
  connectionId: string
  timestamp: Date
  duration?: number
  status: 'success' | 'error' | 'pending'
}
