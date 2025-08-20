<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import * as diffLib from 'diff'

const props = defineProps<{
  originalSchema: string
  newSchema: string
}>()

const diffResult = computed(() => {
  return diffLib.diffLines(props.originalSchema, props.newSchema)
})

// Format the diff for display
const formattedDiff = computed(() => {
  return diffResult.value.map((part, index) => {
    const prefix = part.added ? '+' : part.removed ? '-' : ' '
    const className = part.added ? 'text-green-600 bg-green-50' : part.removed ? 'text-red-600 bg-red-50' : ''
    
    return {
      id: index,
      prefix,
      text: part.value,
      className
    }
  })
})

// Count of changes
const changeCount = computed(() => {
  return diffResult.value.reduce(
    (acc, part) => {
      if (part.added) acc.additions += part.count || 0
      if (part.removed) acc.deletions += part.count || 0
      return acc
    },
    { additions: 0, deletions: 0 }
  )
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
      <pre class="p-4 font-mono text-sm whitespace-pre-wrap"><code><template v-for="(part, index) in formattedDiff" :key="part.id">
<span :class="part.className">{{ part.prefix }}{{ part.text }}</span></template></code></pre>
    </div>
  </div>
</template>

