<script setup lang="ts">
import { ref, onMounted, watch, nextTick, computed } from 'vue'
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
const focusedNodeId = ref<string | null>(null)
const maxDepth = ref(2) // Maximum depth for relationships when in focus mode

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

// Dgraph custom scalar types
const dgraphScalarTypes = [
  'Int64',
  'DateTime',
  'Point',
  'PointList',
  'Polygon',
  'MultiPolygon'
]

// A more direct approach: strip out all directives from the schema before parsing
const stripDirectives = (schema: string): string => {
  try {
    // Add scalar type definitions
    let processedSchema = schema
    
    // Add scalar definitions
    let scalarDefinitions = ''
    dgraphScalarTypes.forEach(scalar => {
      scalarDefinitions += `scalar ${scalar}\n`
    })
    
    // Remove all directive declarations and usages
    // This regex removes @directive(...) patterns
    processedSchema = processedSchema.replace(/@\w+(\([^)]*\))?/g, '')
    
    // Add scalar definitions at the beginning
    processedSchema = scalarDefinitions + processedSchema
    
    return processedSchema
  } catch (err) {
    console.error('Error preprocessing schema:', err)
    return schema
  }
}

// Extract directives from a type definition
const extractDirectives = (typeName: string, schema: string): string[] => {
  const directives: string[] = []
  
  try {
    // Match the type definition
    const typeRegex = new RegExp(`type\\s+${typeName}\\s+[^{]*{`, 'i')
    const typeMatch = schema.match(typeRegex)
    
    if (typeMatch) {
      // Extract all directives
      const directiveMatches = typeMatch[0].match(/@\w+(\([^)]*\))?/g)
      if (directiveMatches) {
        return directiveMatches
      }
    }
  } catch (err) {
    console.error(`Error extracting directives for ${typeName}:`, err)
  }
  
  return directives
}

