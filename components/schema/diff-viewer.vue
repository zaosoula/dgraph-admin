<script setup lang="ts">
import { computed, ref, toRef, watch, nextTick } from 'vue'
import { useEventListener } from '@vueuse/core'
import { ChevronUp, ChevronDown } from 'lucide-vue-next'
import { useSchemaDiff } from '@/composables/useSchemaDiff'
import { useDiffNavigation } from '@/composables/useDiffNavigation'

const props = withDefaults(defineProps<{
  originalSchema: string
  newSchema: string
  leftLabel?: string
  rightLabel?: string
}>(), {
  leftLabel: 'Before',
  rightLabel: 'After'
})

const scrollContainer = ref<HTMLElement | null>(null)

const { changeCount, processedDiff, syntaxHighlightedDiff } = useSchemaDiff(
  toRef(props, 'originalSchema'),
  toRef(props, 'newSchema')
)

const {
  changeBlocks,
  totalLines,
  hasChanges,
  activeBlockIndex,
  scrollTop,
  viewportHeight,
  contentHeight,
  goToBlock,
  goToNext,
  goToPrevious,
  seekToRatio,
  syncMetrics
} = useDiffNavigation(processedDiff, scrollContainer)

// Recompute the scroll extent once new content has rendered.
watch(syntaxHighlightedDiff, () => nextTick(syncMetrics), { immediate: true })

const position = computed(() => {
  if (!hasChanges.value) return 'No changes'
  const total = changeBlocks.value.length
  // An em dash while the reader is between changes - claiming a block that is
  // off screen would be wrong, and would make the next step skip it.
  return activeBlockIndex.value === null ? `— of ${total}` : `${activeBlockIndex.value + 1} of ${total}`
})

/**
 * Alt+Arrow steps between change blocks. The viewer is only mounted while a diff
 * is on screen, so a window listener cannot collide with the editor's own keymap;
 * typing targets are still excluded.
 */
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (!event.altKey || !hasChanges.value) return

  const target = event.target as HTMLElement | null
  if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    goToNext()
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    goToPrevious()
  }
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <!-- Navigation header -->
    <div class="mb-2 flex items-center justify-between gap-3">
      <div class="flex items-baseline gap-3 font-mono text-xs tabular-nums">
        <span class="text-success">+{{ changeCount.additions }}</span>
        <span class="text-danger">-{{ changeCount.deletions }}</span>
        <span v-if="changeCount.modifications > 0" class="text-warning">~{{ changeCount.modifications }}</span>
        <span class="font-sans text-muted-foreground">
          {{ changeBlocks.length }} block{{ changeBlocks.length === 1 ? '' : 's' }}
        </span>
      </div>

      <div class="flex items-center gap-1">
        <span class="mr-1 font-mono text-xs tabular-nums text-muted-foreground">{{ position }}</span>
        <UiButton
          variant="outline"
          size="icon"
          class="h-7 w-7"
          :disabled="!hasChanges"
          title="Previous change (Alt+Up)"
          aria-label="Previous change"
          @click="goToPrevious"
        >
          <ChevronUp class="h-3.5 w-3.5" />
        </UiButton>
        <UiButton
          variant="outline"
          size="icon"
          class="h-7 w-7"
          :disabled="!hasChanges"
          title="Next change (Alt+Down)"
          aria-label="Next change"
          @click="goToNext"
        >
          <ChevronDown class="h-3.5 w-3.5" />
        </UiButton>
      </div>
    </div>

    <!-- Panes + minimap -->
    <div class="relative min-h-0 flex-1 overflow-hidden rounded-md border border-border">
      <div ref="scrollContainer" class="h-full overflow-auto pr-3">
        <div class="flex font-mono text-xs leading-5">
          <!-- Left column (removed) -->
          <div class="w-1/2 border-r border-border">
            <div class="flex">
              <div class="w-10 shrink-0 select-none border-r border-border bg-muted pr-2 text-right text-muted-foreground">
                <div v-for="(line, index) in syntaxHighlightedDiff" :key="`ln-left-${index}`" class="px-2">
                  {{ line.leftLineNumber || ' ' }}
                </div>
              </div>
              <div class="flex-1 overflow-x-auto">
                <div
                  v-for="(line, index) in syntaxHighlightedDiff"
                  :key="`left-${index}`"
                  :data-diff-row="index"
                  :class="line.leftClass"
                  class="px-2 whitespace-pre"
                >
                  <template v-if="line.leftContent !== null">
                    <span v-html="line.leftContentHighlighted"/>
                  </template>
                  <span v-else>&nbsp;</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Right column (added) -->
          <div class="w-1/2">
            <div class="flex">
              <div class="w-10 shrink-0 select-none border-r border-border bg-muted pr-2 text-right text-muted-foreground">
                <div v-for="(line, index) in syntaxHighlightedDiff" :key="`ln-right-${index}`" class="px-2">
                  {{ line.rightLineNumber || ' ' }}
                </div>
              </div>
              <div class="flex-1 overflow-x-auto">
                <div
                  v-for="(line, index) in syntaxHighlightedDiff"
                  :key="`right-${index}`"
                  :class="line.rightClass"
                  class="px-2 whitespace-pre"
                >
                  <template v-if="line.rightContent !== null">
                    <span v-html="line.rightContentHighlighted"/>
                  </template>
                  <span v-else>&nbsp;</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SchemaDiffMinimap
        class="absolute inset-y-0 right-0 w-3"
        :blocks="changeBlocks"
        :total-lines="totalLines"
        :active-index="activeBlockIndex ?? -1"
        :scroll-top="scrollTop"
        :viewport-height="viewportHeight"
        :content-height="contentHeight"
        @seek="seekToRatio"
        @select="goToBlock"
      />
    </div>
  </div>
</template>

<style>
/* Keep Prism's token backgrounds from fighting the diff row tint. */
.token {
  background: transparent !important;
}
</style>
