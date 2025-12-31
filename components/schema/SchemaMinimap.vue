<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useMinimap, type MinimapChange, type MinimapOptions } from '@/composables/useMinimap'
import type { EditorView } from '@codemirror/view'

const props = defineProps<{
  editorView: EditorView | null
  changes?: MinimapChange[]
  width?: number
  height?: number
  showViewport?: boolean
  clickToNavigate?: boolean
  isDiffMode?: boolean
}>()

const emit = defineEmits<{
  'line-click': [lineNumber: number]
  'toggle-visibility': [visible: boolean]
}>()

// Create reactive refs for the composable
const editorViewRef = ref(props.editorView)
const changesRef = ref(props.changes || [])

// Watch for prop changes
watch(() => props.editorView, (newView) => {
  editorViewRef.value = newView
})

watch(() => props.changes, (newChanges) => {
  changesRef.value = newChanges || []
}, { deep: true })

// Minimap options
const minimapOptions: MinimapOptions = {
  width: props.width || 120,
  height: props.height || 400,
  lineHeight: 2,
  showViewport: props.showViewport ?? true,
  clickToNavigate: props.clickToNavigate ?? true
}

// Use the minimap composable
const {
  minimapContainer,
  minimapCanvas,
  isVisible,
  isDragging,
  totalLines,
  viewportTop,
  viewportHeight,
  updateEditorMetrics,
  renderMinimap,
  scrollToLine,
  toggleVisibility,
  cleanup
} = useMinimap(editorViewRef, changesRef, minimapOptions)

// Handle line click
const handleLineClick = (lineNumber: number) => {
  scrollToLine(lineNumber)
  emit('line-click', lineNumber)
}

// Handle visibility toggle
const handleToggleVisibility = () => {
  toggleVisibility()
  emit('toggle-visibility', isVisible.value)
}

// Computed styles for the container
const containerClasses = computed(() => [
  'minimap-container',
  'flex flex-col',
  'border border-gray-200 rounded-md',
  'bg-white shadow-sm',
  'transition-all duration-200',
  {
    'opacity-0 pointer-events-none': !isVisible.value,
    'opacity-100': isVisible.value
  }
])

const canvasClasses = computed(() => [
  'minimap-canvas',
  'cursor-pointer',
  'transition-opacity duration-150',
  {
    'cursor-grabbing': isDragging.value,
    'cursor-grab': !isDragging.value && minimapOptions.clickToNavigate,
    'hover:opacity-90': !isDragging.value
  }
])

// Stats for display
const changeStats = computed(() => {
  const stats = {
    added: 0,
    removed: 0,
    modified: 0
  }
  
  changesRef.value.forEach(change => {
    stats[change.type]++
  })
  
  return stats
})

// Initialize on mount
onMounted(() => {
  nextTick(() => {
    updateEditorMetrics()
    renderMinimap()
  })
})

// Watch for editor view changes to update loading state
watch(() => props.editorView, (newView) => {
  if (newView) {
    nextTick(() => {
      updateEditorMetrics()
      renderMinimap()
    })
  }
}, { immediate: true })

// Cleanup on unmount
onUnmounted(() => {
  cleanup()
})
</script>

<template>
  <div 
    ref="minimapContainer"
    :class="containerClasses"
    :style="{ width: `${minimapOptions.width + 16}px` }"
  >
    <!-- Header -->
    <div class="flex items-center justify-between p-2 border-b border-gray-100">
      <div class="flex items-center space-x-2">
        <div class="w-2 h-2 bg-blue-500 rounded-full"></div>
        <span class="text-xs font-medium text-gray-600">Minimap</span>
      </div>
      
      <button
        @click="handleToggleVisibility"
        class="p-1 text-gray-400 hover:text-gray-600 transition-colors"
        :title="isVisible ? 'Hide minimap' : 'Show minimap'"
      >
        <svg 
          v-if="isVisible" 
          class="w-3 h-3" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
        <svg 
          v-else 
          class="w-3 h-3" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      </button>
    </div>

    <!-- Canvas -->
    <div class="relative p-2">
      <canvas
        ref="minimapCanvas"
        :class="canvasClasses"
        :width="minimapOptions.width"
        :height="minimapOptions.height"
        class="border border-gray-100 rounded"
      />
      
      <!-- Loading overlay -->
      <div 
        v-if="totalLines === 0 && !props.editorView"
        class="absolute inset-2 flex items-center justify-center bg-gray-50 rounded"
      >
        <div class="text-xs text-gray-400">Loading...</div>
      </div>
      
      <!-- Empty state -->
      <div 
        v-else-if="totalLines === 0 && props.editorView"
        class="absolute inset-2 flex items-center justify-center bg-gray-50 rounded"
      >
        <div class="text-xs text-gray-400">No content</div>
      </div>
    </div>

    <!-- Stats -->
    <div 
      v-if="changesRef.length > 0" 
      class="px-2 pb-2"
    >
      <div class="flex items-center justify-between text-xs">
        <div class="flex items-center space-x-3">
          <div 
            v-if="changeStats.added > 0"
            class="flex items-center space-x-1"
          >
            <div class="w-2 h-2 bg-green-500 rounded-full"></div>
            <span class="text-green-600">+{{ changeStats.added }}</span>
          </div>
          
          <div 
            v-if="changeStats.removed > 0"
            class="flex items-center space-x-1"
          >
            <div class="w-2 h-2 bg-red-500 rounded-full"></div>
            <span class="text-red-600">-{{ changeStats.removed }}</span>
          </div>
          
          <div 
            v-if="changeStats.modified > 0"
            class="flex items-center space-x-1"
          >
            <div class="w-2 h-2 bg-yellow-500 rounded-full"></div>
            <span class="text-yellow-600">~{{ changeStats.modified }}</span>
          </div>
        </div>
        
        <span class="text-gray-500">{{ totalLines }} lines</span>
      </div>
    </div>
    
    <!-- No changes state -->
    <div 
      v-else-if="totalLines > 0"
      class="px-2 pb-2"
    >
      <div class="flex items-center justify-between text-xs">
        <span class="text-gray-500">No changes</span>
        <span class="text-gray-500">{{ totalLines }} lines</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.minimap-container {
  min-width: 136px; /* width + padding */
  max-width: 200px;
}

.minimap-canvas {
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
}

/* Hide on mobile */
@media (max-width: 1023px) {
  .minimap-container {
    display: none;
  }
}

/* Smooth transitions */
.minimap-container {
  transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out;
}

.minimap-container:not(.opacity-100) {
  transform: translateX(10px);
}
</style>
