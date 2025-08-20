<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { QueryResult } from '@/types/query'

const props = defineProps<{
  result: QueryResult | null
  isLoading: boolean
}>()

const resultText = ref<string>('')

// Format the result as JSON
const formatResult = (result: QueryResult | null) => {
  if (!result) return ''
  return JSON.stringify(result, null, 2)
}

// Update the result text when the result changes
watch(() => props.result, (newResult) => {
  resultText.value = formatResult(newResult)
}, { immediate: true })

// Computed properties for UI
const hasErrors = computed(() => {
  return props.result?.errors && props.result.errors.length > 0
})

const hasData = computed(() => {
  return props.result?.data !== undefined
})

// Copy result to clipboard
const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(resultText.value)
    // Could add a toast notification here
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex justify-between items-center mb-2">
      <h3 class="text-lg font-medium">Results</h3>
      
      <div class="flex items-center space-x-4">
        <div v-if="props.result?.duration" class="text-sm text-muted-foreground">
          {{ props.result.duration.toFixed(2) }}ms
        </div>
        
        <UiButton 
          size="sm" 
          variant="outline"
          @click="copyToClipboard" 
          :disabled="!props.result"
        >
          Copy
        </UiButton>
      </div>
    </div>
    
    <div v-if="props.isLoading" class="flex items-center justify-center p-4 flex-1 border rounded-md">
      <div class="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
    </div>
    
    <div v-else-if="!props.result" class="flex items-center justify-center p-4 flex-1 border rounded-md text-muted-foreground">
      No results yet. Execute a query to see results here.
    </div>
    
    <div v-else class="flex-1 border rounded-md overflow-hidden" :class="{ 'border-red-500': hasErrors && !hasData }">
      <pre
        class="w-full h-full p-4 font-mono text-sm overflow-auto"
        :class="{ 'bg-red-50': hasErrors && !hasData }"
      >{{ resultText }}</pre>
    </div>
    
    <div v-if="hasErrors" class="mt-2 text-xs text-red-500">
      {{ props.result?.errors?.[0]?.message }}
      <span v-if="props.result?.errors && props.result.errors.length > 1">
        (and {{ props.result.errors.length - 1 }} more errors)
      </span>
    </div>
  </div>
</template>
