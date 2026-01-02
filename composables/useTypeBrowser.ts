import { ref, computed } from 'vue'
import type { SchemaType, TypeBrowserState } from '@/types/explorer'
import { useDgraphClient } from '@/composables/useDgraphClient'

export const useTypeBrowser = () => {
  const dgraphClient = useDgraphClient()
  
  // State
  const state = ref<TypeBrowserState>({
    types: [],
    isLoading: false,
    error: null,
    selectedType: null
  })

  // Computed properties
  const types = computed(() => state.value.types)
  const isLoading = computed(() => state.value.isLoading)
  const error = computed(() => state.value.error)
  const selectedType = computed(() => state.value.selectedType)
  const hasTypes = computed(() => state.value.types.length > 0)

  // Get schema types from Dgraph
  const loadSchemaTypes = async (): Promise<void> => {
    state.value.isLoading = true
    state.value.error = null
    
    try {
      // Query to get schema information
      const schemaQuery = `
        schema {
          type
        }
      `
      
      const result = await dgraphClient.executeDQLQuery(schemaQuery)
      
      if (result.success && result.data?.schema) {
        const schemaData = result.data.schema
        const typeNames = new Set<string>()
        
        // Extract type names from schema
        if (Array.isArray(schemaData)) {
          schemaData.forEach((item: any) => {
            if (item.type && typeof item.type === 'string') {
              // Extract type name from type definition
              const typeMatch = item.type.match(/type\s+(\w+)/i)
              if (typeMatch) {
                typeNames.add(typeMatch[1])
              }
            }
          })
        }
        
        // Convert to SchemaType array
        const types: SchemaType[] = Array.from(typeNames).map(name => ({
          name,
          count: undefined,
          isLoading: false
        }))
        
        state.value.types = types
        
        // Load counts for each type
        await loadTypeCounts()
      } else {
        // Fallback: try to get types from a different query
        await loadTypesFromData()
      }
    } catch (err) {
      console.error('Error loading schema types:', err)
      state.value.error = err instanceof Error ? err.message : 'Failed to load schema types'
      
      // Fallback: try to get types from data
      await loadTypesFromData()
    } finally {
      state.value.isLoading = false
    }
  }

  // Fallback method to get types from actual data
  const loadTypesFromData = async (): Promise<void> => {
    try {
      // Query to get all types that exist in the data
      const typeQuery = `
        {
          types(func: has(dgraph.type)) {
            dgraph.type
          }
        }
      `
      
      const result = await dgraphClient.executeDQLQuery(typeQuery)
      
      if (result.success && result.data?.types) {
        const typeNames = new Set<string>()
        
        result.data.types.forEach((item: any) => {
          if (item['dgraph.type']) {
            if (Array.isArray(item['dgraph.type'])) {
              item['dgraph.type'].forEach((type: string) => typeNames.add(type))
            } else {
              typeNames.add(item['dgraph.type'])
            }
          }
        })
        
        const types: SchemaType[] = Array.from(typeNames).map(name => ({
          name,
          count: undefined,
          isLoading: false
        }))
        
        state.value.types = types
        await loadTypeCounts()
      }
    } catch (err) {
      console.error('Error loading types from data:', err)
      state.value.error = err instanceof Error ? err.message : 'Failed to load types'
    }
  }

  // Load count for each type
  const loadTypeCounts = async (): Promise<void> => {
    const promises = state.value.types.map(async (type) => {
      try {
        // Mark as loading
        const typeIndex = state.value.types.findIndex(t => t.name === type.name)
        if (typeIndex !== -1) {
          state.value.types[typeIndex].isLoading = true
        }
        
        // Query to count nodes of this type
        const countQuery = `
          {
            count(func: type("${type.name}")) {
              count(uid)
            }
          }
        `
        
        const result = await dgraphClient.executeDQLQuery(countQuery)
        
        if (result.success && result.data?.count?.[0]?.count !== undefined) {
          const count = result.data.count[0].count
          
          // Update the type with count
          const typeIndex = state.value.types.findIndex(t => t.name === type.name)
          if (typeIndex !== -1) {
            state.value.types[typeIndex].count = count
            state.value.types[typeIndex].isLoading = false
          }
        }
      } catch (err) {
        console.error(`Error loading count for type ${type.name}:`, err)
        const typeIndex = state.value.types.findIndex(t => t.name === type.name)
        if (typeIndex !== -1) {
          state.value.types[typeIndex].isLoading = false
        }
      }
    })
    
    await Promise.all(promises)
  }

  // Generate query to explore a specific type
  const generateTypeQuery = (typeName: string, limit = 10): string => {
    return `{
  ${typeName.toLowerCase()}(func: type("${typeName}"), first: ${limit}) {
    uid
    expand(_all_)
  }
}`
  }

  // Generate query to count a specific type
  const generateCountQuery = (typeName: string): string => {
    return `{
  count(func: type("${typeName}")) {
    count(uid)
  }
}`
  }

  // Select a type for exploration
  const selectType = (typeName: string): void => {
    state.value.selectedType = typeName
  }

  // Clear selection
  const clearSelection = (): void => {
    state.value.selectedType = null
  }

  // Refresh types and counts
  const refresh = async (): Promise<void> => {
    await loadSchemaTypes()
  }

  return {
    // State
    types: readonly(types),
    isLoading: readonly(isLoading),
    error: readonly(error),
    selectedType: readonly(selectedType),
    hasTypes: readonly(hasTypes),
    
    // Actions
    loadSchemaTypes,
    generateTypeQuery,
    generateCountQuery,
    selectType,
    clearSelection,
    refresh
  }
}
