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
  private useProxy: boolean = true
  
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
    if (credentials.graphql.apiKey) {
      this.graphqlHeaders['X-Dgraph-ApiKey'] = credentials.graphql.apiKey
    }
    
    if (credentials.graphql.authToken) {
      this.graphqlHeaders['X-Dgraph-AuthToken'] = credentials.graphql.authToken
    }
    
    if (credentials.graphql.token) {
      this.graphqlHeaders['Authorization'] = `Bearer ${credentials.graphql.token}`
    }
    
    if (credentials.graphql.username && credentials.graphql.password) {
      const base64Credentials = btoa(`${credentials.graphql.username}:${credentials.graphql.password}`)
      this.graphqlHeaders['Authorization'] = `Basic ${base64Credentials}`
    }
    
    // Setup Admin endpoint headers
    if (credentials.admin.apiKey) {
      this.adminHeaders['X-Dgraph-ApiKey'] = credentials.admin.apiKey
    }
    
    if (credentials.admin.authToken) {
      this.adminHeaders['X-Dgraph-AuthToken'] = credentials.admin.authToken
    }
    
    if (credentials.admin.token) {
      this.adminHeaders['Authorization'] = `Bearer ${credentials.admin.token}`
    }
    
    if (credentials.admin.username && credentials.admin.password) {
      const base64Credentials = btoa(`${credentials.admin.username}:${credentials.admin.password}`)
      this.adminHeaders['Authorization'] = `Basic ${base64Credentials}`
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
        headers: this.getHeaders('admin'),
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
        headers: this.getHeaders('admin'),
        body: JSON.stringify({ query })
      });
      
      if (this.useProxy) {
        const proxyResponse = await response.json() as ProxyResponse<any>;
        
        if (proxyResponse.error) {
          return {
            error: {
              message: 'Failed to fetch schema',
              details: proxyResponse.error.message
            }
          };
        }
        
        if (proxyResponse.status >= 400) {
          return {
            error: {
              message: 'Failed to fetch schema',
              details: `Status: ${proxyResponse.status} ${proxyResponse.statusText}`
            }
          };
        }
        
        const data = proxyResponse.data;
        
        // Check for GraphQL errors
        if (data.errors) {
          return {
            error: {
              message: 'Failed to fetch schema',
              details: JSON.stringify(data.errors)
            }
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
              details: errorText
            }
          };
        }
        
        const data = await response.json();
        
        // Check for GraphQL errors
        if (data.errors) {
          return {
            error: {
              message: 'Failed to fetch schema',
              details: JSON.stringify(data.errors)
            }
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
      
      const url = this.getBaseUrl('admin');
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders('admin'),
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
              details: proxyResponse.error.message
            }
          };
        }
        
        if (proxyResponse.status >= 400) {
          return {
            error: {
              message: 'Failed to update schema',
              details: `Status: ${proxyResponse.status} ${proxyResponse.statusText}`
            }
          };
        }
        
        const data = proxyResponse.data;
        
        // Check for GraphQL errors
        if (data.errors) {
          return {
            error: {
              message: 'Failed to update schema',
              details: JSON.stringify(data.errors)
            }
          };
        }
        
        return { data: { success: true } };
      } else {
        if (!response.ok) {
          const errorText = await response.text();
          return {
            error: {
              message: 'Failed to update schema',
              details: errorText
            }
          };
        }
        
        const data = await response.json();
        
        // Check for GraphQL errors
        if (data.errors) {
          return {
            error: {
              message: 'Failed to update schema',
              details: JSON.stringify(data.errors)
            }
          };
        }
        
        return { data: { success: true } };
      }
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
      
      if (this.useProxy) {
        const proxyResponse = await response.json() as ProxyResponse<any>;
        
        if (proxyResponse.error) {
          return {
            error: {
              message: 'GraphQL query execution failed',
              details: proxyResponse.error.message
            }
          };
        }
        
        if (proxyResponse.status >= 400) {
          return {
            error: {
              message: 'GraphQL query execution failed',
              details: `Status: ${proxyResponse.status} ${proxyResponse.statusText}`
            }
          };
        }
        
        const data = proxyResponse.data;
        
        if (data.errors) {
          return {
            error: {
              message: 'GraphQL query execution failed',
              details: JSON.stringify(data.errors)
            }
          };
        }
        
        return { data: data.data as T };
      } else {
        const data = await response.json();
        
        if (data.errors) {
          return {
            error: {
              message: 'GraphQL query execution failed',
              details: JSON.stringify(data.errors)
            }
          };
        }
        
        return { data: data.data as T };
      }
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
