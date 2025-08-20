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


// Connection test result type
export type ConnectionTestResult = {
  success: boolean;
  healthCheck: {
    success: boolean;
    message: string;
  };
  schemaCheck: {
    success: boolean;
    message: string;
  };
  introspectionCheck: {
    success: boolean;
    message: string;
  };
  message: string;
}
export class DgraphClient {
  private connection: Connection
  private headers: Record<string, string> = {}
  private useProxy: boolean = true

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

    // If authMethod is specified, use that specific method
    if (credentials.authMethod) {
      switch (credentials.authMethod) {
        case 'basic':
          if (credentials.username && credentials.password) {
            const base64Credentials = btoa(`${credentials.username}:${credentials.password}`)
            this.headers['Authorization'] = `Basic ${base64Credentials}`
          }
          break;

        case 'apiKey':
          if (credentials.apiKey) {
            this.headers['X-Dgraph-ApiKey'] = credentials.apiKey
          }
          break;

        case 'accessToken':
          if (credentials.token) {
            this.headers['Authorization'] = `Bearer ${credentials.token}`
          }
          break;

        case 'authToken':
          if (credentials.authToken) {
            this.headers['X-Dgraph-AuthToken'] = credentials.authToken
          }
          break;

        case 'xAuthToken':
          if (credentials.xAuthToken) {
            this.headers['X-Auth-Token'] = credentials.xAuthToken
          }
          break;

        case 'jwt':
          if (credentials.jwt) {
            // Use custom header if specified, otherwise use Authorization
            const headerName = credentials.jwtHeader || 'Authorization'
            this.headers[headerName] = credentials.jwt.startsWith('Bearer ')
              ? credentials.jwt
              : `Bearer ${credentials.jwt}`
          }
          break;
      }
    } else {
      // For backward compatibility, try all methods
      if (credentials.apiKey) {
        this.headers['X-Dgraph-ApiKey'] = credentials.apiKey
      }

      if (credentials.authToken) {
        this.headers['X-Dgraph-AuthToken'] = credentials.authToken
      }

      if (credentials.xAuthToken) {
        this.headers['X-Auth-Token'] = credentials.xAuthToken
      }

      if (credentials.token) {
        this.headers['Authorization'] = `Bearer ${credentials.token}`
      }

      if (credentials.username && credentials.password) {
        const base64Credentials = btoa(`${credentials.username}:${credentials.password}`)
        this.headers['Authorization'] = `Basic ${base64Credentials}`
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

  // Test connection with comprehensive checks
  async testConnection(connection?: Connection): Promise<ConnectionTestResult> {
    // Use provided connection or the instance's connection
    const conn = connection || this.connection;

    // If a new connection was provided, create a temporary client
    const client = connection ? new DgraphClient(connection) : this;

    const result: ConnectionTestResult = {
      success: false,
      healthCheck: {
        success: false,
        message: 'Not tested'
      },
      schemaCheck: {
        success: false,
        message: 'Not tested'
      },
      introspectionCheck: {
        success: false,
        message: 'Not tested'
      },
      message: 'Connection test failed'
    };

    try {
      // 1. Health Check
      try {
        const healthUrl = client.getBaseUrl('health');
        const healthResponse = await fetch(healthUrl, {
          method: 'GET',
          headers: client.headers
        });

        if (client.useProxy) {
          const proxyData = await healthResponse.json() as ProxyResponse<any>;
          result.healthCheck.success = proxyData.status >= 200 && proxyData.status < 300;
          result.healthCheck.message = result.healthCheck.success
            ? 'Health endpoint is accessible'
            : `Health endpoint returned status ${proxyData.status}: ${proxyData.statusText}`;
        } else {
          result.healthCheck.success = healthResponse.ok;
          result.healthCheck.message = result.healthCheck.success
            ? 'Health endpoint is accessible'
            : `Health endpoint returned status ${healthResponse.status}: ${healthResponse.statusText}`;
        }
      } catch (healthError) {
        result.healthCheck.success = false;
        result.healthCheck.message = `Health endpoint check failed: ${healthError instanceof Error ? healthError.message : String(healthError)}`;
      }

      // 2. Schema Check - Try to get the GraphQL schema
      try {
        const schemaQuery = `
          {
            getGQLSchema {
              schema
            }
          }
        `;

        const adminUrl = client.getBaseUrl('admin');
        const schemaResponse = await fetch(adminUrl, {
          method: 'POST',
          headers: {
            ...client.headers,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query: schemaQuery })
        });

        if (client.useProxy) {
          const proxyData = await schemaResponse.json() as ProxyResponse<any>;
          result.schemaCheck.success = proxyData.status >= 200 && proxyData.status < 300 &&
            proxyData.data?.data?.getGQLSchema?.schema;
          result.schemaCheck.message = result.schemaCheck.success
            ? 'Successfully retrieved GraphQL schema'
            : proxyData.error?.message || `Failed to retrieve schema: ${proxyData.statusText}`;
        } else {
          const data = await schemaResponse.json();
          result.schemaCheck.success = schemaResponse.ok && data?.data?.getGQLSchema?.schema;
          result.schemaCheck.message = result.schemaCheck.success
            ? 'Successfully retrieved GraphQL schema'
            : data?.errors?.[0]?.message || 'Failed to retrieve schema';
        }
      } catch (schemaError) {
        result.schemaCheck.success = false;
        result.schemaCheck.message = `Schema check failed: ${schemaError instanceof Error ? schemaError.message : String(schemaError)}`;
      }

      // 3. Introspection Query - Test GraphQL endpoint with introspection
      try {
        const introspectionQuery = `
          query {
            __schema {
              queryType {
                name
              }
            }
          }
        `;

        const graphqlUrl = client.getBaseUrl('graphql');
        const introspectionResponse = await fetch(graphqlUrl, {
          method: 'POST',
          headers: {
            ...client.headers,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query: introspectionQuery })
        });

        if (client.useProxy) {
          const proxyData = await introspectionResponse.json() as ProxyResponse<any>;
          result.introspectionCheck.success = proxyData.status >= 200 && proxyData.status < 300 &&
            proxyData.data?.data?.__schema?.queryType;
          result.introspectionCheck.message = result.introspectionCheck.success
            ? 'GraphQL introspection query successful'
            : proxyData.error?.message || `Introspection query failed: ${proxyData.statusText}`;
        } else {
          const data = await introspectionResponse.json();
          result.introspectionCheck.success = introspectionResponse.ok && data?.data?.__schema?.queryType;
          result.introspectionCheck.message = result.introspectionCheck.success
            ? 'GraphQL introspection query successful'
            : data?.errors?.[0]?.message || 'Introspection query failed';
        }
      } catch (introspectionError) {
        result.introspectionCheck.success = false;
        result.introspectionCheck.message = `Introspection check failed: ${introspectionError instanceof Error ? introspectionError.message : String(introspectionError)}`;
      }

      // Determine overall success
      result.success = result.healthCheck.success || result.schemaCheck.success || result.introspectionCheck.success;

      // Set overall message
      if (result.success) {
        const successfulChecks = [
          result.healthCheck.success ? 'health' : null,
          result.schemaCheck.success ? 'schema' : null,
          result.introspectionCheck.success ? 'introspection' : null
        ].filter(Boolean).join(', ');

        result.message = `Connection successful! Passed checks: ${successfulChecks}`;
      } else {
        result.message = 'Connection failed. All endpoint checks failed.';
      }

      return result;
    } catch (error) {
      console.error('Connection test failed:', error);
      result.message = `Connection test failed: ${error instanceof Error ? error.message : String(error)}`;
      return result;
    }
  }

  // Simple connection test (backward compatibility)
  async testConnectionSimple(): Promise<boolean> {
    const result = await this.testConnection();
    return result.success;
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
