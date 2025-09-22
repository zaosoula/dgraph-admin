import type { Connection, ConnectionCredentials, AuthCredentials } from '@/types/connection'

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

// Proxy response type
export type ProxyResponse<T> = {
  status: number
  statusText: string
  data: T
  error?: {
    message: string
    code: string
  }
}

export class DgraphClient {
  private connection: Connection
  private graphqlHeaders: Record<string, string> = {}
  private adminHeaders: Record<string, string> = {}
  private useProxy: boolean
  
  constructor(connection: Connection) {
    this.connection = connection
    // Use proxy configuration from connection, default to true for backward compatibility
    this.useProxy = connection.useProxy ?? true
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

  // Normalize response from either proxy or direct connection
  private async normalizeResponse(response: Response): Promise<{
    ok: boolean
    status: number
    statusText: string
    data: any
    error?: { message: string; code?: string }
  }> {
    if (this.useProxy) {
      const proxyResponse = await response.json() as ProxyResponse<any>
      
      return {
        ok: proxyResponse.status >= 200 && proxyResponse.status < 300,
        status: proxyResponse.status,
        statusText: proxyResponse.statusText,
        data: proxyResponse.data,
        error: proxyResponse.error
      }
    } else {
      const data = await response.json()
      
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        data,
        error: response.ok ? undefined : { message: `HTTP ${response.status}: ${response.statusText}` }
      }
    }
  }
  
  // Get the base URL for API requests (using proxy or direct)
  private getBaseUrl(endpoint: string): string {
    if (this.useProxy) {
      // Use the server proxy to avoid CORS issues
      return `/api/dgraph/${endpoint}?url=${encodeURIComponent(this.connection.url)}`
    } else {
      // Direct connection (may have CORS issues)
      return `${this.connection.url}/${endpoint}`
    }
  }
  
  // Test connection
  async testConnection(): Promise<boolean> {
    try {
      // First try the health endpoint
      try {
        const healthUrl = this.getBaseUrl('health');
        const healthResponse = await fetch(healthUrl, {
          method: 'GET',
          headers: this.getHeaders('health')
        });
        
        const normalizedResponse = await this.normalizeResponse(healthResponse);
        if (normalizedResponse.ok) {
          return true;
        }
      } catch (healthError) {
        console.debug('Health endpoint check failed, trying admin endpoint:', healthError);
      }
      
      // If health endpoint fails, try the admin endpoint with a simple query
      try {
        const result = await this.executeAdminQuery<any>('{ __typename }');
        return !result.error;
      } catch (adminError) {
        console.debug('Admin endpoint check failed, trying GraphQL endpoint:', adminError);
      }
      
      // If admin endpoint fails, try the GraphQL endpoint
      try {
        const result = await this.executeQuery<any>('{ __typename }');
        return !result.error;
      } catch (graphqlError) {
        console.debug('GraphQL endpoint check failed:', graphqlError);
      }
      
      return false;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
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
      
      const normalizedResponse = await this.normalizeResponse(response);
      
      if (normalizedResponse.error) {
        return {
          error: {
            message: 'Admin GraphQL query execution failed',
            details: normalizedResponse.error.message
          }
        };
      }
      
      if (!normalizedResponse.ok) {
        return {
          error: {
            message: 'Admin GraphQL query execution failed',
            details: `Status: ${normalizedResponse.status} ${normalizedResponse.statusText}`
          }
        };
      }
      
      const data = normalizedResponse.data;
      
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
      
      const normalizedResponse = await this.normalizeResponse(response);
      
      if (normalizedResponse.error) {
        return {
          error: {
            message: 'GraphQL query execution failed',
            details: normalizedResponse.error.message
          }
        };
      }
      
      if (!normalizedResponse.ok) {
        return {
          error: {
            message: 'GraphQL query execution failed',
            details: `Status: ${normalizedResponse.status} ${normalizedResponse.statusText}`
          }
        };
      }
      
      const data = normalizedResponse.data;
      
      if (data.errors) {
        return {
          error: {
            message: 'GraphQL query execution failed',
            details: JSON.stringify(data.errors)
          }
        };
      }
      
      return { data: data.data as T };
    } catch (error) {
      return {
        error: {
          message: 'GraphQL query execution failed',
          details: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }
}
