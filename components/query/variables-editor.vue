<script setup lang="ts">
import { ref, watch } from 'vue'
import type { QueryVariables } from '@/types/query'

const props = defineProps<{
  modelValue: QueryVariables
  readOnly?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: QueryVariables]
  'error': [message: string]
}>()

const variablesText = ref<string>('')
const hasError = ref<boolean>(false)
const errorMessage = ref<string>('')

// Initialize variables text from props
watch(() => props.modelValue, (newValue) => {
  try {
    variablesText.value = JSON.stringify(newValue, null, 2)
    hasError.value = false
    errorMessage.value = ''
  } catch (error) {
    console.error('Error stringifying variables:', error)
    hasError.value = true
    errorMessage.value = error instanceof Error ? error.message : String(error)
    emit('error', errorMessage.value)
  }
}, { immediate: true })

// Update variables when input changes
const updateVariables = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  variablesText.value = target.value
  
  try {
    // Try to parse the JSON
    const parsedVariables = target.value.trim() ? JSON.parse(target.value) : {}
    
    // Ensure it's an object
    if (typeof parsedVariables !== 'object' || parsedVariables === null || Array.isArray(parsedVariables)) {
      throw new Error('Variables must be a JSON object')
    }
    
    // Update the model value
    emit('update:modelValue', parsedVariables)
    hasError.value = false
    errorMessage.value = ''
  } catch (error) {
    // Set error state but don't update the model value
    hasError.value = true
    errorMessage.value = error instanceof Error ? error.message : String(error)
    emit('error', errorMessage.value)
  }
}

// Format the JSON
const formatJson = () => {
  try {
    const parsedVariables = variablesText.value.trim() ? JSON.parse(variablesText.value) : {}
    variablesText.value = JSON.stringify(parsedVariables, null, 2)
    hasError.value = false
    errorMessage.value = ''
    emit('update:modelValue', parsedVariables)
  } catch (error) {
    // Don't change the text if it's invalid JSON
    hasError.value = true
    errorMessage.value = error instanceof Error ? error.message : String(error)
    emit('error', errorMessage.value)
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex justify-between items-center mb-2">
      <h3 class="text-lg font-medium">Query Variables</h3>
      
      <div class="flex space-x-2">
        <UiButton 
          size="sm" 
          variant="outline"
          @click="formatJson" 
          :disabled="props.readOnly || hasError"
        >
          Format JSON
        </UiButton>
      </div>
    </div>
    
    <div class="flex-1 border rounded-md overflow-hidden" :class="{ 'border-red-500': hasError }">
      <textarea
        v-model="variablesText"
        @input="updateVariables"
        class="w-full h-full p-4 font-mono text-sm focus:outline-none resize-none"
        :class="{ 'bg-red-50': hasError }"
        :readonly="props.readOnly"
        placeholder="// Enter variables as JSON
{
  // Example:
  // &quot;id&quot;: &quot;123&quot;,
  // &quot;filter&quot;: {
  //   &quot;status&quot;: &quot;active&quot;
  // }
}"
        rows="10"
      ></textarea>
    </div>
    
    <div v-if="hasError" class="mt-2 text-xs text-red-500">
      {{ errorMessage }}
    </div>
    <div v-else class="mt-2 text-xs text-muted-foreground">
      Enter variables as JSON object
    </div>
  </div>
</template>
