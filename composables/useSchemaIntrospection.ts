import { ref, computed } from 'vue'
import { useDgraphClient } from '@/composables/useDgraphClient'
import { SchemaIntrospection } from '@/utils/schema-introspection'
import type { IntrospectionType, IntrospectionField } from '@/utils/schema-introspection'

export const useSchemaIntrospection = () => {
  const dgraphClient = useDgraphClient()
  
  const introspection = ref<SchemaIntrospection | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  
  // Initialize introspection
  const initialize = () => {
    if (!dgraphClient.client.value) {
      const initialized = dgraphClient.initializeClient()
      if (!initialized) {
        error.value = 'Failed to initialize Dgraph client'
        return false
      }
    }
    
    introspection.value = new SchemaIntrospection(dgraphClient.client.value!)
    return true
  }
  
  // Fetch schema using introspection
  const fetchSchema = async () => {
    if (!introspection.value) {
      const initialized = initialize()
      if (!initialized) return false
    }
    
    isLoading.value = true
    error.value = null
    
    try {
      const result = await introspection.value!.fetchSchema()
      
      if (!result.success) {
        error.value = result.error || 'Failed to fetch schema'
        return false
      }
      
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      return false
    } finally {
      isLoading.value = false
    }
  }
  
  // Check if schema is loaded
  const isSchemaLoaded = computed(() => {
    return introspection.value?.isSchemaLoaded() || false
  })
  
  // Get query fields
  const queryFields = computed(() => {
    if (!introspection.value || !isSchemaLoaded.value) return []
    return introspection.value.getQueryFields()
  })
  
  // Get mutation fields
  const mutationFields = computed(() => {
    if (!introspection.value || !isSchemaLoaded.value) return []
    return introspection.value.getMutationFields()
  })
  
  // Get object types
  const objectTypes = computed(() => {
    if (!introspection.value || !isSchemaLoaded.value) return []
    return introspection.value.getObjectTypes()
  })
  
  // Get a specific type by name
  const getType = (name: string): IntrospectionType | null => {
    if (!introspection.value || !isSchemaLoaded.value) return null
    return introspection.value.getType(name)
  }
  
  // Generate a sample query for a field
  const generateSampleQuery = (field: IntrospectionField, depth: number = 2): string => {
    if (!introspection.value || !isSchemaLoaded.value) return ''
    
    // Start with the field name
    let query = field.name
    
    // Add arguments if any
    if (field.args && field.args.length > 0) {
      query += '('
      
      // Add each argument
      const args = field.args.map(arg => {
        const typeName = getTypeName(arg.type)
        return `${arg.name}: ${getSampleValue(typeName)}`
      })
      
      query += args.join(', ')
      query += ')'
    }
    
    // Get the return type
    const returnType = getReturnType(field.type)
    if (!returnType) return query
    
    // If it's a scalar or enum, just return the field name
    if (returnType.kind === 'SCALAR' || returnType.kind === 'ENUM') {
      return query
    }
    
    // If it's an object type, add fields
    if (returnType.kind === 'OBJECT' && returnType.fields && depth > 0) {
      query += ' {\n'
      
      // Add scalar fields
      const scalarFields = returnType.fields
        .filter(f => {
          const fieldType = getReturnType(f.type)
          return fieldType && (fieldType.kind === 'SCALAR' || fieldType.kind === 'ENUM')
        })
        .map(f => '  ' + f.name)
      
      query += scalarFields.join('\n')
      
      // Add one level of object fields if depth allows
      if (depth > 1) {
        const objectFields = returnType.fields
          .filter(f => {
            const fieldType = getReturnType(f.type)
            return fieldType && fieldType.kind === 'OBJECT'
          })
          .slice(0, 1) // Just take the first object field to keep it simple
          .map(f => '  ' + generateSampleQuery(f, depth - 1))
        
        if (objectFields.length > 0) {
          query += '\n' + objectFields.join('\n')
        }
      }
      
      query += '\n}'
    }
    
    return query
  }
  
  // Helper to get the actual return type (unwrapping NON_NULL and LIST)
  const getReturnType = (typeRef: any): IntrospectionType | null => {
    if (!introspection.value) return null
    
    // Unwrap NON_NULL and LIST types
    let currentType = typeRef
    while (currentType.kind === 'NON_NULL' || currentType.kind === 'LIST') {
      currentType = currentType.ofType
    }
    
    // Get the actual type
    if (currentType.name) {
      return introspection.value.getType(currentType.name)
    }
    
    return null
  }
  
  // Helper to get type name (unwrapping NON_NULL and LIST)
  const getTypeName = (typeRef: any): string => {
    if (!typeRef) return 'Unknown'
    
    if (typeRef.kind === 'NON_NULL') {
      return getTypeName(typeRef.ofType) + '!'
    }
    
    if (typeRef.kind === 'LIST') {
      return '[' + getTypeName(typeRef.ofType) + ']'
    }
    
    return typeRef.name || 'Unknown'
  }
  
  // Helper to get a sample value for a type
  const getSampleValue = (typeName: string): string => {
    // Remove non-null indicator
    const baseType = typeName.replace('!', '')
    
    // Handle list types
    if (baseType.startsWith('[') && baseType.endsWith(']')) {
      const innerType = baseType.substring(1, baseType.length - 1)
      return `[${getSampleValue(innerType)}]`
    }
    
    // Handle scalar types
    switch (baseType) {
      case 'Int':
        return '1'
      case 'Float':
        return '1.0'
      case 'String':
        return '"example"'
      case 'Boolean':
        return 'true'
      case 'ID':
        return '"123"'
      default:
        // For custom types, use a placeholder
        return `{/* ${baseType} value */}`
    }
  }
  
  return {
    introspection,
    isLoading,
    error,
    isSchemaLoaded,
    queryFields,
    mutationFields,
    objectTypes,
    initialize,
    fetchSchema,
    getType,
    generateSampleQuery
  }
}
