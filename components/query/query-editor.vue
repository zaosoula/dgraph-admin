<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'

const props = defineProps<{
  modelValue: string
  readOnly?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'execute': []
}>()

const editorElement = ref<HTMLTextAreaElement | null>(null)

// Update query when input changes
const updateQuery = (event: Event) => {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
}

// Handle keyboard shortcuts
const handleKeyDown = (event: KeyboardEvent) => {
  // Execute query on Ctrl+Enter or Cmd+Enter
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    emit('execute')
  }
}

// Focus the editor when mounted
onMounted(() => {
  if (editorElement.value) {
    editorElement.value.focus()
  }
})
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex justify-between items-center mb-2">
      <h3 class="text-lg font-medium">GraphQL Query</h3>
      
      <div class="flex space-x-2">
        <UiButton 
          size="sm" 
          @click="emit('execute')" 
          :disabled="props.readOnly"
        >
          Execute Query
        </UiButton>
      </div>
    </div>
    
    <div class="flex-1 border rounded-md overflow-hidden">
      <textarea
        ref="editorElement"
        :value="modelValue"
        @input="updateQuery"
        @keydown="handleKeyDown"
        class="w-full h-full p-4 font-mono text-sm focus:outline-none resize-none"
        :readonly="props.readOnly"
        placeholder="# Write your GraphQL query here
# Press Ctrl+Enter to execute

query {
  # Your query fields
}"
        rows="20"
      ></textarea>
    </div>
    
    <div class="mt-2 text-xs text-muted-foreground">
      Press <kbd class="px-1 py-0.5 bg-muted rounded">Ctrl</kbd>+<kbd class="px-1 py-0.5 bg-muted rounded">Enter</kbd> to execute query
    </div>
  </div>
</template>
