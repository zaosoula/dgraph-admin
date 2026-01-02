<script setup lang="ts">
import { ref, watch } from 'vue'
import { Play, Trash2, HelpCircle } from 'lucide-vue-next'
import { useCodeMirror } from '@/composables/useCodeMirror'

type Props = {
  modelValue: string
  isExecuting?: boolean
  disabled?: boolean
  placeholder?: string
}

type Emits = {
  'update:modelValue': [value: string]
  'execute': [query: string]
  'clear': []
  'help': []
}

const props = withDefaults(defineProps<Props>(), {
  isExecuting: false,
  disabled: false,
  placeholder: 'Enter your DQL query here...'
})

const emit = defineEmits<Emits>()

const editorContainer = ref<HTMLElement>()
const localValue = ref(props.modelValue)

// Watch for external changes to modelValue
watch(() => props.modelValue, (newValue) => {
  if (newValue !== localValue.value) {
    localValue.value = newValue
  }
})

// Watch for local changes and emit
watch(localValue, (newValue) => {
  emit('update:modelValue', newValue)
})

// Initialize CodeMirror
const { initializeEditor } = useCodeMirror()

onMounted(() => {
  if (editorContainer.value) {
    initializeEditor(editorContainer.value, {
      value: localValue.value,
      language: 'javascript', // Use JavaScript mode for DQL syntax highlighting
      onChange: (value: string) => {
        localValue.value = value
      },
      placeholder: props.placeholder
    })
  }
})

const handleExecute = () => {
  if (!props.disabled && !props.isExecuting && localValue.value.trim()) {
    emit('execute', localValue.value)
  }
}

const handleClear = () => {
  if (!props.disabled && !props.isExecuting) {
    localValue.value = ''
    emit('clear')
  }
}

const handleHelp = () => {
  emit('help')
}

// Keyboard shortcuts
const handleKeydown = (event: KeyboardEvent) => {
  if (event.ctrlKey || event.metaKey) {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleExecute()
    }
  }
}
</script>

<template>
  <UiCard class="hover-lift">
    <UiCardHeader>
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <UiCardTitle>Query Editor</UiCardTitle>
          <UiButton
            variant="ghost"
            size="sm"
            @click="handleHelp"
            class="h-6 w-6 p-0"
          >
            <HelpCircle class="h-4 w-4" />
          </UiButton>
        </div>
        
        <div class="flex items-center space-x-2">
          <UiButton
            variant="outline"
            size="sm"
            @click="handleClear"
            :disabled="disabled || isExecuting || !modelValue.trim()"
            class="hover-lift"
          >
            <Trash2 class="h-4 w-4 mr-1" />
            Clear
          </UiButton>
          
          <UiButton
            @click="handleExecute"
            :disabled="disabled || isExecuting || !modelValue.trim()"
            :loading="isExecuting"
            class="hover-lift"
          >
            <Play class="h-4 w-4 mr-1" />
            {{ isExecuting ? 'Executing...' : 'Execute' }}
          </UiButton>
        </div>
      </div>
      
      <UiCardDescription>
        Write your DQL query below. Press <kbd class="px-1 py-0.5 text-xs bg-muted rounded">Ctrl+Enter</kbd> to execute.
      </UiCardDescription>
    </UiCardHeader>
    
    <UiCardContent>
      <div 
        ref="editorContainer"
        class="min-h-[200px] border rounded-md bg-background"
        @keydown="handleKeydown"
      />
    </UiCardContent>
  </UiCard>
</template>

<style scoped>
kbd {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
}
</style>
