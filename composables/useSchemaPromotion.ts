import { ref } from 'vue'
import { useDgraphClient } from '@/composables/useDgraphClient'
import { useConnectionsStore } from '@/stores/connections'
import type { Connection } from '@/types/connection'

export type SchemaDifference = {
  type: 'added' | 'removed'
  line: string
  context?: {
    typeName: string
    typeKind: 'type' | 'enum' | 'directive' | 'scalar'
    fieldName?: string
  }
}

export type SchemaComparisonResult = {
  devSchema: string
  prodSchema: string
  hasDifferences: boolean
  differences?: string[]
  enhancedDifferences?: SchemaDifference[]
}

export type PromotionResult = {
  success: boolean
  error?: string
  backupSchema?: string
}

export const useSchemaPromotion = () => {
  const connectionsStore = useConnectionsStore()
  const isPromoting = ref(false)
  const isComparing = ref(false)

  // Helper function to parse schema and extract type/enum context
  const parseSchemaContext = (schema: string): Map<number, { typeName: string; typeKind: 'type' | 'enum' | 'directive' | 'scalar'; fieldName?: string }> => {
    const lines = schema.split('\n')
    const contextMap = new Map()
    let currentType: string | null = null
    let currentTypeKind: 'type' | 'enum' | 'directive' | 'scalar' | null = null

    lines.forEach((line, index) => {
      const trimmedLine = line.trim()
      
      // Check for type definitions
      const typeMatch = trimmedLine.match(/^type\s+(\w+)/)
      if (typeMatch) {
        currentType = typeMatch[1]
        currentTypeKind = 'type'
        contextMap.set(index, { typeName: currentType, typeKind: currentTypeKind })
        return
      }

      // Check for enum definitions
      const enumMatch = trimmedLine.match(/^enum\s+(\w+)/)
      if (enumMatch) {
        currentType = enumMatch[1]
        currentTypeKind = 'enum'
        contextMap.set(index, { typeName: currentType, typeKind: currentTypeKind })
        return
      }

      // Check for directive definitions
      const directiveMatch = trimmedLine.match(/^directive\s+@(\w+)/)
      if (directiveMatch) {
        currentType = directiveMatch[1]
        currentTypeKind = 'directive'
        contextMap.set(index, { typeName: currentType, typeKind: currentTypeKind })
        return
      }

      // Check for scalar definitions
      const scalarMatch = trimmedLine.match(/^scalar\s+(\w+)/)
      if (scalarMatch) {
        currentType = scalarMatch[1]
        currentTypeKind = 'scalar'
        contextMap.set(index, { typeName: currentType, typeKind: currentTypeKind })
        return
      }

      // If we're inside a type/enum and this line contains a field
      if (currentType && currentTypeKind && trimmedLine && !trimmedLine.startsWith('}')) {
        let fieldName: string | undefined

        if (currentTypeKind === 'type') {
          // For types, extract field name (e.g., "name: String" -> "name")
          const fieldMatch = trimmedLine.match(/^(\w+)\s*:/)
          if (fieldMatch) {
            fieldName = fieldMatch[1]
          }
        } else if (currentTypeKind === 'enum') {
          // For enums, the whole line is usually the enum value
          if (trimmedLine.match(/^\w+$/)) {
            fieldName = trimmedLine
          }
        }

        contextMap.set(index, { 
          typeName: currentType, 
          typeKind: currentTypeKind,
          fieldName 
        })
      }

      // Reset when we encounter a closing brace
      if (trimmedLine === '}') {
        currentType = null
        currentTypeKind = null
      }
    })

    return contextMap
  }

  // Enhanced diff function that includes context
  const createEnhancedDifferences = (devSchema: string, prodSchema: string): SchemaDifference[] => {
    const devLines = devSchema.split('\n').filter(line => line.trim())
    const prodLines = prodSchema.split('\n').filter(line => line.trim())
    const devContext = parseSchemaContext(devSchema)
    const prodContext = parseSchemaContext(prodSchema)
    
    const differences: SchemaDifference[] = []

    // Find lines in dev but not in prod (added)
    devLines.forEach((line, index) => {
      if (!prodLines.includes(line)) {
        const context = devContext.get(index)
        differences.push({
          type: 'added',
          line: line.trim(),
          context
        })
      }
    })

    // Find lines in prod but not in dev (removed)
    prodLines.forEach((line, index) => {
      if (!devLines.includes(line)) {
        const context = prodContext.get(index)
        differences.push({
          type: 'removed',
          line: line.trim(),
          context
        })
      }
    })

    return differences
  }

  // Compare schemas between dev and production connections
  const compareSchemas = async (devConnection: Connection, prodConnection: Connection): Promise<SchemaComparisonResult | null> => {
    isComparing.value = true
    
    try {
      // Create separate clients for dev and prod connections
      const { getSchema: getDevSchema } = useDgraphClient()
      const { getSchema: getProdSchema } = useDgraphClient()
      
      // Get dev schema
      const originalActiveId = connectionsStore.activeConnectionId
      connectionsStore.setActiveConnection(devConnection.id)
      const devSchemaResult = await getDevSchema()
      
      if (devSchemaResult.error) {
        console.error('Failed to get dev schema:', devSchemaResult.error)
        return null
      }
      
      // Get prod schema
      connectionsStore.setActiveConnection(prodConnection.id)
      const prodSchemaResult = await getProdSchema()
      
      if (prodSchemaResult.error) {
        console.error('Failed to get prod schema:', prodSchemaResult.error)
        return null
      }
      
      // Restore original active connection
      if (originalActiveId) {
        connectionsStore.setActiveConnection(originalActiveId)
      }
      
      const devSchema = devSchemaResult.data?.schema || ''
      const prodSchema = prodSchemaResult.data?.schema || ''
      
      // Simple comparison - in a real app, you might want more sophisticated diff logic
      const hasDifferences = devSchema.trim() !== prodSchema.trim()
      
      const differences: string[] = []
      let enhancedDifferences: SchemaDifference[] = []
      
      if (hasDifferences) {
        // Create enhanced differences with context
        enhancedDifferences = createEnhancedDifferences(devSchema, prodSchema)
        
        // Also create basic diff for backward compatibility
        const devLines = devSchema.split('\n').filter(line => line.trim())
        const prodLines = prodSchema.split('\n').filter(line => line.trim())
        
        // Find lines in dev but not in prod
        devLines.forEach(line => {
          if (!prodLines.includes(line)) {
            differences.push(`+ ${line}`)
          }
        })
        
        // Find lines in prod but not in dev
        prodLines.forEach(line => {
          if (!devLines.includes(line)) {
            differences.push(`- ${line}`)
          }
        })
      }
      
      const result = {
        devSchema,
        prodSchema,
        hasDifferences,
        differences: differences.length > 0 ? differences : undefined,
        enhancedDifferences: enhancedDifferences.length > 0 ? enhancedDifferences : undefined
      }

      // Log activity
      const { useActivityHistory } = await import('@/composables/useActivityHistory')
      const { addActivity } = useActivityHistory()
      
      addActivity({
        type: 'schema_comparison',
        action: hasDifferences ? 'Schema differences detected' : 'Schemas are in sync',
        connectionName: devConnection.name,
        connectionId: devConnection.id,
        status: hasDifferences ? 'warning' : 'success',
        details: hasDifferences 
          ? `${differences.length} differences found between dev and production`
          : 'Development and production schemas match'
      })

      return result
    } catch (error) {
      console.error('Schema comparison failed:', error)
      
      // Log error activity
      const { useActivityHistory } = await import('@/composables/useActivityHistory')
      const { addActivity } = useActivityHistory()
      
      addActivity({
        type: 'schema_comparison',
        action: 'Schema comparison failed',
        connectionName: devConnection.name,
        connectionId: devConnection.id,
        status: 'error',
        details: 'Unable to retrieve or compare schemas',
        error: error instanceof Error ? error.message : String(error)
      })
      
      return null
    } finally {
      isComparing.value = false
    }
  }

  // Promote schema from dev to production
  const promoteSchema = async (devConnection: Connection, prodConnection: Connection): Promise<PromotionResult> => {
    isPromoting.value = true
    
    try {
      const { getSchema, updateSchema } = useDgraphClient()
      
      // First, get the dev schema
      const originalActiveId = connectionsStore.activeConnectionId
      connectionsStore.setActiveConnection(devConnection.id)
      const devSchemaResult = await getSchema()
      
      if (devSchemaResult.error) {
        return {
          success: false,
          error: `Failed to get development schema: ${devSchemaResult.error.message}`
        }
      }
      
      const devSchema = devSchemaResult.data?.schema || ''
      
      // Get current production schema for backup
      connectionsStore.setActiveConnection(prodConnection.id)
      const prodSchemaResult = await getSchema()
      const backupSchema = prodSchemaResult.data?.schema || ''
      
      // Update production schema with dev schema
      const updateResult = await updateSchema(devSchema)
      
      // Restore original active connection
      if (originalActiveId) {
        connectionsStore.setActiveConnection(originalActiveId)
      }
      
      if (updateResult.error) {
        const result = {
          success: false,
          error: `Failed to update production schema: ${updateResult.error.message}`,
          backupSchema
        }

        // Log error activity
        const { useActivityHistory } = await import('@/composables/useActivityHistory')
        const { addActivity } = useActivityHistory()
        
        addActivity({
          type: 'schema_promotion',
          action: 'Schema promotion failed',
          connectionName: devConnection.name,
          connectionId: devConnection.id,
          status: 'error',
          details: `Failed to promote schema to ${prodConnection.name}`,
          error: result.error
        })

        return result
      }
      
      const result = {
        success: true,
        backupSchema
      }

      // Log success activity
      const { useActivityHistory } = await import('@/composables/useActivityHistory')
      const { addActivity } = useActivityHistory()
      
      addActivity({
        type: 'schema_promotion',
        action: 'Schema promoted successfully',
        connectionName: devConnection.name,
        connectionId: devConnection.id,
        status: 'success',
        details: `Schema promoted from ${devConnection.name} to ${prodConnection.name}`
      })

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      // Log error activity
      const { useActivityHistory } = await import('@/composables/useActivityHistory')
      const { addActivity } = useActivityHistory()
      
      addActivity({
        type: 'schema_promotion',
        action: 'Schema promotion failed',
        connectionName: devConnection.name,
        connectionId: devConnection.id,
        status: 'error',
        details: 'Schema promotion encountered an error',
        error: errorMessage
      })
      
      return {
        success: false,
        error: errorMessage
      }
    } finally {
      isPromoting.value = false
    }
  }

  // Validate that promotion is possible
  const canPromote = (devConnection: Connection): boolean => {
    if (devConnection.environment !== 'Development') {
      return false
    }
    
    if (!devConnection.linkedProductionId) {
      return false
    }
    
    const prodConnection = connectionsStore.getLinkedProduction(devConnection.id)
    return prodConnection !== null
  }

  return {
    isPromoting,
    isComparing,
    compareSchemas,
    promoteSchema,
    canPromote
  }
}
