<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { buildSchema, GraphQLSchema } from 'graphql'
import { useDgraphClient } from '@/composables/useDgraphClient'
import { useConnectionsStore } from '@/stores/connections'
import * as d3 from 'd3'

const props = defineProps<{
  schema?: string
}>()

const connectionsStore = useConnectionsStore()
const dgraphClient = useDgraphClient()

const isLoading = ref(false)
const error = ref<string | null>(null)
const schemaText = ref<string>('')
const containerRef = ref<HTMLDivElement | null>(null)
const debugInfo = ref<string | null>(null)

// Graph data structure
type GraphNode = {
  id: string
  name: string
  kind: string
  fields?: string[]
  description?: string
  directives?: string[]
}

type GraphLink = {
  source: string
  target: string
  relationship: string
}

type GraphData = {
  nodes: GraphNode[]
  links: GraphLink[]
}

// Dgraph custom directives that need to be handled
const dgraphDirectives = [
  'auth',
  'cascade',
  'custom',
  'deprecated',
  'dgraph',
  'embedding',
  'generate',
  'hasInverse',
  'id',
  'include',
  'lambda',
  'remote',
  'remoteResponse',
  'search',
  'secret',
  'skip',
  'withSubscription',
  'lambdaOnMutate'
]

// Preprocess schema to handle Dgraph custom directives
const preprocessSchema = (schema: string): string => {
  // First, add directive definitions for all Dgraph custom directives
  let processedSchema = schema

  // Add directive definitions at the beginning of the schema
  let directiveDefinitions = ''
  dgraphDirectives.forEach(directive => {
    // Define each directive with a flexible signature that accepts any arguments
    directiveDefinitions += `directive @${directive} on OBJECT | FIELD_DEFINITION | INTERFACE | SCALAR | ENUM\n`
  })

  // Add the directive definitions to the schema
  processedSchema = directiveDefinitions + processedSchema

  debugInfo.value = `Preprocessed schema with ${dgraphDirectives.length} Dgraph directive definitions`
  
  return processedSchema
}

// Load schema from Dgraph
const loadSchema = async () => {
  if (!connectionsStore.activeConnection && !props.schema) {
    error.value = 'No active connection or schema provided'
    return
  }
  
  isLoading.value = true
  error.value = null
  debugInfo.value = null
  
  try {
    // If schema is provided via props, use it
    if (props.schema) {
      schemaText.value = props.schema
      debugInfo.value = `Using schema from props (${props.schema.length} characters)`
      processSchema()
      return
    }
    
    // Otherwise fetch from Dgraph
    const result = await dgraphClient.getSchema()
    
    if (result.error) {
      error.value = result.error.message
      debugInfo.value = JSON.stringify(result.error, null, 2)
      return
    }
    
    if (result.data?.schema) {
      schemaText.value = result.data.schema
      debugInfo.value = `Received schema (${schemaText.value.length} characters)`
      processSchema()
    } else {
      error.value = 'No schema returned from Dgraph'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    debugInfo.value = `Error: ${error.value}`
  } finally {
    isLoading.value = false
  }
}

// Process GraphQL schema to create graph structure
const processSchema = () => {
  if (!schemaText.value) {
    debugInfo.value = 'No schema to process'
    return
  }
  
  try {
    // Preprocess the schema to handle Dgraph custom directives
    const processedSchema = preprocessSchema(schemaText.value)
    
    // Parse the schema
    const schema = buildSchema(processedSchema)
    const typeMap = schema.getTypeMap()
    
    const graphData: GraphData = {
      nodes: [],
      links: []
    }
    
    // Filter out built-in types and create nodes
    Object.values(typeMap).forEach(type => {
      const typeName = type.name
      
      // Skip built-in types (those starting with __)
      if (typeName.startsWith('__')) return
      
      // Skip common scalar types
      if (['String', 'Int', 'Float', 'Boolean', 'ID'].includes(typeName)) return
      
      // Create node for each type
      const node: GraphNode = {
        id: typeName,
        name: typeName,
        kind: type.constructor.name.replace('GraphQL', ''),
        fields: [],
        directives: []
      }
      
      // Extract directives from the schema text (since GraphQL library doesn't expose them directly)
      const typeRegex = new RegExp(`type\\s+${typeName}\\s+[^{]*{`, 'i')
      const typeMatch = schemaText.value.match(typeRegex)
      if (typeMatch) {
        const directiveMatches = typeMatch[0].match(/@\w+(\([^)]*\))?/g)
        if (directiveMatches) {
          node.directives = directiveMatches
        }
      }
      
      // Add fields if available
      if ('getFields' in type && typeof type.getFields === 'function') {
        const fields = type.getFields()
        node.fields = Object.keys(fields)
        
        // Create links for field relationships
        Object.values(fields).forEach(field => {
          let fieldType = field.type.toString()
          
          // Remove brackets and exclamation marks
          fieldType = fieldType.replace(/[[\]!]/g, '')
          
          // Skip scalar types and built-in types for links
          if (!fieldType.startsWith('__') && 
              !['String', 'Int', 'Float', 'Boolean', 'ID'].includes(fieldType)) {
            graphData.links.push({
              source: typeName,
              target: fieldType,
              relationship: field.name
            })
          }
        })
      }
      
      graphData.nodes.push(node)
    })
    
    debugInfo.value = `Processed ${graphData.nodes.length} nodes and ${graphData.links.length} links`
    
    nextTick(() => {
      renderGraph(graphData)
    })
  } catch (err) {
    error.value = `Error processing schema: ${err instanceof Error ? err.message : String(err)}`
    debugInfo.value = `Processing error: ${error.value}`
  }
}

