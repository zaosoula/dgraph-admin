import type { DgraphClient } from './dgraph-client'

// GraphQL introspection types
export type IntrospectionType = {
  name: string
  kind: string
  description?: string
  fields?: IntrospectionField[]
  inputFields?: IntrospectionInputValue[]
  interfaces?: { name: string }[]
  enumValues?: { name: string; description?: string }[]
  possibleTypes?: { name: string }[]
}

export type IntrospectionField = {
  name: string
  description?: string
  args: IntrospectionInputValue[]
  type: IntrospectionTypeRef
  isDeprecated: boolean
  deprecationReason?: string
}

export type IntrospectionInputValue = {
  name: string
  description?: string
  type: IntrospectionTypeRef
  defaultValue?: string
}

export type IntrospectionTypeRef = {
  kind: string
  name?: string
  ofType?: IntrospectionTypeRef
}

export type IntrospectionSchema = {
  types: IntrospectionType[]
  queryType: { name: string }
  mutationType?: { name: string }
  subscriptionType?: { name: string }
  directives: {
    name: string
    description?: string
    locations: string[]
    args: IntrospectionInputValue[]
  }[]
}

// The introspection query
const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      subscriptionType { name }
      types {
        ...FullType
      }
      directives {
        name
        description
        locations
        args {
          ...InputValue
        }
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
    type {
      ...TypeRef
    }
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

export class SchemaIntrospection {
  private schema: IntrospectionSchema | null = null
  private client: DgraphClient
  
  constructor(client: DgraphClient) {
    this.client = client
  }
  
  // Fetch the schema using introspection
  async fetchSchema(): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.client.executeQuery<{ __schema: IntrospectionSchema }>(INTROSPECTION_QUERY)
      
      if (result.error) {
        return {
          success: false,
          error: result.error.message
        }
      }
      
      if (!result.data || !result.data.__schema) {
        return {
          success: false,
          error: 'Invalid introspection response'
        }
      }
      
      this.schema = result.data.__schema
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
  
  // Get all types
  getTypes(): IntrospectionType[] {
    if (!this.schema) return []
    
    // Filter out built-in types (those starting with __)
    return this.schema.types.filter(type => !type.name.startsWith('__'))
  }
  
  // Get a specific type by name
  getType(name: string): IntrospectionType | null {
    if (!this.schema) return null
    return this.schema.types.find(type => type.name === name) || null
  }
  
  // Get query type
  getQueryType(): IntrospectionType | null {
    if (!this.schema || !this.schema.queryType) return null
    return this.getType(this.schema.queryType.name)
  }
  
  // Get mutation type
  getMutationType(): IntrospectionType | null {
    if (!this.schema || !this.schema.mutationType) return null
    return this.getType(this.schema.mutationType.name)
  }
  
  // Get subscription type
  getSubscriptionType(): IntrospectionType | null {
    if (!this.schema || !this.schema.subscriptionType) return null
    return this.getType(this.schema.subscriptionType.name)
  }
  
  // Get query fields (operations)
  getQueryFields(): IntrospectionField[] {
    const queryType = this.getQueryType()
    if (!queryType || !queryType.fields) return []
    return queryType.fields
  }
  
  // Get mutation fields (operations)
  getMutationFields(): IntrospectionField[] {
    const mutationType = this.getMutationType()
    if (!mutationType || !mutationType.fields) return []
    return mutationType.fields
  }
  
  // Get subscription fields (operations)
  getSubscriptionFields(): IntrospectionField[] {
    const subscriptionType = this.getSubscriptionType()
    if (!subscriptionType || !subscriptionType.fields) return []
    return subscriptionType.fields
  }
  
  // Get all object types (excluding query, mutation, subscription)
  getObjectTypes(): IntrospectionType[] {
    if (!this.schema) return []
    
    const queryTypeName = this.schema.queryType?.name
    const mutationTypeName = this.schema.mutationType?.name
    const subscriptionTypeName = this.schema.subscriptionType?.name
    
    return this.schema.types.filter(type => 
      type.kind === 'OBJECT' && 
      !type.name.startsWith('__') &&
      type.name !== queryTypeName &&
      type.name !== mutationTypeName &&
      type.name !== subscriptionTypeName
    )
  }
  
  // Get all input types
  getInputTypes(): IntrospectionType[] {
    if (!this.schema) return []
    return this.schema.types.filter(type => 
      type.kind === 'INPUT_OBJECT' && 
      !type.name.startsWith('__')
    )
  }
  
  // Get all enum types
  getEnumTypes(): IntrospectionType[] {
    if (!this.schema) return []
    return this.schema.types.filter(type => 
      type.kind === 'ENUM' && 
      !type.name.startsWith('__')
    )
  }
  
  // Get all interface types
  getInterfaceTypes(): IntrospectionType[] {
    if (!this.schema) return []
    return this.schema.types.filter(type => 
      type.kind === 'INTERFACE' && 
      !type.name.startsWith('__')
    )
  }
  
  // Get all union types
  getUnionTypes(): IntrospectionType[] {
    if (!this.schema) return []
    return this.schema.types.filter(type => 
      type.kind === 'UNION' && 
      !type.name.startsWith('__')
    )
  }
  
  // Get all scalar types
  getScalarTypes(): IntrospectionType[] {
    if (!this.schema) return []
    return this.schema.types.filter(type => 
      type.kind === 'SCALAR' && 
      !type.name.startsWith('__')
    )
  }
  
  // Check if schema is loaded
  isSchemaLoaded(): boolean {
    return this.schema !== null
  }
}
