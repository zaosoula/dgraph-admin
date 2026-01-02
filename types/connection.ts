export type ConnectionType = 'http' | 'grpc'

export const ENVIRONMENTS = {
  DEVELOPMENT: 'Development',
  PRODUCTION: 'Production'
} as const

export type Environment = typeof ENVIRONMENTS[keyof typeof ENVIRONMENTS]

export type AuthMethod = 'none' | 'basic' | 'token' | 'api-key' | 'auth-token' | 'dg-auth'

export type AuthCredentials = {
  method: AuthMethod
  username?: string
  password?: string
  apiKey?: string
  token?: string
  authToken?: string
  dgAuth?: string
}

export type ConnectionCredentials = {
  graphql: AuthCredentials
  admin: AuthCredentials
  useUnifiedAuth?: boolean
}

export type Connection = {
  id: string
  name: string
  type: ConnectionType
  url: string
  credentials: ConnectionCredentials
  isSecure: boolean
  environment?: Environment
  linkedProductionId?: string
  createdAt: Date
  updatedAt: Date
}

export type ConnectionTestCheckResult = {
  success: boolean
  responseTime: number
  error: string | null
  timestamp: Date
}

export type ConnectionTestResult = {
  adminHealth: ConnectionTestCheckResult
  adminSchemaRead: ConnectionTestCheckResult
  clientIntrospection: ConnectionTestCheckResult
  overallSuccess: boolean
  totalTime: number
}

export type ConnectionState = {
  isConnected: boolean
  isLoading: boolean
  error: string | null
  lastChecked: Date | null
  testResults?: ConnectionTestResult
}
