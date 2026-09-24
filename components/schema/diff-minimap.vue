<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ChangeBlock } from '@/composables/useDiffNavigation'

const props = defineProps<{
  blocks: ChangeBlock[]
  totalLines: number
  activeIndex: number
  scrollTop: number
  viewportHeight: number
  contentHeight: number
}>()

const emit = defineEmits<{
  seek: [ratio: number]
  select: [blockIndex: number]
}>()

const track = ref<HTMLElement | null>(null)
const isDragging = ref(false)

/** A single changed line in a long schema still needs to be visible and clickable. */
const MIN_TICK_PERCENT = 0.8

const percent = (value: number) => `${value}%`

const tickStyle = (block: ChangeBlock) => {
  if (props.totalLines === 0) return { top: '0%', height: '0%' }

  const top = (block.startIndex / props.totalLines) * 100
  const height = Math.max((block.lineCount / props.totalLines) * 100, MIN_TICK_PERCENT)

  return { top: percent(Math.min(top, 100 - height)), height: percent(height) }
}

const tickClass = (block: ChangeBlock, index: number) => [
  block.kind === 'added' ? 'bg-success' : block.kind === 'removed' ? 'bg-danger' : 'bg-warning',
  index === props.activeIndex ? 'opacity-100' : 'opacity-55'
]

/** Hidden when the content fits — there is nothing to orient against. */
const showViewport = computed(
  () => props.contentHeight > 0 && props.viewportHeight > 0 && props.contentHeight > props.viewportHeight
)

const viewportStyle = computed(() => {
  if (!showViewport.value) return { top: '0%', height: '0%' }

  return {
    top: percent((props.scrollTop / props.contentHeight) * 100),
    height: percent(Math.max((props.viewportHeight / props.contentHeight) * 100, 2))
  }
})

const ratioFromEvent = (event: PointerEvent): number => {
  const el = track.value
  if (!el) return 0

  const rect = el.getBoundingClientRect()
  if (rect.height === 0) return 0

  return (event.clientY - rect.top) / rect.height
}

const onPointerDown = (event: PointerEvent) => {
  isDragging.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  emit('seek', ratioFromEvent(event))
}

const onPointerMove = (event: PointerEvent) => {
  if (!isDragging.value) return
  emit('seek', ratioFromEvent(event))
}

const onPointerUp = (event: PointerEvent) => {
  isDragging.value = false
  ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
}

const onTickClick = (event: MouseEvent, index: number) => {
  // Stop the track handler from also seeking to the raw click position.
  event.stopPropagation()
  emit('select', index)
}
</script>

<template>
  <div
    ref="track"
    class="relative h-full cursor-pointer touch-none border-l border-border bg-muted/40 select-none"
    :aria-label="`Change map, ${blocks.length} change${blocks.length === 1 ? '' : 's'}`"
    role="scrollbar"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <!-- One tick per change block -->
    <button
      v-for="(block, index) in blocks"
      :key="`${block.startIndex}-${block.endIndex}`"
      type="button"
      class="absolute inset-x-0.5 rounded-[1px] transition-opacity hover:opacity-100"
      :class="tickClass(block, index)"
      :style="tickStyle(block)"
      :title="`${block.kind} · ${block.lineCount} line${block.lineCount === 1 ? '' : 's'}`"
      :aria-label="`Go to ${block.kind} change at line ${block.startIndex + 1}`"
      @pointerdown.stop
      @click="onTickClick($event, index)"
    />

    <!-- Current viewport -->
    <div
      v-if="showViewport"
      class="pointer-events-none absolute inset-x-0 rounded-[1px] border border-border-strong bg-foreground/5"
      :style="viewportStyle"
    />
  </div>
</template>
