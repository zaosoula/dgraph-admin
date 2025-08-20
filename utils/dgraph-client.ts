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

export class DgraphClient {
  private connection: Connection
  private headers: Record<string, string> = {}
  
  constructor(connection: Connection) {
    this.connection = connection
    this.setupHeaders()
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
    
    if (credentials.token) {
      this.headers['Authorization'] = `Bearer ${credentials.token}`
    }
    
    if (credentials.username && credentials.password) {
      const base64Credentials = btoa(`${credentials.username}:${credentials.password}`)
      this.headers['Authorization'] = `Basic ${base64Credentials}`
    }
  }
  
  // Test connection
  async testConnection(): Promise<boolean> {
    try {
      // First try the health endpoint
      try {
        const healthResponse = await fetch(`${this.connection.url}/health`, {
          method: 'GET',
          headers: this.headers
        });
        
        if (healthResponse.ok) {
          return true;
        }
      } catch (healthError) {
        console.debug('Health endpoint check failed, trying admin endpoint:', healthError);
      }
      
      // If health endpoint fails, try the admin endpoint with a simple query
      const query = `{ __typename }`;
      
      const adminResponse = await fetch(`${this.connection.url}/admin`, {
        method: 'POST',
        headers: {
          ...this.headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      });
      
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
      
      const response = await fetch(`${this.connection.url}/admin`, {
        method: 'POST',
        headers: {
          ...this.headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      });
      
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
      
      const response = await fetch(`${this.connection.url}/admin`, {
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
      const response = await fetch(`${this.connection.url}/graphql`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          query,
          variables
        })
      })
      
      const data = await response.json()
      
      if (data.errors) {
        return {
          error: {
            message: 'GraphQL query execution failed',
            details: JSON.stringify(data.errors)
          }
        }
      }
      
      return { data: data.data as T }
    } catch (error) {
      return {
        error: {
          message: 'GraphQL query execution failed',
          details: error instanceof Error ? error.message : String(error)
        }
      }
    }
  }
}
