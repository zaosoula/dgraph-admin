<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { buildSchema } from 'graphql'
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

// Graph data structure.
//
// The datum types extend d3's simulation shapes: `SimulationNodeDatum` supplies
// the mutable x/y/fx/fy the layout writes, and `SimulationLinkDatum` types the
// endpoints, which d3 rewrites from ids to node objects once the simulation
// starts.
type GraphNode = d3.SimulationNodeDatum & {
  id: string
  name: string
  kind: string
  fields?: string[]
  description?: string
  directives?: string[]
}

type GraphLink = d3.SimulationLinkDatum<GraphNode> & {
  source: string | GraphNode
  target: string | GraphNode
  relationship: string
}

/** After the simulation starts, d3 has replaced endpoint ids with node objects. */
const endpoint = (value: GraphLink['source']): GraphNode => value as GraphNode

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
    
    const width = containerRef.value.clientWidth || 800
    const height = 600
    
    // Create SVG container
    const svg = d3.select(containerRef.value)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height])
      .attr('style', 'max-width: 100%; height: auto;')
    
    // Create zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    
    svg.call(zoom)
    
    // Create container for the graph
    const g = svg.append('g')
    
    // Improved force simulation with better parameters
    const simulation = d3.forceSimulation<GraphNode>(data.nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(data.links)
        .id(d => d.id)
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
      .data(data.links)
      .join('line')
      .style('stroke', 'var(--border-strong)')
      .attr('stroke-opacity', 0.5)
      .attr('stroke-width', 1)
    
    // We'll create link labels as part of the link label groups below
    
    // Add white background to link labels for better readability
    // First, create a group for each link label to properly handle the background
    const linkLabelGroups = g.append('g')
      .selectAll('g')
      .data(data.links)
      .join('g')
      .attr('class', 'link-label-group')
    
    // Add background rectangles to each group
    linkLabelGroups.append('rect')
      .style('fill', 'var(--card)')
      .attr('fill-opacity', 0.9)
      .attr('rx', 2)
    
    // Add text to each group
    linkLabelGroups.append('text')
      .attr('font-size', 9)
      .style('fill', 'var(--muted-foreground)')
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
      .selectAll<SVGGElement, GraphNode>('g')
      .data(data.nodes)
      .join('g')
      .call(drag(simulation))
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
    
    // Add node rectangles with improved styling
    node.append('rect')
      .attr('width', d => Math.max(d.name.length * 8 + 30, 120))
      .attr('height', d => getNodeHeight(d))
      .attr('rx', 6)
      .attr('ry', 6)
      .style('fill', 'var(--card)')
      .style('stroke', d => getNodeStrokeColor(d.kind))
      .attr('stroke-width', 1.5)
    
    // Add node titles with improved styling
    node.append('text')
      .attr('x', 10)
      .attr('y', 20)
      .attr('font-weight', 600)
      .attr('font-size', 12)
      .style('fill', 'var(--card-foreground)')
      .text(d => d.name)
    
    // Add directives if any
    node.each(function(d) {
      const nodeGroup = d3.select(this)
      
      if (d.directives && d.directives.length > 0) {
        nodeGroup.append('text')
          .attr('x', 10)
          .attr('y', 35)
          .attr('font-size', 9)
          .style('fill', 'var(--muted-foreground)')
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
          .attr('font-size', 11)
          .style('fill', 'var(--card-foreground)')
          .text(field)
      })
      
      if (fields.length > 5) {
        nodeGroup.append('text')
          .attr('x', 15)
          .attr('y', 40 + directiveOffset + 5 * 20)
          .attr('font-size', 11)
          .style('fill', 'var(--muted-foreground)')
          .text(`... ${fields.length - 5} more`)
      }
    })
    
    // Add a search box for filtering nodes
    const searchContainer = d3.select(containerRef.value)
      .append('div')
      .attr('class', 'absolute top-3 right-3 flex items-center gap-1.5 rounded-md border border-border bg-card p-1.5 shadow-lg')
    
    searchContainer.append('input')
      .attr('type', 'text')
      .attr('placeholder', 'Search types...')
      .attr('class', 'h-7 w-44 rounded-md border border-input bg-card px-2 text-xs outline-none')
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
          const sourceMatches = endpoint(d.source).name.toLowerCase().includes(searchTerm)
          const targetMatches = endpoint(d.target).name.toLowerCase().includes(searchTerm)
          return sourceMatches || targetMatches ? 0.8 : 0.1
        })
        
        // Filter link label groups
        linkLabelGroups.style('opacity', d => {
          if (!searchTerm) return 1
          const sourceMatches = endpoint(d.source).name.toLowerCase().includes(searchTerm)
          const targetMatches = endpoint(d.target).name.toLowerCase().includes(searchTerm)
          return sourceMatches || targetMatches ? 1 : 0.1
        })
      })
    
    // Add a reset button
    searchContainer.append('button')
      .attr('class', 'h-7 rounded-md border border-input bg-card px-2 text-xs font-medium hover:bg-accent')
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
      .attr('class', 'h-7 rounded-md border border-input bg-card px-2 text-xs font-medium hover:bg-accent')
      .text('Improve Layout')
      .on('click', () => {
        // Adjust forces for better layout
        simulation
          .force('charge', d3.forceManyBody().strength(-1000))
          .force('link', d3.forceLink<GraphNode, GraphLink>(data.links)
            .id(d => d.id)
            .distance(250))
          .force('collision', d3.forceCollide().radius(120))
          .alpha(0.5)
          .restart()
      })
    
    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => endpoint(d.source).x ?? 0)
        .attr('y1', d => endpoint(d.source).y ?? 0)
        .attr('x2', d => endpoint(d.target).x ?? 0)
        .attr('y2', d => endpoint(d.target).y ?? 0)
      
      // Update the position of the link label groups
      linkLabelGroups
        .attr('transform', d => {
          const midX = ((endpoint(d.source).x ?? 0) + (endpoint(d.target).x ?? 0)) / 2
          const midY = ((endpoint(d.source).y ?? 0) + (endpoint(d.target).y ?? 0)) / 2
          return `translate(${midX}, ${midY})`
        })
      
      node.attr('transform', d => `translate(${(d.x ?? 0) - 60}, ${(d.y ?? 0) - 25})`)
    })
    
    // Create drag behavior
    function drag(simulation: d3.Simulation<GraphNode, GraphLink>) {
      type DragEvent = d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>

      function dragstarted(event: DragEvent) {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        event.subject.fx = event.subject.x
        event.subject.fy = event.subject.y
      }

      function dragged(event: DragEvent) {
        event.subject.fx = event.x
        event.subject.fy = event.y
      }

      function dragended(event: DragEvent) {
        if (!event.active) simulation.alphaTarget(0)
        // Keep the node fixed where it was dropped
        // This helps maintain a manually arranged layout
        // event.subject.fx = null
        // event.subject.fy = null
      }
      
      return d3.drag<SVGGElement, GraphNode>()
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
    
    svg.call(zoom.transform, initialTransform)
    
    // Run simulation for a bit to get a better initial layout
    for (let i = 0; i < 100; ++i) simulation.tick()
  } catch (err) {
    error.value = `Error rendering graph: ${err instanceof Error ? err.message : String(err)}`
    console.error('Graph rendering error:', err)
  }
}

