export type ConnectionType = 'http' | 'grpc'

export type AuthMethod = 'basic' | 'apiKey' | 'accessToken' | 'authToken' | 'jwt' | 'xAuthToken'

export type ConnectionCredentials = {
  // Authentication method to use
  authMethod?: AuthMethod
  
  // Basic Auth
  username?: string
  password?: string
  
  // API Key (X-Dgraph-ApiKey)
  apiKey?: string
  
  // Access Token (Authorization: Bearer)
  token?: string
  
  // Auth Token (X-Dgraph-AuthToken) - Used when ACL is enabled
  authToken?: string
  
  // X-Auth-Token - Used when anonymous access is disabled
  xAuthToken?: string
  
  // JWT - Used with Dgraph.Authorization
  jwt?: string
  jwtHeader?: string // Custom header name for JWT
}

export type Connection = {
  id: string
  name: string
  type: ConnectionType
  url: string
  credentials: ConnectionCredentials
  isSecure: boolean
  createdAt: Date
  updatedAt: Date
}

export type ConnectionState = {
  isConnected: boolean
  isLoading: boolean
  error: string | null
  lastChecked: Date | null
}
