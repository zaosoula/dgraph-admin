import { ref, computed, watch, nextTick, type Ref } from 'vue'
import { useElementSize, useScroll, useEventListener } from '@vueuse/core'
import type { EditorView } from '@codemirror/view'

export type MinimapChangeType = 'added' | 'removed' | 'modified'

export type MinimapChange = {
  lineNumber: number
  type: MinimapChangeType
  content?: string
}

export type MinimapOptions = {
  width?: number
  height?: number
  lineHeight?: number
  showViewport?: boolean
  clickToNavigate?: boolean
}

export function useMinimap(
  editorView: Ref<EditorView | null>,
  changes: Ref<MinimapChange[]> = ref([]),
  options: MinimapOptions = {}
) {
  const {
    width = 120,
    height = 400,
    lineHeight = 2,
    showViewport = true,
    clickToNavigate = true
  } = options

  // Minimap container element
  const minimapContainer = ref<HTMLElement | null>(null)
  const minimapCanvas = ref<HTMLCanvasElement | null>(null)

  // Minimap state
  const isVisible = ref(true)
  const isDragging = ref(false)
  const totalLines = ref(0)
  const visibleLines = ref(0)
  const scrollTop = ref(0)
  const scrollHeight = ref(0)
  const clientHeight = ref(0)

  // Canvas context
  const canvasContext = computed(() => {
    return minimapCanvas.value?.getContext('2d') || null
  })

  // Calculate minimap dimensions and scaling
  const scale = computed(() => {
    if (totalLines.value === 0) return 1
    return Math.min(height / (totalLines.value * lineHeight), 1)
  })

  const scaledLineHeight = computed(() => lineHeight * scale.value)

  // Viewport position and size in minimap coordinates
  const viewportTop = computed(() => {
    if (scrollHeight.value === 0) return 0
    return (scrollTop.value / scrollHeight.value) * height
  })

  const viewportHeight = computed(() => {
    if (scrollHeight.value === 0) return height
    return Math.min((clientHeight.value / scrollHeight.value) * height, height)
  })

  // Update editor metrics
  const updateEditorMetrics = () => {
    if (!editorView.value) return

    const view = editorView.value
    const doc = view.state.doc
    const dom = view.dom

    totalLines.value = doc.lines
    scrollTop.value = view.scrollDOM.scrollTop
    scrollHeight.value = view.scrollDOM.scrollHeight
    clientHeight.value = view.scrollDOM.clientHeight

    // Calculate visible lines
    const lineHeight = view.defaultLineHeight
    visibleLines.value = Math.ceil(clientHeight.value / lineHeight)
  }

  // Render the minimap
  const renderMinimap = () => {
    if (!canvasContext.value || !minimapCanvas.value) return

    const ctx = canvasContext.value
    const canvas = minimapCanvas.value

    // Set canvas size
    canvas.width = width
    canvas.height = height

    // Clear canvas
    ctx.clearRect(0, 0, width, height)

    // Draw background
    ctx.fillStyle = '#f8f9fa'
    ctx.fillRect(0, 0, width, height)

    // Draw document lines
    ctx.fillStyle = '#e9ecef'
    for (let i = 0; i < totalLines.value; i++) {
      const y = i * scaledLineHeight.value
      if (y > height) break
      
      ctx.fillRect(2, y, width - 4, Math.max(1, scaledLineHeight.value - 0.5))
    }

    // Draw changes
    changes.value.forEach(change => {
      const y = (change.lineNumber - 1) * scaledLineHeight.value
      if (y > height) return

      let color = '#6c757d'
      switch (change.type) {
        case 'added':
          color = '#28a745' // GitHub green
          break
        case 'removed':
          color = '#dc3545' // GitHub red
          break
        case 'modified':
          color = '#ffc107' // GitHub yellow
          break
      }

      ctx.fillStyle = color
      ctx.fillRect(0, y, width, Math.max(2, scaledLineHeight.value))
    })

    // Draw viewport indicator
    if (showViewport) {
      ctx.strokeStyle = '#007bff'
      ctx.lineWidth = 1
      ctx.strokeRect(0, viewportTop.value, width, viewportHeight.value)
      
      ctx.fillStyle = 'rgba(0, 123, 255, 0.1)'
      ctx.fillRect(0, viewportTop.value, width, viewportHeight.value)
    }
  }

  // Handle click navigation
  const handleMinimapClick = (event: MouseEvent) => {
    if (!clickToNavigate || !editorView.value || !minimapCanvas.value) return

    const rect = minimapCanvas.value.getBoundingClientRect()
    const y = event.clientY - rect.top
    const clickRatio = y / height
    
    // Calculate target scroll position
    const targetScrollTop = clickRatio * scrollHeight.value
    
    // Scroll the editor
    editorView.value.scrollDOM.scrollTop = Math.max(0, Math.min(targetScrollTop, scrollHeight.value - clientHeight.value))
  }

  // Handle drag navigation
  const handleMinimapMouseDown = (event: MouseEvent) => {
    if (!clickToNavigate) return
    
    isDragging.value = true
    handleMinimapClick(event)
  }

  const handleMinimapMouseMove = (event: MouseEvent) => {
    if (!isDragging.value) return
    handleMinimapClick(event)
  }

  const handleMinimapMouseUp = () => {
    isDragging.value = false
  }

  // Scroll to specific line
  const scrollToLine = (lineNumber: number) => {
    if (!editorView.value) return

    const view = editorView.value
    const line = view.state.doc.line(Math.min(lineNumber, totalLines.value))
    
    view.dispatch({
      effects: EditorView.scrollIntoView(line.from, { y: 'start' })
    })
  }

  // Toggle minimap visibility
  const toggleVisibility = () => {
    isVisible.value = !isVisible.value
  }

  // Watch for editor changes
  watch(editorView, (newView, oldView) => {
    // Clean up previous listeners
    cleanup()
    
    if (newView) {
      updateEditorMetrics()
      nextTick(() => renderMinimap())
      
      // Add scroll listener
      const scrollListener = () => {
        updateEditorMetrics()
        nextTick(() => renderMinimap())
      }
      newView.scrollDOM.addEventListener('scroll', scrollListener)
      cleanupFunctions.push(() => newView.scrollDOM.removeEventListener('scroll', scrollListener))
      
      // Add document change listener for content updates
      const updateListener = () => {
        setTimeout(() => {
          updateEditorMetrics()
          nextTick(() => renderMinimap())
        }, 100) // Small delay to ensure DOM is updated
      }
      
      // Listen for document changes
      newView.dom.addEventListener('input', updateListener)
      newView.dom.addEventListener('keyup', updateListener)
      cleanupFunctions.push(() => {
        newView.dom.removeEventListener('input', updateListener)
        newView.dom.removeEventListener('keyup', updateListener)
      })
    }
  }, { immediate: true })

  // Watch for changes
  watch(changes, () => {
    nextTick(() => renderMinimap())
  }, { deep: true })

  // Watch for scroll changes
  watch([scrollTop, totalLines, visibleLines], () => {
    nextTick(() => renderMinimap())
  })

  // Force update when total lines change from 0
  watch(totalLines, (newLines, oldLines) => {
    if (oldLines === 0 && newLines > 0) {
      nextTick(() => renderMinimap())
    }
  })

  // Set up event listeners when canvas is available
  watch(minimapCanvas, (canvas) => {
    if (canvas) {
      useEventListener(canvas, 'click', handleMinimapClick)
      useEventListener(canvas, 'mousedown', handleMinimapMouseDown)
      useEventListener(window, 'mousemove', handleMinimapMouseMove)
      useEventListener(window, 'mouseup', handleMinimapMouseUp)
    }
  })

  // Cleanup function for event listeners
  let cleanupFunctions: (() => void)[] = []

  const cleanup = () => {
    cleanupFunctions.forEach(fn => fn())
    cleanupFunctions = []
  }

  return {
    // Refs
    minimapContainer,
    minimapCanvas,
    
    // State
    isVisible,
    isDragging,
    totalLines,
    visibleLines,
    scrollTop,
    viewportTop,
    viewportHeight,
    
    // Computed
    scale,
    scaledLineHeight,
    
    // Methods
    updateEditorMetrics,
    renderMinimap,
    scrollToLine,
    toggleVisibility,
    cleanup,
    
    // Options
    width,
    height,
    lineHeight
  }
}