// Stroke colour per type kind. The node body always uses the card surface so the
// diagram reads the same in both themes; only the rule around it carries the kind.
const getNodeStrokeColor = (kind: string) => {
  switch (kind) {
    case 'ObjectType':
      return 'oklch(0.62 0.13 250)'
    case 'InterfaceType':
      return 'oklch(0.66 0.13 60)'
    case 'EnumType':
      return 'oklch(0.62 0.13 150)'
    case 'InputObjectType':
      return 'oklch(0.62 0.16 20)'
    case 'ScalarType':
      return 'oklch(0.60 0.14 305)'
    case 'UnionType':
      return 'oklch(0.60 0.12 200)'
    default:
      return 'var(--border-strong)'
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
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-[13px] font-semibold tracking-tight">Schema diagram</h3>
      
      <div class="flex space-x-2">
        <UiButton 
          variant="outline" 
          size="sm" 
          :disabled="isLoading || (!connectionsStore.activeConnection && !props.schema)" 
          @click="loadSchema"
        >
          Reload
        </UiButton>
      </div>
    </div>
    
    <div
      v-if="error"
      class="mb-2 rounded-md border border-danger-border bg-danger-subtle px-3 py-2 text-xs leading-5 text-danger"
    >
      {{ error }}
    </div>
    
    <div v-if="isLoading" class="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
      <div class="h-4 w-4 animate-spin rounded-full border-2 border-border-strong border-t-foreground"/>
      Loading schema…
    </div>
    
    <div v-else class="relative flex-1 overflow-hidden rounded-md border border-border">
      <div ref="containerRef" class="w-full h-full" style="min-height: 600px;"/>
    </div>
  </div>
</template>

<style>
.node-tooltip {
  position: absolute;
  background-color: var(--popover);
  color: var(--popover-foreground);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px;
  font-size: 12px;
  pointer-events: none;
  z-index: 10;
  max-width: 300px;
  box-shadow: 0 8px 24px -12px rgb(0 0 0 / 0.35);
}
</style>
