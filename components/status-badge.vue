<script setup lang="ts">
import { computed } from 'vue'
import type { StatusTone } from '@/components/status'

const props = withDefaults(
  defineProps<{
    tone?: StatusTone
    /** `subtle` fills the badge; `outline` keeps the ground and only draws a rule. */
    variant?: 'subtle' | 'outline'
    mono?: boolean
  }>(),
  { tone: 'neutral', variant: 'subtle', mono: false }
)

const toneClass = computed(() => {
  if (props.variant === 'outline') {
    return {
      success: 'border-success-border text-success',
      warning: 'border-warning-border text-warning',
      danger: 'border-danger-border text-danger',
      info: 'border-info-border text-info',
      neutral: 'border-border text-muted-foreground'
    }[props.tone]
  }

  return {
    success: 'border-success-border bg-success-subtle text-success',
    warning: 'border-warning-border bg-warning-subtle text-warning',
    danger: 'border-danger-border bg-danger-subtle text-danger',
    info: 'border-info-border bg-info-subtle text-info',
    neutral: 'border-border bg-muted text-muted-foreground'
  }[props.tone]
})
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium leading-4"
    :class="[toneClass, mono ? 'font-mono' : '']"
  >
    <slot />
  </span>
</template>
