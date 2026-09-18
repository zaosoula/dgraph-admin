import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import * as diffLib from 'diff'
import Prism from 'prismjs'
import 'prismjs/components/prism-graphql'
import 'prismjs/themes/prism.css'

export type SchemaDiffHighlight = {
  start: number
  end: number
  isRemoved?: boolean
  isAdded?: boolean
}

export type SchemaDiffLine = {
  leftLineNumber: number | null
  rightLineNumber: number | null
  leftContent: string | null
  rightContent: string | null
  leftClass: string
  rightClass: string
  leftHighlights?: SchemaDiffHighlight[]
  rightHighlights?: SchemaDiffHighlight[]
}

export type HighlightedSchemaDiffLine = SchemaDiffLine & {
  leftContentHighlighted: string | null
  rightContentHighlighted: string | null
}

export type SchemaChangeCount = {
  additions: number
  deletions: number
  modifications: number
}

const ADDED_CLASS = 'bg-success-subtle text-success'
const REMOVED_CLASS = 'bg-danger-subtle text-danger'

// Apply GraphQL syntax highlighting to a fragment of a line
const applySyntaxHighlighting = (code: string): string => {
  return Prism.highlight(code, Prism.languages.graphql, 'graphql')
}

// Combine syntax highlighting with word-level diff highlighting
const highlightLine = (line: string, highlights?: SchemaDiffHighlight[]): string => {
  if (!line) return ''

  // If no diff highlights, just apply syntax highlighting
  if (!highlights || highlights.length === 0) {
    return applySyntaxHighlighting(line)
  }

  // Sort highlights by start position
  const sortedHighlights = [...highlights].sort((a, b) => a.start - b.start)

  // Build the highlighted line
  let result = ''
  let lastEnd = 0

  for (const highlight of sortedHighlights) {
    // Add the text before the highlight with syntax highlighting
    const beforeText = line.substring(lastEnd, highlight.start)
    if (beforeText) {
      result += applySyntaxHighlighting(beforeText)
    }

    // Add the highlighted text with both syntax and diff highlighting
    const highlightedText = line.substring(highlight.start, highlight.end)
    const syntaxHighlighted = applySyntaxHighlighting(highlightedText)
    const highlightClass = highlight.isRemoved ? 'bg-danger/25' : highlight.isAdded ? 'bg-success/25' : ''

    result += `<span class="${highlightClass}">${syntaxHighlighted}</span>`

    lastEnd = highlight.end
  }

  // Add any remaining text with syntax highlighting
  const remainingText = line.substring(lastEnd)
  if (remainingText) {
    result += applySyntaxHighlighting(remainingText)
  }

  return result
}

// Build a side-by-side, line-level diff with word-level highlighting on modified pairs
const buildDiff = (originalSchema: string, newSchema: string): SchemaDiffLine[] => {
  if (!originalSchema && !newSchema) return []

  // First, get line-level diff to identify changed lines
  const lineDiff = diffLib.diffLines(originalSchema, newSchema)

  // Process the line diff to create a structured representation
  const result: SchemaDiffLine[] = []

  let leftLineCount = 0
  let rightLineCount = 0

  // Process each chunk from the line diff
  lineDiff.forEach(part => {
    const lines = part.value.split('\n')
    // Remove the last empty line that results from splitting a string that ends with \n
    if (lines[lines.length - 1] === '') {
      lines.pop()
    }

    if (part.added) {
      // Added lines - show only on the right
      lines.forEach(line => {
        rightLineCount++
        result.push({
          leftLineNumber: null,
          rightLineNumber: rightLineCount,
          leftContent: null,
          rightContent: line,
          leftClass: '',
          rightClass: ADDED_CLASS
        })
      })
    } else if (part.removed) {
      // Removed lines - show only on the left
      lines.forEach(line => {
        leftLineCount++
        result.push({
          leftLineNumber: leftLineCount,
          rightLineNumber: null,
          leftContent: line,
          rightContent: null,
          leftClass: REMOVED_CLASS,
          rightClass: ''
        })
      })
    } else {
      // Unchanged lines - show on both sides
      lines.forEach(line => {
        leftLineCount++
        rightLineCount++
        result.push({
          leftLineNumber: leftLineCount,
          rightLineNumber: rightLineCount,
          leftContent: line,
          rightContent: line,
          leftClass: '',
          rightClass: ''
        })
      })
    }
  })

  // Now, find pairs of removed/added lines that might be modifications of each other
  // and apply word-level diffing to them
  for (let i = 0; i < result.length - 1; i++) {
    const current = result[i]
    const next = result[i + 1]

    if (!current || !next) continue

    // Check if we have a removed line followed by an added line
    if (current.leftContent !== null && current.rightContent === null &&
        next.leftContent === null && next.rightContent !== null) {

      // Apply word-level diffing
      const wordDiff = diffLib.diffWords(current.leftContent, next.rightContent)

      // Process word diff for highlighting
      const leftHighlights: SchemaDiffHighlight[] = []
      const rightHighlights: SchemaDiffHighlight[] = []

      let leftPos = 0
      let rightPos = 0

      wordDiff.forEach(part => {
        if (part.removed) {
          leftHighlights.push({
            start: leftPos,
            end: leftPos + part.value.length,
            isRemoved: true
          })
          leftPos += part.value.length
        } else if (part.added) {
          rightHighlights.push({
            start: rightPos,
            end: rightPos + part.value.length,
            isAdded: true
          })
          rightPos += part.value.length
        } else {
          leftPos += part.value.length
          rightPos += part.value.length
        }
      })

      // Add the highlights to the result
      current.leftHighlights = leftHighlights
      next.rightHighlights = rightHighlights

      // Mark these lines as a pair
      current.rightLineNumber = next.rightLineNumber
      next.leftLineNumber = current.leftLineNumber
    }
  }

  return result
}

/**
 * Shared side-by-side schema diff.
 *
 * Consumed by `components/schema/schema-diff.vue` (version comparison) and
 * `components/schema/schema-editor.vue` (unsaved-changes preview).
 */
export function useSchemaDiff(
  originalSchema: MaybeRefOrGetter<string>,
  newSchema: MaybeRefOrGetter<string>
) {
  const processedDiff = computed(() => buildDiff(toValue(originalSchema), toValue(newSchema)))

  // Count of changes
  const changeCount = computed<SchemaChangeCount>(() => {
    return {
      additions: processedDiff.value.filter(line => line.rightContent !== null && line.leftContent === null).length,
      deletions: processedDiff.value.filter(line => line.leftContent !== null && line.rightContent === null).length,
      // `buildDiff` assigns `leftHighlights` to the removed row of each modified
      // pair exactly once, so counting that property counts pairs directly.
      // Halving a row count instead reports "0.5" when a change only adds text
      // (`String` -> `String!`), because the removed row's highlight list is empty.
      modifications: processedDiff.value.filter(line => line.leftHighlights !== undefined).length
    }
  })

  // Apply syntax highlighting to all lines
  const syntaxHighlightedDiff = computed<HighlightedSchemaDiffLine[]>(() => {
    return processedDiff.value.map(line => {
      return {
        ...line,
        leftContentHighlighted: line.leftContent !== null
          ? (line.leftHighlights ? highlightLine(line.leftContent, line.leftHighlights) : applySyntaxHighlighting(line.leftContent))
          : null,
        rightContentHighlighted: line.rightContent !== null
          ? (line.rightHighlights ? highlightLine(line.rightContent, line.rightHighlights) : applySyntaxHighlighting(line.rightContent))
          : null
      }
    })
  })

  return {
    processedDiff,
    changeCount,
    syntaxHighlightedDiff
  }
}
