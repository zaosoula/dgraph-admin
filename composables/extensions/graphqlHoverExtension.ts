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
    <div class="max-w-md rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg">
      <div class="flex items-center gap-2 mb-2">
        <span class="rounded border px-1.5 py-0.5 text-[11px] font-medium ${getKindBadgeClass(typeDef.kind)}">
          ${escapeHtml(typeDef.kind)}
        </span>
        <span class="font-mono font-semibold">${escapeHtml(typeDef.name)}</span>
      </div>
  `

  if (typeDef.description) {
    content += `
      <div class="mb-3 text-xs leading-5 text-muted-foreground">
        ${escapeHtml(typeDef.description)}
      </div>
    `
  }

  if (typeDef.fields && typeDef.fields.length > 0) {
    content += `
      <div class="border-t border-border pt-2">
        <div class="mb-2 text-[11px] font-medium text-muted-foreground">
          ${typeDef.kind === 'Enum' ? 'Values' : 'Fields'}:
        </div>
        <div class="space-y-1 max-h-32 overflow-y-auto">
    `

    const fieldsToShow = typeDef.fields.slice(0, 8) // Limit to 8 fields
    for (const field of fieldsToShow) {
      content += `
        <div class="flex items-center gap-2 text-xs">
          <span class="font-mono text-cm-property">${escapeHtml(field.name)}</span>
          ${typeDef.kind !== 'Enum' ? `<span class="text-muted-foreground">:</span>
          <span class="font-mono text-cm-type">${escapeHtml(field.type)}</span>` : ''}
        </div>
      `
    }

    if (typeDef.fields.length > 8) {
      content += `
        <div class="text-[11px] italic text-muted-foreground">
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
      <div class="mt-2 border-t border-border pt-2 font-mono text-[11px] text-muted-foreground">
        Line ${typeDef.location.line}, Column ${typeDef.location.column}
      </div>
    </div>
  `

  return content
}

function getKindBadgeClass(kind: string): string {
  // The badge only distinguishes kinds; every value comes from the design tokens
  // so the tooltip follows the active theme like the rest of the app.
  switch (kind) {
    case 'ObjectType':
      return 'border-info-border bg-info-subtle text-info'
    case 'Interface':
      return 'border-border bg-muted text-cm-keyword'
    case 'Enum':
      return 'border-success-border bg-success-subtle text-success'
    case 'Union':
      return 'border-warning-border bg-warning-subtle text-warning'
    case 'Input':
      return 'border-border bg-muted text-cm-meta'
    case 'Scalar':
    default:
      return 'border-border bg-muted text-muted-foreground'
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