// Render the graph using D3.js
const renderGraph = (data: GraphData) => {
  if (!containerRef.value) {
    debugInfo.value = 'Container reference is null, cannot render graph'
    return
  }
  
  try {
    // Clear previous graph
    d3.select(containerRef.value).selectAll('*').remove()
    
    // If no data, show a message
    if (data.nodes.length === 0) {
      d3.select(containerRef.value)
        .append('div')
        .attr('class', 'flex items-center justify-center h-full')
        .append('p')
        .attr('class', 'text-muted-foreground')
        .text('No schema data available')
      return
    }
    
    const width = containerRef.value.clientWidth || 800
    const height = 600
    
    debugInfo.value = `Rendering graph with dimensions ${width}x${height}`
    
    // Create SVG container
    const svg = d3.select(containerRef.value)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height])
      .attr('style', 'max-width: 100%; height: auto;')
    
    // Create zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    
    svg.call(zoom as any)
    
    // Create container for the graph
    const g = svg.append('g')
    
    // Create force simulation
    const simulation = d3.forceSimulation(data.nodes as any)
      .force('link', d3.forceLink(data.links as any)
        .id((d: any) => d.id)
        .distance(150))
      .force('charge', d3.forceManyBody().strength(-500))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(80))
    
    // Create links
    const link = g.append('g')
      .selectAll('line')
      .data(data.links)
      .join('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 1)
    
    // Create link labels
    const linkLabels = g.append('g')
      .selectAll('text')
      .data(data.links)
      .join('text')
      .attr('font-size', 10)
      .attr('fill', '#666')
      .text(d => d.relationship)
    
    // Create nodes
    const node = g.append('g')
      .selectAll('g')
      .data(data.nodes)
      .join('g')
      .call(drag(simulation) as any)
      .on('click', (event, d) => {
        // Show details when clicking on a node
        showNodeDetails(d)
      })
    
    // Calculate node height based on fields and directives
    const getNodeHeight = (d: GraphNode) => {
      const fieldCount = d.fields?.length || 0
      const directiveCount = d.directives?.length || 0
      const baseHeight = 40 // Title height
      const fieldHeight = Math.min(fieldCount, 5) * 20 // Up to 5 fields
      const directiveHeight = directiveCount > 0 ? 20 : 0 // Space for directives
      const moreFieldsHeight = fieldCount > 5 ? 20 : 0 // "... more" text
      
      return baseHeight + fieldHeight + directiveHeight + moreFieldsHeight
    }
    
    // Add node rectangles
    node.append('rect')
      .attr('width', d => Math.max(d.name.length * 8 + 20, 100))
      .attr('height', d => getNodeHeight(d))
      .attr('rx', 5)
      .attr('ry', 5)
      .attr('fill', d => getNodeColor(d.kind))
      .attr('stroke', '#333')
      .attr('stroke-width', 1)
    
    // Add node titles
    node.append('text')
      .attr('x', 10)
      .attr('y', 20)
      .attr('font-weight', 'bold')
      .text(d => d.name)
    
    // Add directives if any
    node.each(function(d) {
      const nodeGroup = d3.select(this)
      
      if (d.directives && d.directives.length > 0) {
        nodeGroup.append('text')
          .attr('x', 10)
          .attr('y', 35)
          .attr('font-size', 10)
          .attr('fill', '#666')
          .text(d.directives.join(' '))
      }
    })
    
    // Add field names (limited to first 5 for readability)
    node.each(function(d) {
      const nodeGroup = d3.select(this)
      const fields = d.fields || []
      const displayFields = fields.slice(0, 5)
      const directiveOffset = d.directives && d.directives.length > 0 ? 20 : 0
      
      displayFields.forEach((field, i) => {
        nodeGroup.append('text')
          .attr('x', 15)
          .attr('y', 40 + directiveOffset + i * 20)
          .attr('font-size', 12)
          .text(field)
      })
      
      if (fields.length > 5) {
        nodeGroup.append('text')
          .attr('x', 15)
          .attr('y', 40 + directiveOffset + 5 * 20)
          .attr('font-size', 12)
          .text(`... ${fields.length - 5} more`)
      }
    })
    
    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)
      
      linkLabels
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2)
      
      node.attr('transform', (d: any) => `translate(${d.x - 50}, ${d.y - 20})`)
    })
    
    // Create drag behavior
    function drag(simulation: any) {
      function dragstarted(event: any) {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        event.subject.fx = event.subject.x
        event.subject.fy = event.subject.y
      }
      
      function dragged(event: any) {
        event.subject.fx = event.x
        event.subject.fy = event.y
      }
      
      function dragended(event: any) {
        if (!event.active) simulation.alphaTarget(0)
        event.subject.fx = null
        event.subject.fy = null
      }
      
      return d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
    }
    
    // Initial zoom to fit
    const initialScale = 0.8
    const initialTransform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(initialScale)
      .translate(-width / 2, -height / 2)
    
    svg.call((zoom as any).transform, initialTransform)
    
    debugInfo.value = `Graph rendered successfully with ${data.nodes.length} nodes`
  } catch (err) {
    error.value = `Error rendering graph: ${err instanceof Error ? err.message : String(err)}`
    debugInfo.value = `Rendering error: ${error.value}`
  }
}

