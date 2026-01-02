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
  success?: boolean
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

  // Get headers based on endpoint
  private getHeaders(endpoint: string): Record<string, string> {
    if (endpoint.includes('admin')) {
      return this.adminHeaders
    }
    return this.graphqlHeaders
  }

  // Get the base URL for API requests (using proxy or direct)
  private getBaseUrl(endpoint: string): string {
    return `${this.connection.url}/${endpoint}`
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
  async executeAdminQuery<T>(query: string, variables?: Record<string, any>): Promise<DgraphResponse<T>> {
    try {
      const url = this.getBaseUrl('admin');
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders('admin'),
        body: JSON.stringify({
          query,
          variables
        })
      });

      const data = await response.json();

      if (data.errors) {
        return {
          error: {
            message: 'Admin GraphQL query execution failed',
            details: JSON.stringify(data.errors)
          }
        };
      }

      return { data: data.data as T };
    } catch (error) {
      return {
        error: {
          message: 'Admin GraphQL query execution failed',
          details: error instanceof Error ? error.message : String(error)
        }
      };
    }
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
          details: error instanceof Error ? error.message : String(error)
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
            details: result.error.details || result.error.message
          }
        };
      }

      return { data: { success: true } };
    } catch (error) {
      return {
        error: {
          message: 'Failed to update schema',
          details: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  // Execute GraphQL query
  async executeQuery<T>(query: string, variables?: Record<string, any>): Promise<DgraphResponse<T>> {
    try {
      const url = this.getBaseUrl('graphql');
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders('graphql'),
        body: JSON.stringify({
          query,
          variables
        })
      });

      const data = await response.json();

      if (data.errors) {
        return {
          error: {
            message: 'GraphQL query execution failed',
            details: JSON.stringify(data.errors)
          }
        };
      }

      return { data: data.data as T, success: true };
    } catch (error) {
      return {
        error: {
          message: 'GraphQL query execution failed',
          details: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  // Execute DQL query against the /query endpoint
  async executeDQLQuery<T>(query: string): Promise<DgraphResponse<T>> {
    try {
      const url = this.getBaseUrl('query');
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders('query'),
        body: JSON.stringify({
          query
        })
      });

      const data = await response.json();

      if (data.errors) {
        return {
          error: {
            message: 'DQL query execution failed',
            details: JSON.stringify(data.errors)
          }
        };
      }

      return { 
        data: data as T,
        success: true 
      };
    } catch (error) {
      return {
        error: {
          message: 'DQL query execution failed',
          details: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  // Test admin endpoint health
  async testAdminHealth(): Promise<ConnectionTestCheckResult> {
    const startTime = Date.now()
    const timestamp = new Date()
    
    try {
      const url = this.getBaseUrl('admin')
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders('admin'),
        body: JSON.stringify({
          query: '{ __typename }'
        })
      })
      
      const responseTime = Date.now() - startTime
      
      const success = response.ok
        return {
          success,
          responseTime,
          error: success ? null : `Admin health check failed: ${response.status} ${response.statusText}`,
          timestamp
        }
    } catch (error) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: `Admin health check failed: ${error instanceof Error ? error.message : String(error)}`,
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
      
      const hasSchema = result.data?.schema && result.data.schema.length > 0
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
        error: `Admin schema read failed: ${error instanceof Error ? error.message : String(error)}`,
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
      
      const result = await this.executeQuery(introspectionQuery)
      const responseTime = Date.now() - startTime
      
      if (result.error) {
        return {
          success: false,
          responseTime,
          error: `Client introspection failed: ${result.error.message}`,
          timestamp
        }
      }
      
      const hasSchema = result.data && (result.data as any).__schema
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
        error: `Client introspection failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp
      }
    }
  }
}
