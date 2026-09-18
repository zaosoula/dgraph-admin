import { computed, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import { useEventListener, useResizeObserver } from '@vueuse/core'
import type { SchemaDiffLine } from '@/composables/useSchemaDiff'

export type ChangeKind = 'added' | 'removed' | 'modified'

export type ChangeBlock = {
  /** Index of the first diff row in the block. */
  startIndex: number
  /** Index of the last diff row in the block, inclusive. */
  endIndex: number
  /** Number of diff rows the block spans. */
  lineCount: number
  kind: ChangeKind
}

/** A row is part of a change when either side is missing, or word-level highlights were attached. */
const isChangedRow = (line: SchemaDiffLine): boolean =>
  line.leftContent === null
  || line.rightContent === null
  || (line.leftHighlights?.length ?? 0) > 0
  || (line.rightHighlights?.length ?? 0) > 0

/**
 * Collapse runs of consecutive changed rows into blocks.
 *
 * A six-line type that was removed is one stop for the reader, not six, so
 * navigation steps over blocks rather than rows. A run holding both removed and
 * added rows is a replacement, and reads as `modified`.
 */
export const buildChangeBlocks = (lines: SchemaDiffLine[]): ChangeBlock[] => {
  const blocks: ChangeBlock[] = []
  let runStart: number | null = null
  let added = 0
  let removed = 0

  const closeRun = (endIndex: number) => {
    if (runStart === null) return

    const kind: ChangeKind = added > 0 && removed > 0
      ? 'modified'
      : added > 0 ? 'added' : 'removed'

    blocks.push({
      startIndex: runStart,
      endIndex,
      lineCount: endIndex - runStart + 1,
      kind
    })

    runStart = null
    added = 0
    removed = 0
  }

  lines.forEach((line, index) => {
    if (!isChangedRow(line)) {
      closeRun(index - 1)
      return
    }

    if (runStart === null) runStart = index
    if (line.rightContent !== null) added++
    if (line.leftContent !== null) removed++
  })

  closeRun(lines.length - 1)

  return blocks
}

/** Put the target a third of the way down the viewport rather than flush against the top. */
const ANCHOR_FRACTION = 1 / 3

/**
 * Window after a programmatic jump during which scroll events are treated as
 * the jump landing rather than as the reader scrolling.
 */
const SETTLE_MS = 150

/**
 * Change-block navigation over a scrolling diff.
 *
 * Positions are derived from `scrollHeight / totalLines` rather than an assumed
 * row height, so the maths holds whatever line-height the theme applies.
 *
 * The current block is explicit state, not a function of scroll position. Two
 * blocks a few lines apart are on screen together, so a position-derived
 * "nearest block" flips between them and `next` stops advancing; scrolling only
 * re-derives the current block when the reader is the one scrolling.
 */
export function useDiffNavigation(
  diffLines: MaybeRefOrGetter<SchemaDiffLine[]>,
  scrollContainer: Ref<HTMLElement | null>
) {
  const scrollTop = ref(0)
  const viewportHeight = ref(0)
  const contentHeight = ref(0)
  const currentIndex = ref<number | null>(null)

  let settleUntil = 0

  const changeBlocks = computed(() => buildChangeBlocks(toValue(diffLines)))
  const totalLines = computed(() => toValue(diffLines).length)
  const hasChanges = computed(() => changeBlocks.value.length > 0)

  const syncMetrics = () => {
    const el = scrollContainer.value
    if (!el) return

    scrollTop.value = el.scrollTop
    viewportHeight.value = el.clientHeight
    contentHeight.value = el.scrollHeight
  }

  /**
   * Offset of a diff row inside the scroller, measured from the DOM.
   *
   * Extrapolating `scrollHeight / totalLines` looks equivalent but is not: while
   * thousands of syntax-highlighted rows are still laying out, `scrollHeight` is
   * short, so early jumps land above their target and creep closer on each
   * press. Measuring the row itself is correct whatever the layout state.
   */
  const rowBounds = (rowIndex: number): { top: number; bottom: number } | null => {
    const el = scrollContainer.value
    if (!el) return null

    const row = el.querySelector<HTMLElement>(`[data-diff-row="${rowIndex}"]`)
    if (!row) return null

    const top = row.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
    return { top, bottom: top + row.offsetHeight }
  }

  const offsetOfRow = (rowIndex: number): number | null => rowBounds(rowIndex)?.top ?? null

  /** Vertical extent of a whole block within the scroller. */
  const blockBounds = (block: ChangeBlock): { top: number; bottom: number } | null => {
    const start = rowBounds(block.startIndex)
    if (!start) return null
    return { top: start.top, bottom: (rowBounds(block.endIndex) ?? start).bottom }
  }

  /**
   * The block currently on screen, or `null` when the reader has scrolled away
   * from every change. Reporting the merely-closest block while it sits off
   * screen is a lie, and it makes `next` skip the block you cannot see.
   */
  const visibleBlockIndex = (): number | null => {
    const el = scrollContainer.value
    if (!el || !hasChanges.value) return null

    const viewTop = el.scrollTop
    const viewBottom = viewTop + el.clientHeight

    for (const [index, block] of changeBlocks.value.entries()) {
      const bounds = blockBounds(block)
      if (!bounds) continue
      if (bounds.bottom > viewTop && bounds.top < viewBottom) return index
    }

    return null
  }

  const onScroll = () => {
    syncMetrics()
    // Ignore the scroll events produced by our own jump.
    if (performance.now() < settleUntil) return
    currentIndex.value = visibleBlockIndex()
  }

  useEventListener(scrollContainer, 'scroll', onScroll, { passive: true })
  useResizeObserver(scrollContainer, syncMetrics)

  // A fresh diff starts with nothing selected.
  watch(changeBlocks, () => {
    currentIndex.value = null
  })

  /** `null` when no change is on screen, so the header can read "— of N". */
  const activeBlockIndex = computed<number | null>(() => {
    if (!hasChanges.value || currentIndex.value === null) return null
    return Math.min(currentIndex.value, changeBlocks.value.length - 1)
  })

  const scrollToLine = (lineIndex: number) => {
    const el = scrollContainer.value
    if (!el || totalLines.value === 0) return

    const measured = offsetOfRow(lineIndex)
    const target = (measured ?? (lineIndex / totalLines.value) * el.scrollHeight)
      - el.clientHeight * ANCHOR_FRACTION
    settleUntil = performance.now() + SETTLE_MS
    // Instant, not smooth: a queued smooth scroll swallows the next jump, and
    // animating across thousands of pixels tells the reader nothing on the way.
    el.scrollTop = Math.max(0, Math.min(target, el.scrollHeight - el.clientHeight))
    syncMetrics()
  }

  const goToBlock = (index: number) => {
    const block = changeBlocks.value[index]
    if (!block) return
    currentIndex.value = index
    scrollToLine(block.startIndex)
  }

  /**
   * Both directions wrap, so a reader can keep pressing one button to sweep the
   * file. With nothing selected, stepping enters the list at the nearest change
   * in that direction instead of stepping past it.
   */
  const goToNext = () => {
    if (!hasChanges.value) return

    const blocks = changeBlocks.value
    if (currentIndex.value === null) {
      const viewTop = scrollContainer.value?.scrollTop ?? 0
      const next = blocks.findIndex(block => (blockBounds(block)?.top ?? 0) >= viewTop)
      goToBlock(next === -1 ? 0 : next)
      return
    }

    goToBlock((currentIndex.value + 1) % blocks.length)
  }

  const goToPrevious = () => {
    if (!hasChanges.value) return

    const blocks = changeBlocks.value
    if (currentIndex.value === null) {
      const viewTop = scrollContainer.value?.scrollTop ?? 0
      let previous = -1
      blocks.forEach((block, index) => {
        if ((blockBounds(block)?.bottom ?? 0) <= viewTop) previous = index
      })
      goToBlock(previous === -1 ? blocks.length - 1 : previous)
      return
    }

    goToBlock((currentIndex.value - 1 + blocks.length) % blocks.length)
  }

  /** Jump to a fraction of the document - used by the minimap's click and drag. */
  const seekToRatio = (ratio: number) => {
    const el = scrollContainer.value
    if (!el) return

    const clamped = Math.max(0, Math.min(1, ratio))
    el.scrollTop = Math.max(
      0,
      Math.min(clamped * el.scrollHeight - el.clientHeight / 2, el.scrollHeight - el.clientHeight)
    )
    syncMetrics()
    currentIndex.value = visibleBlockIndex()
  }

  return {
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
  }
}