// Load schema from Dgraph
const loadSchema = async () => {
  if (!connectionsStore.activeConnection && !props.schema) {
    error.value = 'No active connection or schema provided'
    return
  }
  
  isLoading.value = true
  error.value = null
  
  try {
    // If schema is provided via props, use it
    if (props.schema) {
      schemaText.value = props.schema
      processSchema()
      return
    }
    
    // Otherwise fetch from Dgraph
    const result = await dgraphClient.getSchema()
    
    if (result.error) {
      error.value = result.error.message
      return
    }
    
    if (result.data?.schema) {
      schemaText.value = result.data.schema
      processSchema()
    } else {
      error.value = 'No schema returned from Dgraph'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    isLoading.value = false
  }
}

// Process GraphQL schema to create graph structure
const processSchema = () => {
  if (!schemaText.value) {
    error.value = 'No schema to process'
    return
  }
  
  try {
    // Strip directives from the schema before parsing
    const strippedSchema = stripDirectives(schemaText.value)
    
    // Parse the schema
    const schema = buildSchema(strippedSchema)
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
        directives: extractDirectives(typeName, schemaText.value)
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
    
    nextTick(() => {
      renderGraph(graphData)
    })
  } catch (err) {
    error.value = `Error processing schema: ${err instanceof Error ? err.message : String(err)}`
    console.error('Schema processing error:', err)
  }
}

// Render the graph using D3.js
const renderGraph = (data: GraphData) => {
  if (!containerRef.value) {
    console.error('Container reference is null, cannot render graph')
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
    
    // Apply focus mode filtering if a node is focused
    let filteredData = { ...data }
    let nodeDistances: Map<string, number> | null = null
    
    if (focusedNodeId.value) {
      nodeDistances = calculateNodeDistances(data, focusedNodeId.value)
      
      // Filter nodes based on distance from focused node
      const filteredNodes = data.nodes.filter(node => {
        const distance = nodeDistances.get(node.id) || Infinity
        return distance <= maxDepth.value
      })
      
      // Filter links based on the filtered nodes
      const filteredLinks = data.links.filter(link => {
        const sourceId = typeof link.source === 'string' ? link.source : link.source.id
        const targetId = typeof link.target === 'string' ? link.target : link.target.id
        
        return filteredNodes.some(n => n.id === sourceId) && 
               filteredNodes.some(n => n.id === targetId)
      })
      
      filteredData = {
        nodes: filteredNodes,
        links: filteredLinks
      }
    }
    
    const width = containerRef.value.clientWidth || 800
    const height = 600
    
    // Create SVG container
    const svg = d3.select(containerRef.value)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height])
      .attr('style', 'max-width: 100%; height: auto;')
      .on('click', () => {
        // Clear focus when clicking on the background
        if (focusedNodeId.value) {
          focusedNodeId.value = null
          renderGraph(data)
        }
      })
    
    // Create zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    
    svg.call(zoom as any)
    
    // Create container for the graph
    const g = svg.append('g')
    
    // Improved force simulation with better parameters
    const simulation = d3.forceSimulation(filteredData.nodes as any)
      .force('link', d3.forceLink(filteredData.links as any)
        .id((d: any) => d.id)
        .distance(200)) // Increased distance between nodes
      .force('charge', d3.forceManyBody()
        .strength(-800)) // Stronger repulsion
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(100)) // Larger collision radius
      .force('x', d3.forceX(width / 2).strength(0.05)) // Gentle force toward center x
      .force('y', d3.forceY(height / 2).strength(0.05)) // Gentle force toward center y
    
    // Create links with improved styling
    const link = g.append('g')
      .selectAll('line')
      .data(filteredData.links)
      .join('line')
      .attr('stroke', '#ccc')
      .attr('stroke-opacity', 0.4)
      .attr('stroke-width', 1)
    
    // We'll create link labels as part of the link label groups below
    
    // Add white background to link labels for better readability
    // First, create a group for each link label to properly handle the background
    const linkLabelGroups = g.append('g')
      .selectAll('g')
      .data(filteredData.links)
      .join('g')
      .attr('class', 'link-label-group')
    
    // Add background rectangles to each group
    linkLabelGroups.append('rect')
      .attr('fill', 'white')
      .attr('fill-opacity', 0.8)
      .attr('rx', 2)
    
    // Add text to each group
    const linkLabelTexts = linkLabelGroups.append('text')
      .attr('font-size', 9)
      .attr('fill', '#666')
      .attr('text-anchor', 'middle')
      .attr('dy', -5)
      .text(d => d.relationship)
    
    // Size the rectangles based on the text dimensions
    linkLabelGroups.each(function() {
      const group = d3.select(this)
      const textElement = group.select('text').node() as SVGTextElement
      if (textElement) {
        const textBBox = textElement.getBBox()
        group.select('rect')
          .attr('x', textBBox.x - 2)
          .attr('y', textBBox.y - 2)
          .attr('width', textBBox.width + 4)
          .attr('height', textBBox.height + 4)
      }
    })
    
    // Create nodes with improved styling
    const node = g.append('g')
      .selectAll('g')
      .data(filteredData.nodes)
      .join('g')
      .call(drag(simulation) as any)
      .on('click', (event, d) => {
        event.stopPropagation() // Prevent click from propagating to SVG
        toggleFocusNode(d.id, data)
        renderGraph(data) // Re-render the graph with the new focus
      })
    
    // Calculate node height based on fields and directives
    const getNodeHeight = (d: GraphNode) => {
      const isFocused = focusedNodeId.value === d.id
      const fieldCount = d.fields?.length || 0
      const directiveCount = d.directives?.length || 0
      const baseHeight = 40 // Title height
      
      // Show all fields for focused node, otherwise limit to 5
      const fieldHeight = (isFocused ? fieldCount : Math.min(fieldCount, 5)) * 20
      const directiveHeight = directiveCount > 0 ? 20 : 0 // Space for directives
      const moreFieldsHeight = !isFocused && fieldCount > 5 ? 20 : 0 // "... more" text
      
      return baseHeight + fieldHeight + directiveHeight + moreFieldsHeight
    }
    
    // Add node rectangles with improved styling
    node.append('rect')
      .attr('width', d => {
        // Make focused node wider to accommodate all fields
        const isFocused = focusedNodeId.value === d.id
        const baseWidth = Math.max(d.name.length * 8 + 30, 120)
        return isFocused ? Math.max(baseWidth, 180) : baseWidth
      })
      .attr('height', d => getNodeHeight(d))
      .attr('rx', 6)
      .attr('ry', 6)
      .attr('fill', d => getNodeColor(d.kind))
      .attr('stroke', d => {
        // Highlight the focused node with a more prominent border
        return focusedNodeId.value === d.id ? '#1d4ed8' : getNodeStrokeColor(d.kind)
      })
      .attr('stroke-width', d => focusedNodeId.value === d.id ? 3 : 1.5)
      .attr('filter', 'drop-shadow(1px 1px 2px rgba(0,0,0,0.2))')
    
    // Add node titles with improved styling
    node.append('text')
      .attr('x', 10)
      .attr('y', 20)
      .attr('font-weight', 'bold')
      .attr('font-size', 12)
      .text(d => d.name)
    
    // Add directives if any
    node.each(function(d) {
      const nodeGroup = d3.select(this)
      
      if (d.directives && d.directives.length > 0) {
        nodeGroup.append('text')
          .attr('x', 10)
          .attr('y', 35)
          .attr('font-size', 9)
          .attr('fill', '#666')
          .text(d.directives.join(' '))
      }
    })
    
    // Add field names (all fields for focused node, limited to first 5 for others)
    node.each(function(d) {
      const nodeGroup = d3.select(this)
      const fields = d.fields || []
      const isFocused = focusedNodeId.value === d.id
      
      // Show all fields for focused node, otherwise limit to 5
      const displayFields = isFocused ? fields : fields.slice(0, 5)
      const directiveOffset = d.directives && d.directives.length > 0 ? 20 : 0
      
      displayFields.forEach((field, i) => {
        nodeGroup.append('text')
          .attr('x', 15)
          .attr('y', 40 + directiveOffset + i * 20)
          .attr('font-size', 11)
          .text(field)
      })
      
      // Only show "... more" for non-focused nodes
      if (!isFocused && fields.length > 5) {
        nodeGroup.append('text')
          .attr('x', 15)
          .attr('y', 40 + directiveOffset + 5 * 20)
          .attr('font-size', 11)
          .attr('fill', '#666')
          .text(`... ${fields.length - 5} more`)
      }
    })
    
    // Add a search box for filtering nodes
    const searchContainer = d3.select(containerRef.value)
      .append('div')
      .attr('class', 'absolute top-4 right-4 bg-white p-2 rounded shadow-md')
    
    searchContainer.append('input')
      .attr('type', 'text')
      .attr('placeholder', 'Search types...')
      .attr('class', 'border rounded px-2 py-1 text-sm w-48')
      .on('input', function() {
        const searchTerm = this.value.toLowerCase()
        
        // Filter nodes based on search term
        node.style('opacity', d => {
          if (!searchTerm) return 1
          return d.name.toLowerCase().includes(searchTerm) ? 1 : 0.2
        })
        
        // Filter links based on connected nodes
        link.style('opacity', d => {
          if (!searchTerm) return 0.4
          const sourceMatches = (d.source as any).name.toLowerCase().includes(searchTerm)
          const targetMatches = (d.target as any).name.toLowerCase().includes(searchTerm)
          return sourceMatches || targetMatches ? 0.8 : 0.1
        })
        
        // Filter link label groups
        linkLabelGroups.style('opacity', d => {
          if (!searchTerm) return 1
          const sourceMatches = (d.source as any).name.toLowerCase().includes(searchTerm)
          const targetMatches = (d.target as any).name.toLowerCase().includes(searchTerm)
          return sourceMatches || targetMatches ? 1 : 0.1
        })
      })
    
    // Add a reset button
    searchContainer.append('button')
      .attr('class', 'ml-2 bg-gray-200 px-2 py-1 rounded text-sm')
      .text('Reset')
      .on('click', () => {
        // Reset search input
        searchContainer.select('input').property('value', '')
        
        // Reset node and link opacity
        node.style('opacity', 1)
        link.style('opacity', 0.4)
        linkLabelGroups.style('opacity', 1)
        
        // Reset simulation
        simulation.alpha(0.3).restart()
      })
    
    // Add a layout button
    searchContainer.append('button')
      .attr('class', 'ml-2 bg-blue-100 px-2 py-1 rounded text-sm')
      .text('Improve Layout')
      .on('click', () => {
        // Adjust forces for better layout
        simulation
          .force('charge', d3.forceManyBody().strength(-1000))
          .force('link', d3.forceLink(filteredData.links as any)
            .id((d: any) => d.id)
            .distance(250))
          .force('collision', d3.forceCollide().radius(120))
          .alpha(0.5)
          .restart()
      })
      
    // Add focus mode controls if a node is focused
    if (focusedNodeId.value) {
      // Add a divider
      searchContainer.append('div')
        .attr('class', 'border-t my-2')
      
      // Add a label for focus mode
      searchContainer.append('div')
        .attr('class', 'text-xs font-medium mb-1 text-blue-800')
        .text(`Focus Mode: ${data.nodes.find(n => n.id === focusedNodeId.value)?.name} (locked at center)`)
      
      // Add depth control
      const depthControl = searchContainer.append('div')
        .attr('class', 'flex items-center')
      
      depthControl.append('span')
        .attr('class', 'text-xs mr-2')
        .text('Depth:')
      
      // Decrease depth button
      depthControl.append('button')
        .attr('class', 'bg-gray-200 px-2 py-0.5 rounded text-sm')
        .text('-')
        .attr('disabled', maxDepth.value <= 1 ? true : null)
        .style('opacity', maxDepth.value <= 1 ? 0.5 : 1)
        .on('click', () => {
          if (maxDepth.value > 1) {
            maxDepth.value--
            renderGraph(data)
          }
        })
      
      // Current depth
      depthControl.append('span')
        .attr('class', 'mx-2 text-sm')
        .text(maxDepth.value)
      
      // Increase depth button
      depthControl.append('button')
        .attr('class', 'bg-gray-200 px-2 py-0.5 rounded text-sm')
        .text('+')
        .on('click', () => {
          maxDepth.value++
          renderGraph(data)
        })
      
      // Exit focus mode button
      searchContainer.append('button')
        .attr('class', 'mt-2 w-full bg-blue-50 border border-blue-200 px-2 py-1 rounded text-sm text-blue-800')
        .text('Exit Focus Mode')
        .on('click', () => {
          focusedNodeId.value = null
          renderGraph(data)
        })
    }
    
    // Update positions on simulation tick
    simulation.on('tick', () => {
      // If a node is focused, lock it to the center of the viewport
      if (focusedNodeId.value) {
        const focusedNode = filteredData.nodes.find(n => n.id === focusedNodeId.value)
        if (focusedNode) {
          // Set the focused node position to the center
          const centerX = width / 2
          const centerY = height / 2
          
          // Calculate the offset between current position and center
          const dx = centerX - (focusedNode as any).x
          const dy = centerY - (focusedNode as any).y
          
          // Apply the offset to all nodes to keep relative positions
          filteredData.nodes.forEach((n: any) => {
            n.x += dx
            n.y += dy
          })
        }
      }
      
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)
      
      // Update the position of the link label groups
      linkLabelGroups
        .attr('transform', (d: any) => {
          const midX = (d.source.x + d.target.x) / 2
          const midY = (d.source.y + d.target.y) / 2
          return `translate(${midX}, ${midY})`
        })
      
      node.attr('transform', (d: any) => `translate(${d.x - 60}, ${d.y - 25})`)
    })
    
    // Create drag behavior
    function drag(simulation: any) {
      function dragstarted(event: any) {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        event.subject.fx = event.subject.x
        event.subject.fy = event.subject.y
        
        // If this is the focused node, prevent dragging to keep it centered
        if (focusedNodeId.value === event.subject.id) {
          event.sourceEvent.stopPropagation()
        }
      }
      
      function dragged(event: any) {
        // If this is the focused node, don't allow dragging
        if (focusedNodeId.value === event.subject.id) {
          return
        }
        
        event.subject.fx = event.x
        event.subject.fy = event.y
      }
      
      function dragended(event: any) {
        if (!event.active) simulation.alphaTarget(0)
        // Keep the node fixed where it was dropped
        // This helps maintain a manually arranged layout
        // event.subject.fx = null
        // event.subject.fy = null
      }
      
      return d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
    }
    
    // Initial zoom to fit
    const initialScale = 0.7
    const initialTransform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(initialScale)
      .translate(-width / 2, -height / 2)
    
    svg.call((zoom as any).transform, initialTransform)
    
    // Run simulation for a bit to get a better initial layout
    for (let i = 0; i < 100; ++i) simulation.tick()
  } catch (err) {
    error.value = `Error rendering graph: ${err instanceof Error ? err.message : String(err)}`
    console.error('Graph rendering error:', err)
  }
}

