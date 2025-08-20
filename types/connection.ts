export type ConnectionType = 'http' | 'grpc'

export type ConnectionCredentials = {
  username?: string
  password?: string
  apiKey?: string
  token?: string
  authToken?: string
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