// Get color based on node kind
const getNodeColor = (kind: string) => {
  switch (kind) {
    case 'ObjectType':
      return '#e6f7ff'
    case 'InterfaceType':
      return '#fff7e6'
    case 'EnumType':
      return '#f6ffed'
    case 'InputObjectType':
      return '#fff1f0'
    case 'ScalarType':
      return '#f9f0ff'
    case 'UnionType':
      return '#f0f5ff'
    default:
      return '#f0f2f5'
  }
}

// Show node details in a panel
const showNodeDetails = (node: GraphNode) => {
  // This could be implemented to show more details about the selected node
  console.log('Node details:', node)
}

// Watch for active connection changes
watch(() => connectionsStore.activeConnectionId, (newId) => {
  if (newId) {
    loadSchema()
  }
})

// Watch for schema changes from props
watch(() => props.schema, (newSchema) => {
  if (newSchema) {
    schemaText.value = newSchema
    processSchema()
  }
})

// Initialize
onMounted(() => {
  if (connectionsStore.activeConnectionId || props.schema) {
    // Add a small delay to ensure the container is properly rendered
    setTimeout(() => {
      loadSchema()
    }, 500)
  }
  
  // Handle window resize
  window.addEventListener('resize', () => {
    if (schemaText.value) {
      processSchema()
    }
  })
})
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex justify-between items-center mb-2">
      <h3 class="text-lg font-medium">GraphQL Schema Diagram</h3>
      
      <div class="flex space-x-2">
        <UiButton 
          variant="outline" 
          size="sm" 
          @click="loadSchema" 
          :disabled="isLoading || (!connectionsStore.activeConnection && !props.schema)"
        >
          Reload
        </UiButton>
      </div>
    </div>
    
    <div v-if="error" class="bg-red-50 text-red-700 p-2 rounded mb-2">
      {{ error }}
    </div>
    
    <div v-if="isLoading" class="flex items-center justify-center p-4">
      <div class="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
      <span class="ml-2">Loading schema data...</span>
    </div>
    
    <div v-else class="flex-1 border rounded-md overflow-hidden">
      <div ref="containerRef" class="w-full h-full" style="min-height: 600px;"></div>
    </div>
    
    <!-- Debug info (only visible in development) -->
    <div v-if="debugInfo && import.meta.env.DEV" class="mt-2 p-2 bg-gray-100 text-xs rounded">
      <details>
        <summary>Debug Info</summary>
        <pre>{{ debugInfo }}</pre>
      </details>
    </div>
  </div>
</template>

<style>
.node-tooltip {
  position: absolute;
  background-color: white;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 8px;
  font-size: 12px;
  pointer-events: none;
  z-index: 10;
  max-width: 300px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
</style>

