<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { buildClientSchema, getIntrospectionQuery, IntrospectionQuery } from 'graphql'
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
const introspectionData = ref<IntrospectionQuery | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const debugInfo = ref<string | null>(null)

// Graph data structure
type GraphNode = {
  id: string
  name: string
  kind: string
  fields?: string[]
  description?: string
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

// Load introspection data from the GraphQL endpoint
const loadIntrospectionData = async () => {
  if (!connectionsStore.activeConnection) {
    error.value = 'No active connection'
    return
  }
  
  isLoading.value = true
  error.value = null
  debugInfo.value = null
  
  try {
    // Execute the introspection query
    const result = await dgraphClient.executeQuery(getIntrospectionQuery())
    
    if (result.error) {
      error.value = result.error.message
      debugInfo.value = JSON.stringify(result.error, null, 2)
      return
    }
    
    if (result.data) {
      introspectionData.value = result.data as IntrospectionQuery
      debugInfo.value = `Received introspection data with ${Object.keys(introspectionData.value.__schema.types).length} types`
      processIntrospectionData()
    } else {
      error.value = 'No data returned from introspection query'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    debugInfo.value = `Error: ${error.value}`
  } finally {
    isLoading.value = false
  }
}

// Process introspection data to create graph structure
const processIntrospectionData = () => {
  if (!introspectionData.value) {
    debugInfo.value = 'No introspection data to process'
    return
  }
  
  try {
    const schema = buildClientSchema(introspectionData.value)
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
      
      // Create node for each type
      const node: GraphNode = {
        id: typeName,
        name: typeName,
        kind: type.astNode?.kind || 'OBJECT',
        fields: []
      }
      
      // Add fields if available
      if ('getFields' in type && typeof type.getFields === 'function') {
        const fields = type.getFields()
        node.fields = Object.keys(fields)
        
        // Create links for field relationships
        Object.values(fields).forEach(field => {
          const fieldType = field.type.toString().replace(/[[\]!]/g, '')
          
          // Skip scalar types for links
          if (!fieldType.startsWith('__') && !['String', 'Int', 'Float', 'Boolean', 'ID'].includes(fieldType)) {
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
    
    // Add node rectangles
    node.append('rect')
      .attr('width', d => Math.max(d.name.length * 8 + 20, 100))
      .attr('height', d => (d.fields?.length || 0) > 0 ? Math.min((d.fields?.length || 0) * 20 + 40, 200) : 40)
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
    
    // Add field names (limited to first 5 for readability)
    node.each(function(d) {
      const nodeGroup = d3.select(this)
      const fields = d.fields || []
      const displayFields = fields.slice(0, 5)
      
      displayFields.forEach((field, i) => {
        nodeGroup.append('text')
          .attr('x', 15)
          .attr('y', 40 + i * 20)
          .attr('font-size', 12)
          .text(field)
      })
      
      if (fields.length > 5) {
        nodeGroup.append('text')
          .attr('x', 15)
          .attr('y', 40 + 5 * 20)
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
    case 'OBJECT':
      return '#e6f7ff'
    case 'INTERFACE':
      return '#fff7e6'
    case 'ENUM':
      return '#f6ffed'
    case 'INPUT_OBJECT':
      return '#fff1f0'
    case 'SCALAR':
      return '#f9f0ff'
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
    loadIntrospectionData()
  }
})

// Watch for schema changes from props
watch(() => props.schema, (newSchema) => {
  if (newSchema && connectionsStore.activeConnectionId) {
    loadIntrospectionData()
  }
})

// Initialize
onMounted(() => {
  if (connectionsStore.activeConnectionId) {
    // Add a small delay to ensure the container is properly rendered
    setTimeout(() => {
      loadIntrospectionData()
    }, 500)
  }
  
  // Handle window resize
  window.addEventListener('resize', () => {
    if (introspectionData.value) {
      processIntrospectionData()
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
          @click="loadIntrospectionData" 
          :disabled="isLoading || !connectionsStore.activeConnection"
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

