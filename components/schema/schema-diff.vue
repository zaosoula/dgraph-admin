<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { graphql } from 'cm6-graphql'
import { diffConfig, MergeView } from '@codemirror/merge'

const props = defineProps<{
  originalSchema: string
  newSchema: string
}>()

// DOM refs
const diffContainer = ref<HTMLElement | null>(null)
let mergeView: MergeView | null = null

// Count of changes
const changeCount = computed(() => {
  // This is a simplified count based on line differences
  const originalLines = props.originalSchema.split('\n').length
  const newLines = props.newSchema.split('\n').length
  
  return {
    additions: Math.max(0, newLines - originalLines),
    deletions: Math.max(0, originalLines - newLines),
    modifications: 0 // This is harder to calculate without parsing the diff
  }
})

// Create and configure the merge view
onMounted(() => {
  if (diffContainer.value) {
    createMergeView()
  }
})

// Watch for changes in the schemas and update the merge view
watch([() => props.originalSchema, () => props.newSchema], () => {
  if (diffContainer.value) {
    // Destroy the previous merge view if it exists
    if (mergeView) {
      mergeView.destroy()
      mergeView = null
    }
    
    // Create a new merge view with the updated schemas
    createMergeView()
  }
})

// Create the merge view with CodeMirror
const createMergeView = () => {
  if (!diffContainer.value) return
  
  // Clear the container
  diffContainer.value.innerHTML = ''
  
  // Configure the merge view
  const config = {
    a: {
      doc: props.originalSchema,
      extensions: [
        basicSetup,
        graphql(),
        EditorState.readOnly.of(true),
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-content": { fontFamily: "monospace" }
        })
      ]
    },
    b: {
      doc: props.newSchema,
      extensions: [
        basicSetup,
        graphql(),
        EditorState.readOnly.of(true),
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-content": { fontFamily: "monospace" }
        })
      ]
    },
    parent: diffContainer.value,
    revertControls: false,
    highlightChanges: true,
    collapseUnchanged: {
      margin: 10,
      minSize: 3
    }
  }
  
  // Create the merge view
  mergeView = new MergeView(diffConfig(config))
}

// Clean up when component is unmounted
onMounted(() => {
  return () => {
    if (mergeView) {
      mergeView.destroy()
      mergeView = null
    }
  }
})
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex justify-between items-center mb-2">
      <h3 class="text-lg font-medium">Schema Diff</h3>
      
      <div class="text-sm text-muted-foreground">
        <span class="text-green-600">+{{ changeCount.additions }}</span> /
        <span class="text-red-600">-{{ changeCount.deletions }}</span> changes
      </div>
    </div>
    
    <div class="flex-1 border rounded-md overflow-auto">
      <div ref="diffContainer" class="h-full"></div>
    </div>
  </div>
</template>

<style>
/* CodeMirror Merge Styles */
.cm-merge {
  height: 100%;
}

.cm-merge-gap {
  background-color: #f9fafb;
  border-left: 1px solid #e5e7eb;
  border-right: 1px solid #e5e7eb;
}

.cm-merge-2pane .cm-merge-pane {
  width: 50%;
}

.cm-merge-pane-original {
  border-right: 1px solid #e5e7eb;
}

/* Diff highlighting */
.cm-merge-deleted {
  background-color: #fee2e2;
}

.cm-merge-inserted {
  background-color: #dcfce7;
}

/* Make sure the editors take full height */
.cm-editor {
  height: 100%;
}
</style>
