import type { Connection, ConnectionCredentials } from '@/types/connection'

// GraphQL schema type
export type GraphQLSchema = {
  schema: string
}

// Error type
export type DgraphError = {
  message: string
  code?: string
  details?: string
  originalErrors?: any[]
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
  private headers: Record<string, string> = {}
  private useProxy: boolean = true
  
  constructor(connection: Connection) {
    this.connection = connection
    this.setupHeaders()
  }
  
  // Helper method to process GraphQL errors
  private processGraphQLErrors(errors: any[], operation: string): DgraphError {
    // Check for authentication errors
    const authErrors = errors.filter(err => 
      err.message?.includes('X-Dgraph-AuthToken') || 
      (err.extensions?.code === 'ErrorUnauthorized')
    );
    
    if (authErrors.length > 0) {
      return {
        message: `Authentication Error: ${authErrors[0].message}`,
        code: authErrors[0].extensions?.code || 'AUTH_ERROR',
        details: JSON.stringify(errors),
        originalErrors: errors
      };
    }
    
    // Default error handling
    return {
      message: `Failed to ${operation}`,
      code: errors[0]?.extensions?.code || 'GRAPHQL_ERROR',
      details: JSON.stringify(errors),
      originalErrors: errors
    };
  }
  
  private setupHeaders() {
    this.headers = {
      'Content-Type': 'application/json',
    }
    
    // Add authentication headers based on credentials
    const { credentials } = this.connection
    
    if (credentials.apiKey) {
      this.headers['X-Dgraph-ApiKey'] = credentials.apiKey
    }
    
    if (credentials.authToken) {
      this.headers['X-Dgraph-AuthToken'] = credentials.authToken
    }
    
    if (credentials.token) {
      this.headers['Authorization'] = `Bearer ${credentials.token}`
    }
    
    if (credentials.username && credentials.password) {
      const base64Credentials = btoa(`${credentials.username}:${credentials.password}`)
      this.headers['Authorization'] = `Basic ${base64Credentials}`
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
          headers: this.headers
        });
        
        if (this.useProxy) {
          const proxyData = await healthResponse.json() as ProxyResponse<any>;
          if (proxyData.status >= 200 && proxyData.status < 300) {
            return true;
          }
        } else if (healthResponse.ok) {
          return true;
        }
      } catch (healthError) {
        console.debug('Health endpoint check failed, trying admin endpoint:', healthError);
      }
      
      // If health endpoint fails, try the admin endpoint with a simple query
      const query = `{ __typename }`;
      const adminUrl = this.getBaseUrl('admin');
      
      const adminResponse = await fetch(adminUrl, {
        method: 'POST',
        headers: {
          ...this.headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      });
      
      if (this.useProxy) {
        const proxyData = await adminResponse.json() as ProxyResponse<any>;
        return proxyData.status >= 200 && proxyData.status < 300;
      }
      
      return adminResponse.ok;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
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
      
      const url = this.getBaseUrl('admin');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...this.headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      });
      
      if (this.useProxy) {
        const proxyResponse = await response.json() as ProxyResponse<any>;
        
        if (proxyResponse.error) {
          return {
            error: {
              message: 'Failed to fetch schema',
              details: proxyResponse.error.message,
              code: proxyResponse.error.code
            }
          };
        }
        
        if (proxyResponse.status >= 400) {
          return {
            error: {
              message: 'Failed to fetch schema',
              details: `Status: ${proxyResponse.status} ${proxyResponse.statusText}`,
              code: 'HTTP_ERROR'
            }
          };
        }
        
        const data = proxyResponse.data;
        
        // Check for GraphQL errors
        if (data.errors) {
          return {
            error: this.processGraphQLErrors(data.errors, 'fetch schema')
          };
        }
        
        // Extract schema from the response
        const schema = data.data?.getGQLSchema?.schema || '';
        return { data: { schema } };
      } else {
        if (!response.ok) {
          const errorText = await response.text();
          return {
            error: {
              message: 'Failed to fetch schema',
              details: errorText,
              code: 'HTTP_ERROR'
            }
          };
        }
        
        const data = await response.json();
        
        // Check for GraphQL errors
        if (data.errors) {
          return {
            error: this.processGraphQLErrors(data.errors, 'fetch schema')
          };
        }
        
        // Extract schema from the response
        const schema = data.data?.getGQLSchema?.schema || '';
        return { data: { schema } };
      }
    } catch (error) {
      return {
        error: {
          message: 'Failed to fetch schema',
          details: error instanceof Error ? error.message : String(error),
          code: 'UNKNOWN_ERROR'
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
      
      const url = this.getBaseUrl('admin');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...this.headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: mutation,
          variables
        })
      });
      
      if (this.useProxy) {
        const proxyResponse = await response.json() as ProxyResponse<any>;
        
        if (proxyResponse.error) {
          return {
            error: {
              message: 'Failed to update schema',
              details: proxyResponse.error.message,
              code: proxyResponse.error.code
            }
          };
        }
        
        if (proxyResponse.status >= 400) {
          return {
            error: {
              message: 'Failed to update schema',
              details: `Status: ${proxyResponse.status} ${proxyResponse.statusText}`,
              code: 'HTTP_ERROR'
            }
          };
        }
        
        const data = proxyResponse.data;
        
        // Check for GraphQL errors
        if (data.errors) {
          return {
            error: this.processGraphQLErrors(data.errors, 'update schema')
          };
        }
        
        return { data: { success: true } };
      } else {
        if (!response.ok) {
          const errorText = await response.text();
          return {
            error: {
              message: 'Failed to update schema',
              details: errorText,
              code: 'HTTP_ERROR'
            }
          };
        }
        
        const data = await response.json();
        
        // Check for GraphQL errors
        if (data.errors) {
          return {
            error: this.processGraphQLErrors(data.errors, 'update schema')
          };
        }
        
        return { data: { success: true } };
      }
    } catch (error) {
      return {
        error: {
          message: 'Failed to update schema',
          details: error instanceof Error ? error.message : String(error),
          code: 'UNKNOWN_ERROR'
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
        headers: this.headers,
        body: JSON.stringify({
          query,
          variables
        })
      });
      
      if (this.useProxy) {
        const proxyResponse = await response.json() as ProxyResponse<any>;
        
        if (proxyResponse.error) {
          return {
            error: {
              message: 'GraphQL query execution failed',
              details: proxyResponse.error.message,
              code: proxyResponse.error.code
            }
          };
        }
        
        if (proxyResponse.status >= 400) {
          return {
            error: {
              message: 'GraphQL query execution failed',
              details: `Status: ${proxyResponse.status} ${proxyResponse.statusText}`,
              code: 'HTTP_ERROR'
            }
          };
        }
        
        const data = proxyResponse.data;
        
        if (data.errors) {
          return {
            error: this.processGraphQLErrors(data.errors, 'execute query')
          };
        }
        
        return { data: data.data as T };
      } else {
        const data = await response.json();
        
        if (data.errors) {
          return {
            error: this.processGraphQLErrors(data.errors, 'execute query')
          };
        }
        
        return { data: data.data as T };
      }
    } catch (error) {
      return {
        error: {
          message: 'GraphQL query execution failed',
          details: error instanceof Error ? error.message : String(error),
          code: 'UNKNOWN_ERROR'
        }
      };
    }
  }
}

