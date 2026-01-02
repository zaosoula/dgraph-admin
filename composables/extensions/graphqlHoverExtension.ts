import { EditorView, hoverTooltip } from '@codemirror/view'
import { type TypeDefinition } from '../useGraphQLSchemaParser'

export function createGraphQLHoverExtension(
  findTypeDefinition: (typeName: string) => TypeDefinition | undefined,
  findTypeAtPosition: (position: number) => { name: string; location: any } | undefined
) {
  return hoverTooltip((view, pos, side) => {
    // Get the word at the current position
    const word = view.state.wordAt(pos)
    if (!word) return null

    // Get the text of the word
    const wordText = view.state.doc.sliceString(word.from, word.to)
    
    // Check if this position corresponds to a type reference
    const typeRef = findTypeAtPosition(pos)
    if (!typeRef) return null

    // Find the type definition
    const typeDef = findTypeDefinition(typeRef.name)
    if (!typeDef) return null

    // Create tooltip content
    const tooltipContent = createTooltipContent(typeDef)

    return {
      pos: word.from,
      end: word.to,
      above: true,
      create: () => {
        const dom = document.createElement('div')
        dom.className = 'graphql-hover-tooltip'
        dom.innerHTML = tooltipContent
        return { dom }
      }
    }
  })
}

function createTooltipContent(typeDef: TypeDefinition): string {
  let content = `
    <div class="p-3 bg-white border border-gray-200 rounded-lg shadow-lg max-w-md">
      <div class="flex items-center gap-2 mb-2">
        <span class="px-2 py-1 text-xs font-medium rounded ${getKindBadgeClass(typeDef.kind)}">
          ${typeDef.kind}
        </span>
        <span class="font-semibold text-gray-900">${typeDef.name}</span>
      </div>
  `

  if (typeDef.description) {
    content += `
      <div class="text-sm text-gray-600 mb-3">
        ${escapeHtml(typeDef.description)}
      </div>
    `
  }

  if (typeDef.fields && typeDef.fields.length > 0) {
    content += `
      <div class="border-t pt-2">
        <div class="text-xs font-medium text-gray-500 mb-2">
          ${typeDef.kind === 'Enum' ? 'Values' : 'Fields'}:
        </div>
        <div class="space-y-1 max-h-32 overflow-y-auto">
    `

    const fieldsToShow = typeDef.fields.slice(0, 8) // Limit to 8 fields
    for (const field of fieldsToShow) {
      content += `
        <div class="flex items-center gap-2 text-xs">
          <span class="font-mono text-blue-600">${field.name}</span>
          ${typeDef.kind !== 'Enum' ? `<span class="text-gray-400">:</span>
          <span class="font-mono text-green-600">${escapeHtml(field.type)}</span>` : ''}
        </div>
      `
    }

    if (typeDef.fields.length > 8) {
      content += `
        <div class="text-xs text-gray-400 italic">
          ... and ${typeDef.fields.length - 8} more
        </div>
      `
    }

    content += `
        </div>
      </div>
    `
  }

  content += `
      <div class="text-xs text-gray-400 mt-2 pt-2 border-t">
        Line ${typeDef.location.line}, Column ${typeDef.location.column}
      </div>
    </div>
  `

  return content
}

function getKindBadgeClass(kind: string): string {
  switch (kind) {
    case 'ObjectType':
      return 'bg-blue-100 text-blue-800'
    case 'Interface':
      return 'bg-purple-100 text-purple-800'
    case 'Enum':
      return 'bg-green-100 text-green-800'
    case 'Union':
      return 'bg-orange-100 text-orange-800'
    case 'Input':
      return 'bg-yellow-100 text-yellow-800'
    case 'Scalar':
      return 'bg-gray-100 text-gray-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// CSS styles for the tooltip (to be added to the component)
export const tooltipStyles = `
.graphql-hover-tooltip {
  z-index: 1000;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.graphql-hover-tooltip .font-mono {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
}
`
