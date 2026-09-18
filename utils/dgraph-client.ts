import type { Connection, ConnectionCredentials, AuthCredentials, ConnectionTestResult, ConnectionTestCheckResult } from '@/types/connection'

// GraphQL schema type
export type GraphQLSchema = {
  schema: string
}

// Error type
export type DgraphError = {
  message: string
  code?: string
  details?: string
}

// Response type
export type DgraphResponse<T> = {
  data?: T
  error?: DgraphError
}

// Endpoints exposed by a Dgraph instance
export type DgraphEndpoint = 'admin' | 'graphql'

// Every request issued by the client is aborted after this many milliseconds
export const REQUEST_TIMEOUT_MS = 15000

// Shape of the GraphQL envelope returned by both endpoints
type GraphQLErrorEntry = {
  message?: string
  extensions?: {
    code?: string
  }
}

type GraphQLResponseBody<T> = {
  data?: T
  errors?: GraphQLErrorEntry[]
}

const UNAUTHORIZED_MESSAGE_PATTERN = /unauthori[sz]ed|unauthenticated|not authori[sz]ed|permission denied|forbidden|invalid (?:api ?key|token|credentials)|authentication (?:failed|required)/i

// Derive an error code from a GraphQL errors payload, so callers can detect auth failures
const getGraphQLErrorCode = (errors: GraphQLErrorEntry[]): string | undefined => {
  for (const entry of errors) {
    if (entry.extensions?.code === 'ErrorUnauthorized') {
      return 'ErrorUnauthorized'
    }

    if (entry.message && UNAUTHORIZED_MESSAGE_PATTERN.test(entry.message)) {
      return 'AUTH_ERROR'
    }
  }

  return undefined
}

// Human readable description of a thrown request error, including aborts
const describeError = (error: unknown): string => {
  if (error instanceof Error && error.name === 'AbortError') {
    return `Request timed out after ${REQUEST_TIMEOUT_MS}ms`
  }

  return error instanceof Error ? error.message : String(error)
}

export class DgraphClient {
  private connection: Connection
  private graphqlHeaders: Record<string, string> = {}
  private adminHeaders: Record<string, string> = {}

  constructor(connection: Connection) {
    this.connection = connection
    this.setupHeaders()
  }

  private setupHeaders() {
    // Base headers
    this.graphqlHeaders = {
      'Content-Type': 'application/json',
    }

    this.adminHeaders = {
      'Content-Type': 'application/json',
    }

    // Add authentication headers based on credentials
    const { credentials } = this.connection

    // Setup GraphQL endpoint headers
    this.setupAuthHeaders(credentials.graphql, this.graphqlHeaders)

    // Setup Admin endpoint headers
    this.setupAuthHeaders(credentials.admin, this.adminHeaders)
  }

  private setupAuthHeaders(authCredentials: AuthCredentials, headers: Record<string, string>) {
    // Skip if no authentication is required
    if (authCredentials.method === 'none') {
      return
    }

    // Apply the appropriate authentication method
    switch (authCredentials.method) {
      case 'api-key':
        if (authCredentials.apiKey) {
          headers['X-Dgraph-ApiKey'] = authCredentials.apiKey
        }
        break

      case 'auth-token':
        if (authCredentials.authToken) {
          headers['X-Dgraph-AuthToken'] = authCredentials.authToken
        }
        break

      case 'dg-auth':
        if (authCredentials.dgAuth) {
          headers['DG-Auth'] = authCredentials.dgAuth
        }
        break

      case 'token':
        if (authCredentials.token) {
          headers['Authorization'] = `Bearer ${authCredentials.token}`
        }
        break

      case 'basic':
        if (authCredentials.username && authCredentials.password) {
          const base64Credentials = btoa(`${authCredentials.username}:${authCredentials.password}`)
          headers['Authorization'] = `Basic ${base64Credentials}`
        }
        break
    }
  }

  // Get headers for a given endpoint
  private getHeaders(endpoint: DgraphEndpoint): Record<string, string> {
    return endpoint === 'admin' ? this.adminHeaders : this.graphqlHeaders
  }

  // Get the base URL for API requests, tolerating trailing slashes on the stored URL
  private getBaseUrl(endpoint: DgraphEndpoint): string {
    return `${this.connection.url.replace(/\/+$/, '')}/${endpoint}`
  }