// Get color based on node kind with improved color scheme
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

// Get stroke color based on node kind
const getNodeStrokeColor = (kind: string) => {
  switch (kind) {
    case 'ObjectType':
      return '#1890ff'
    case 'InterfaceType':
      return '#fa8c16'
    case 'EnumType':
      return '#52c41a'
    case 'InputObjectType':
      return '#f5222d'
    case 'ScalarType':
      return '#722ed1'
    case 'UnionType':
      return '#2f54eb'
    default:
      return '#d9d9d9'
  }
}

// Calculate node distances from a focused node
const calculateNodeDistances = (data: GraphData, focusedId: string): Map<string, number> => {
  const distances = new Map<string, number>()
  
  // Initialize all distances to Infinity
  data.nodes.forEach(node => {
    distances.set(node.id, Infinity)
  })
  
  // Set the focused node distance to 0
  distances.set(focusedId, 0)
  
  // Create an adjacency list from the links
  const adjacencyList = new Map<string, string[]>()
  data.nodes.forEach(node => {
    adjacencyList.set(node.id, [])
  })
  
  data.links.forEach(link => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id
    const targetId = typeof link.target === 'string' ? link.target : link.target.id
    
    // Add both directions for undirected graph
    adjacencyList.get(sourceId)?.push(targetId)
    adjacencyList.get(targetId)?.push(sourceId)
  })
  
  // Breadth-first search to find shortest paths
  const queue: string[] = [focusedId]
  const visited = new Set<string>([focusedId])
  
  while (queue.length > 0) {
    const current = queue.shift()!
    const currentDistance = distances.get(current)!
    
    adjacencyList.get(current)?.forEach(neighbor => {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        distances.set(neighbor, currentDistance + 1)
        queue.push(neighbor)
      }
    })
  }
  
  return distances
}

// Toggle focus on a node
const toggleFocusNode = (nodeId: string, data: GraphData) => {
  if (focusedNodeId.value === nodeId) {
    // If clicking the already focused node, clear focus
    focusedNodeId.value = null
  } else {
    // Otherwise, set focus to the clicked node
    focusedNodeId.value = nodeId
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
    
    <div v-else class="flex-1 border rounded-md overflow-hidden relative">
      <div ref="containerRef" class="w-full h-full" style="min-height: 600px;"></div>
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
