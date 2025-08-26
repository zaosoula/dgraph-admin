<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import * as diffLib from 'diff'
import Prism from 'prismjs'
import 'prismjs/components/prism-graphql'
import 'prismjs/themes/prism.css'

const props = defineProps<{
  originalSchema: string
  newSchema: string
}>()

// First, split both schemas into lines
const originalLines = computed(() => props.originalSchema.split('\n'))
const newLines = computed(() => props.newSchema.split('\n'))

// Process the diff to create a line-by-line comparison with word-level highlighting
const processedDiff = computed(() => {
  // First, get line-level diff to identify changed lines
  const lineDiff = diffLib.diffLines(props.originalSchema, props.newSchema)
  
  // Process the line diff to create a structured representation
  const result: {
    leftLineNumber: number | null
    rightLineNumber: number | null
    leftContent: string | null
    rightContent: string | null
    leftClass: string
    rightClass: string
    leftHighlights?: Array<{ start: number; end: number; isRemoved: boolean }>
    rightHighlights?: Array<{ start: number; end: number; isAdded: boolean }>
  }[] = []
  
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
          rightClass: 'bg-green-50'
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
          leftClass: 'bg-red-50',
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
    
    // Check if we have a removed line followed by an added line
    if (current.leftContent !== null && current.rightContent === null &&
        next.leftContent === null && next.rightContent !== null) {
      
      // Apply word-level diffing
      const wordDiff = diffLib.diffWords(current.leftContent, next.rightContent)
      
      // Process word diff for highlighting
      const leftHighlights: Array<{ start: number; end: number; isRemoved: boolean }> = []
      const rightHighlights: Array<{ start: number; end: number; isAdded: boolean }> = []
      
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
})

// Count of changes
const changeCount = computed(() => {
  return {
    additions: processedDiff.value.filter(line => line.rightContent !== null && line.leftContent === null).length,
    deletions: processedDiff.value.filter(line => line.leftContent !== null && line.rightContent === null).length,
    modifications: processedDiff.value.filter(line => 
      (line.leftHighlights && line.leftHighlights.length > 0) || 
      (line.rightHighlights && line.rightHighlights.length > 0)
    ).length / 2 // Divide by 2 because each modification is counted twice (once for left, once for right)
  }
})

// Apply syntax highlighting to a line
const applySyntaxHighlighting = (code: string): string => {
  return Prism.highlight(code, Prism.languages.graphql, 'graphql')
}

// Helper function to highlight parts of a line with both syntax highlighting and diff highlighting
const highlightLine = (line: string, highlights?: Array<{ start: number; end: number; isRemoved?: boolean; isAdded?: boolean }>) => {
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
    const highlightClass = highlight.isRemoved ? 'bg-red-200' : highlight.isAdded ? 'bg-green-200' : ''
    
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

// Apply syntax highlighting to all lines
const syntaxHighlightedDiff = computed(() => {
  return processedDiff.value.map(line => {
    return {
      ...line,
      leftContentHighlighted: line.leftContent !== null ? 
        (line.leftHighlights ? highlightLine(line.leftContent, line.leftHighlights) : applySyntaxHighlighting(line.leftContent)) : null,
      rightContentHighlighted: line.rightContent !== null ? 
        (line.rightHighlights ? highlightLine(line.rightContent, line.rightHighlights) : applySyntaxHighlighting(line.rightContent)) : null
    }
  })
})
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex justify-between items-center mb-2">
      <h3 class="text-lg font-medium">Schema Diff</h3>
      
      <div class="text-sm text-muted-foreground">
        <span class="text-green-600">+{{ changeCount.additions }}</span> /
        <span class="text-red-600">-{{ changeCount.deletions }}</span> changes
        <span v-if="changeCount.modifications > 0" class="text-yellow-600 ml-1">({{ changeCount.modifications }} modified)</span>
      </div>
    </div>
    
    <div class="flex-1 border rounded-md overflow-auto">
      <div class="flex font-mono text-sm">
        <!-- Left column (removed) -->
        <div class="w-1/2 border-r">
          <div class="flex">
            <!-- Line numbers -->
            <div class="w-10 text-right pr-2 text-gray-500 select-none border-r bg-gray-50">
              <div v-for="line in syntaxHighlightedDiff" :key="`left-${line.leftLineNumber || 'empty'}`" class="px-2">
                {{ line.leftLineNumber || ' ' }}
              </div>
            </div>
            <!-- Content -->
            <div class="flex-1 overflow-x-auto">
              <div 
                v-for="line in syntaxHighlightedDiff" 
                :key="`left-content-${line.leftLineNumber || 'empty'}`"
                :class="line.leftClass"
                class="px-2 whitespace-pre"
              >
                <template v-if="line.leftContent !== null">
                  <span v-html="line.leftContentHighlighted"></span>
                </template>
                <span v-else>&nbsp;</span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Right column (added) -->
        <div class="w-1/2">
          <div class="flex">
            <!-- Line numbers -->
            <div class="w-10 text-right pr-2 text-gray-500 select-none border-r bg-gray-50">
              <div v-for="line in syntaxHighlightedDiff" :key="`right-${line.rightLineNumber || 'empty'}`" class="px-2">
                {{ line.rightLineNumber || ' ' }}
              </div>
            </div>
            <!-- Content -->
            <div class="flex-1 overflow-x-auto">
              <div 
                v-for="line in syntaxHighlightedDiff" 
                :key="`right-content-${line.rightLineNumber || 'empty'}`"
                :class="line.rightClass"
                class="px-2 whitespace-pre"
              >
                <template v-if="line.rightContent !== null">
                  <span v-html="line.rightContentHighlighted"></span>
                </template>
                <span v-else>&nbsp;</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* Override Prism styles to ensure they work well with our diff highlighting */
.token {
  background: transparent !important;
}
</style>
