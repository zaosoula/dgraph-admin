<script setup lang="ts">
import { computed } from 'vue'
import type { StatusTone } from '@/components/status'

const props = withDefaults(
  defineProps<{
    tone?: StatusTone
    /** Adds a soft pulse for work that is still in flight. */
    busy?: boolean
    label?: string
    size?: 'sm' | 'md'
  }>(),
  { tone: 'neutral', busy: false, size: 'sm' }
)

const toneClass = computed(
  () =>
    ({
      success: 'bg-success',
      warning: 'bg-warning',
      danger: 'bg-danger',
      info: 'bg-info',
      neutral: 'bg-border-strong'
    })[props.tone]
)

const sizeClass = computed(() => (props.size === 'md' ? 'h-2.5 w-2.5' : 'h-1.5 w-1.5'))
</script>

<template>
  <span
    class="inline-block shrink-0 rounded-full"
    :class="[toneClass, sizeClass, busy ? 'animate-pulse' : '']"
    :title="label"
    :aria-label="label"
    :role="label ? 'img' : undefined"
  />
</template>
