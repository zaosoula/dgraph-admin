import { ref } from 'vue'
import { useDgraphClient } from '@/composables/useDgraphClient'
import { useConnectionsStore } from '@/stores/connections'
import type { Connection } from '@/types/connection'

export type SchemaComparisonResult = {
  devSchema: string
  prodSchema: string
  hasDifferences: boolean
  differences?: string[]
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
      if (hasDifferences) {
        // Basic diff - split by lines and find differences
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
      
      return {
        devSchema,
        prodSchema,
        hasDifferences,
        differences: differences.length > 0 ? differences : undefined
      }
    } catch (error) {
      console.error('Schema comparison failed:', error)
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
        return {
          success: false,
          error: `Failed to update production schema: ${updateResult.error.message}`,
          backupSchema
        }
      }
      
      return {
        success: true,
        backupSchema
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
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