  // POST a JSON body to an endpoint, aborting the request after REQUEST_TIMEOUT_MS
  private async postJson(endpoint: DgraphEndpoint, body: unknown): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      return await fetch(this.getBaseUrl(endpoint), {
        method: 'POST',
        headers: this.getHeaders(endpoint),
        body: JSON.stringify(body),
        signal: controller.signal
      })
    } finally {
      clearTimeout(timeoutId)
    }
  }

  // Build a structured error from a non-OK HTTP response
  private async buildHttpError(response: Response, message: string): Promise<DgraphError> {
    let body = ''

    try {
      body = await response.text()
    } catch {
      body = ''
    }

    return {
      message,
      code: response.status === 401 || response.status === 403 ? 'AUTH_ERROR' : 'HTTP_ERROR',
      details: `HTTP ${response.status} ${response.statusText}${body ? `: ${body.slice(0, 500)}` : ''}`
    }
  }

  // Execute a GraphQL document against one of the endpoints
  private async executeGraphQL<T>(
    endpoint: DgraphEndpoint,
    message: string,
    query: string,
    variables?: Record<string, unknown>
  ): Promise<DgraphResponse<T>> {
    try {
      const response = await this.postJson(endpoint, { query, variables })

      if (!response.ok) {
        return { error: await this.buildHttpError(response, message) }
      }

      const body = await response.json() as GraphQLResponseBody<T>

      if (body.errors && body.errors.length > 0) {
        return {
          error: {
            message,
            code: getGraphQLErrorCode(body.errors),
            details: JSON.stringify(body.errors)
          }
        }
      }

      return { data: body.data as T }
    } catch (error) {
      return {
        error: {
          message,
          code: error instanceof Error && error.name === 'AbortError' ? 'TIMEOUT' : undefined,
          details: describeError(error)
        }
      }
    }
  }
  
  // Test connection with detailed results
  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now()
    
    try {
      // Execute all three checks in parallel
      const [adminHealth, adminSchemaRead, clientIntrospection] = await Promise.allSettled([
        this.testAdminHealth(),
        this.testAdminSchemaRead(),
        this.testClientIntrospection()
      ])
      
      const totalTime = Date.now() - startTime
      
      // Extract results from Promise.allSettled
      const adminHealthResult = adminHealth.status === 'fulfilled' 
        ? adminHealth.value 
        : {
            success: false,
            responseTime: 0,
            error: `Admin health check failed: ${adminHealth.reason}`,
            timestamp: new Date()
          }
      
      const adminSchemaReadResult = adminSchemaRead.status === 'fulfilled'
        ? adminSchemaRead.value
        : {
            success: false,
            responseTime: 0,
            error: `Admin schema read failed: ${adminSchemaRead.reason}`,
            timestamp: new Date()
          }
      
      const clientIntrospectionResult = clientIntrospection.status === 'fulfilled'
        ? clientIntrospection.value
        : {
            success: false,
            responseTime: 0,
            error: `Client introspection failed: ${clientIntrospection.reason}`,
            timestamp: new Date()
          }
      
      // Determine overall success - at least admin health should work for basic connectivity
      const overallSuccess = adminHealthResult.success
      
      return {
        adminHealth: adminHealthResult,
        adminSchemaRead: adminSchemaReadResult,
        clientIntrospection: clientIntrospectionResult,
        overallSuccess,
        totalTime
      }
    } catch (error) {
      console.error('Connection test failed:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      const timestamp = new Date()
      
      return {
        adminHealth: {
          success: false,
          responseTime: 0,
          error: `Admin health check failed: ${errorMessage}`,
          timestamp
        },
        adminSchemaRead: {
          success: false,
          responseTime: 0,
          error: `Admin schema read failed: ${errorMessage}`,
          timestamp
        },
        clientIntrospection: {
          success: false,
          responseTime: 0,
          error: `Client introspection failed: ${errorMessage}`,
          timestamp
        },
        overallSuccess: false,
        totalTime: Date.now() - startTime
      }
    }
  }

  // Execute GraphQL query against the admin endpoint
  async executeAdminQuery<T>(query: string, variables?: Record<string, unknown>): Promise<DgraphResponse<T>> {
    return this.executeGraphQL<T>('admin', 'Admin GraphQL query execution failed', query, variables)
  }

  // Get GraphQL schema
  async getSchema(): Promise<DgraphResponse<GraphQLSchema>> {
    try {
      // Using the correct GraphQL query to get schema from /admin endpoint
      const query = `
        {
          getGQLSchema {
            schema
          }
        }
      `;

      const result = await this.executeAdminQuery<{ getGQLSchema: { schema: string } }>(query);

      if (result.error) {
        return {
          error: {
            message: 'Failed to fetch schema',
            code: result.error.code,
            details: result.error.details || result.error.message
          }
        };
      }

      // Extract schema from the response
      const schema = result.data?.getGQLSchema?.schema || '';
      return { data: { schema } };
    } catch (error) {
      return {
        error: {
          message: 'Failed to fetch schema',
          details: describeError(error)
        }
      };
    }
  }

  // Update GraphQL schema
  async updateSchema(schema: string): Promise<DgraphResponse<{ success: boolean }>> {
    try {
      // Using the correct GraphQL mutation to update schema from /admin endpoint
      const mutation = `
        mutation UpdateGQLSchema($input: UpdateGQLSchemaInput!) {
          updateGQLSchema(input: $input) {
            gqlSchema {
              schema
            }
          }
        }
      `;

      const variables = {
        input: {
          set: {
            schema
          }
        }
      };

      const result = await this.executeAdminQuery<{ updateGQLSchema: { gqlSchema: { schema: string } } }>(mutation, variables);

      if (result.error) {
        return {
          error: {
            message: 'Failed to update schema',
            code: result.error.code,
            details: result.error.details || result.error.message
          }
        };
      }

      return { data: { success: true } };
    } catch (error) {
      return {
        error: {
          message: 'Failed to update schema',
          details: describeError(error)
        }
      };
    }
  }

  // Execute GraphQL query
  async executeQuery<T>(query: string, variables?: Record<string, unknown>): Promise<DgraphResponse<T>> {
    return this.executeGraphQL<T>('graphql', 'GraphQL query execution failed', query, variables)
  }

  // Test admin endpoint health
  async testAdminHealth(): Promise<ConnectionTestCheckResult> {
    const startTime = Date.now()
    const timestamp = new Date()
    
    try {
      const response = await this.postJson('admin', { query: '{ __typename }' })
      
      const responseTime = Date.now() - startTime
      
      if (!response.ok) {
        return {
          success: false,
          responseTime,
          error: `Admin health check failed: ${response.status} ${response.statusText}`,
          timestamp
        }
      }
      
      // Dgraph answers many auth failures with HTTP 200 and a GraphQL errors array
      let body: GraphQLResponseBody<unknown> | null = null
      
      try {
        body = await response.json() as GraphQLResponseBody<unknown>
      } catch {
        body = null
      }
      
      if (body?.errors && body.errors.length > 0) {
        const details = body.errors
          .map(entry => entry.message)
          .filter(message => Boolean(message))
          .join('; ') || JSON.stringify(body.errors)
        
        return {
          success: false,
          responseTime,
          error: `Admin health check failed: ${details}`,
          timestamp
        }
      }
      
      return {
        success: true,
        responseTime,
        error: null,
        timestamp
      }
    } catch (error) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: `Admin health check failed: ${describeError(error)}`,
        timestamp
      }
    }
  }

  // Test admin schema read capability
  async testAdminSchemaRead(): Promise<ConnectionTestCheckResult> {
    const startTime = Date.now()
    const timestamp = new Date()
    
    try {
      const result = await this.getSchema()
      const responseTime = Date.now() - startTime
      
      if (result.error) {
        return {
          success: false,
          responseTime,
          error: `Admin schema read failed: ${result.error.message}`,
          timestamp
        }
      }
      
      const hasSchema = Boolean(result.data?.schema && result.data.schema.length > 0)
      return {
        success: hasSchema,
        responseTime,
        error: hasSchema ? null : 'Admin schema read failed: No schema returned',
        timestamp
      }
    } catch (error) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: `Admin schema read failed: ${describeError(error)}`,
        timestamp
      }
    }
  }

  // Test client introspection capability
  async testClientIntrospection(): Promise<ConnectionTestCheckResult> {
    const startTime = Date.now()
    const timestamp = new Date()
    
    try {
      // Standard GraphQL introspection query
      const introspectionQuery = `
        query IntrospectionQuery {
          __schema {
            queryType { name }
            mutationType { name }
            subscriptionType { name }
            types {
              ...FullType
            }
          }
        }
        
        fragment FullType on __Type {
          kind
          name
          description
          fields(includeDeprecated: true) {
            name
            description
            args {
              ...InputValue
            }
            type {
              ...TypeRef
            }
            isDeprecated
            deprecationReason
          }
          inputFields {
            ...InputValue
          }
          interfaces {
            ...TypeRef
          }
          enumValues(includeDeprecated: true) {
            name
            description
            isDeprecated
            deprecationReason
          }
          possibleTypes {
            ...TypeRef
          }
        }
        
        fragment InputValue on __InputValue {
          name
          description
          type { ...TypeRef }
          defaultValue
        }
        
        fragment TypeRef on __Type {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                    ofType {
                      kind
                      name
                      ofType {
                        kind
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `
      
      const result = await this.executeQuery<{ __schema?: unknown }>(introspectionQuery)
      const responseTime = Date.now() - startTime
      
      if (result.error) {
        return {
          success: false,
          responseTime,
          error: `Client introspection failed: ${result.error.message}`,
          timestamp
        }
      }
      
      const hasSchema = Boolean(result.data?.__schema)
      return {
        success: hasSchema,
        responseTime,
        error: hasSchema ? null : 'Client introspection failed: No schema returned',
        timestamp
      }
    } catch (error) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: `Client introspection failed: ${describeError(error)}`,
        timestamp
      }
    }
  }
}
