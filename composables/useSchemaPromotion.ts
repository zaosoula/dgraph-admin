import { ref } from 'vue'
import { diffLines } from 'diff'
import { createClientForConnection } from '@/composables/useDgraphClient'
import { useConnectionsStore } from '@/stores/connections'
import type { Connection } from '@/types/connection'

export type SchemaContext = {
  typeName: string
  typeKind: 'type' | 'enum' | 'directive' | 'scalar'
  fieldName?: string
}

export type SchemaDifference = {
  type: 'added' | 'removed'
  line: string
  context?: SchemaContext
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
  const parseSchemaContext = (schema: string): Map<number, SchemaContext> => {
    const lines = schema.split('\n')
    const contextMap = new Map<number, SchemaContext>()
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
        // Attribute the brace to the type it closes before clearing. Without
        // this a wholly-added type shows its fields under the type heading but
        // strands the trailing `}` under "Outside any type".
        if (currentType && currentTypeKind) {
          contextMap.set(index, { typeName: currentType, typeKind: currentTypeKind })
        }

        currentType = null
        currentTypeKind = null
      }
    })

    return contextMap
  }

  // Split a diff chunk into its lines, dropping the artefact of a trailing newline
  const chunkToLines = (value: string): string[] => {
    const lines = value.split('\n')

    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop()
    }

    return lines
  }

  // Enhanced diff function that includes context.
  // Line indices are tracked against the ORIGINAL (unfiltered) schemas so that
  // context lookups line up with the maps built by parseSchemaContext.
  const createEnhancedDifferences = (devSchema: string, prodSchema: string): SchemaDifference[] => {
    const devContext = parseSchemaContext(devSchema)
    const prodContext = parseSchemaContext(prodSchema)

    // Old text is production, new text is development:
    // an added chunk exists only in dev, a removed chunk only in production.
    const changes = diffLines(prodSchema, devSchema)

    const differences: SchemaDifference[] = []
    let devLineIndex = 0
    let prodLineIndex = 0

    changes.forEach(change => {
      const lines = chunkToLines(change.value)

      if (change.added) {
        lines.forEach((line, offset) => {
          if (line.trim()) {
            differences.push({
              type: 'added',
              line: line.trim(),
              context: devContext.get(devLineIndex + offset)
            })
          }
        })

        devLineIndex += lines.length
        return
      }

      if (change.removed) {
        lines.forEach((line, offset) => {
          if (line.trim()) {
            differences.push({
              type: 'removed',
              line: line.trim(),
              context: prodContext.get(prodLineIndex + offset)
            })
          }
        })

        prodLineIndex += lines.length
        return
      }

      // Unchanged chunk: advance both cursors
      devLineIndex += lines.length
      prodLineIndex += lines.length
    })

    return differences
  }

  // Compare schemas between dev and production connections
  const compareSchemas = async (devConnection: Connection, prodConnection: Connection): Promise<SchemaComparisonResult | null> => {
    isComparing.value = true
    
    try {
      // Explicitly targeted clients: never retarget through the active connection
      const devClient = createClientForConnection(devConnection)
      const prodClient = createClientForConnection(prodConnection)
      
      const [devSchemaResult, prodSchemaResult] = await Promise.all([
        devClient.getSchema(),
        prodClient.getSchema()
      ])
      
      if (devSchemaResult.error) {
        console.error('Failed to get dev schema:', devSchemaResult.error)
        return null
      }
      
      if (prodSchemaResult.error) {
        console.error('Failed to get prod schema:', prodSchemaResult.error)
        return null
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
        
        // Basic diff, kept for backward compatibility, derived from the same comparison
        enhancedDifferences.forEach(difference => {
          differences.push(`${difference.type === 'added' ? '+' : '-'} ${difference.line}`)
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
      // Explicitly targeted clients: never retarget through the active connection
      const devClient = createClientForConnection(devConnection)
      const prodClient = createClientForConnection(prodConnection)
      
      // First, get the dev schema
      const devSchemaResult = await devClient.getSchema()
      
      if (devSchemaResult.error) {
        return {
          success: false,
          error: `Failed to get development schema: ${devSchemaResult.error.message}`
        }
      }
      
      const devSchema = devSchemaResult.data?.schema || ''
      
      // Get current production schema for backup. Without it the write has no
      // rollback point, so refuse rather than overwrite production blind.
      const prodSchemaResult = await prodClient.getSchema()

      if (prodSchemaResult.error) {
        return {
          success: false,
          error: `Failed to read the current production schema, so no rollback point could be taken: ${prodSchemaResult.error.message}`
        }
      }

      const backupSchema = prodSchemaResult.data?.schema || ''
      
      // Update production schema with dev schema
      const updateResult = await prodClient.updateSchema(devSchema)
      
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

      // Both sides now hold the schema we just wrote, so record that directly
      // instead of spending two round-trips rediscovering it.
      const { useSchemaSyncStatus } = await import('@/composables/useSchemaSyncStatus')
      useSchemaSyncStatus().markPairSynced(devConnection.id)

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

  // Restore a previously captured schema onto a connection (rollback of a promotion)
  const restoreSchema = async (connection: Connection, schema: string): Promise<PromotionResult> => {
    isPromoting.value = true
    
    try {
      const client = createClientForConnection(connection)
      
      // Capture what is currently live before overwriting it again
      const currentSchemaResult = await client.getSchema()
      const backupSchema = currentSchemaResult.data?.schema || ''
      
      const updateResult = await client.updateSchema(schema)
      
      const { useActivityHistory } = await import('@/composables/useActivityHistory')
      const { addActivity } = useActivityHistory()
      
      if (updateResult.error) {
        const error = `Failed to restore schema: ${updateResult.error.message}`
        
        addActivity({
          type: 'schema_promotion',
          action: 'Schema rollback failed',
          connectionName: connection.name,
          connectionId: connection.id,
          status: 'error',
          details: `Failed to restore the backup schema on ${connection.name}`,
          error
        })
        
        return { success: false, error, backupSchema }
      }
      
      addActivity({
        type: 'schema_promotion',
        action: 'Schema rolled back',
        connectionName: connection.name,
        connectionId: connection.id,
        status: 'success',
        details: `Backup schema restored on ${connection.name}`
      })

      // A rollback moves one side of the pair; re-compare rather than assume.
      const { useSchemaSyncStatus } = await import('@/composables/useSchemaSyncStatus')
      useSchemaSyncStatus().refreshForConnection(connection.id).catch((error) => {
        console.error('Failed to refresh schema sync status after rollback:', error)
      })

      return { success: true, backupSchema }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      const { useActivityHistory } = await import('@/composables/useActivityHistory')
      const { addActivity } = useActivityHistory()
      
      addActivity({
        type: 'schema_promotion',
        action: 'Schema rollback failed',
        connectionName: connection.name,
        connectionId: connection.id,
        status: 'error',
        details: 'Schema rollback encountered an error',
        error: errorMessage
      })
      
      return { success: false, error: errorMessage }
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
    restoreSchema,
    canPromote
  }
}
