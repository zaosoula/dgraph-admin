<script setup lang="ts">
import { computed } from 'vue'
import type { LucideIcon } from 'lucide-vue-next'

interface Props {
  title: string
  value: string | number
  description?: string
  icon?: LucideIcon
  /**
   * The variant is a status reading, not a colour scheme: it shows as a small
   * dot beside the label and tints the caption. The number itself always stays
   * in ink so a row of figures reads as one column.
   */
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  loading: false
})

const dotClass = computed(
  () =>
    ({
      default: '',
      primary: 'bg-foreground',
      success: 'bg-success',
      warning: 'bg-warning',
      danger: 'bg-danger'
    })[props.variant]
)

const captionClass = computed(
  () =>
    ({
      default: 'text-muted-foreground',
      primary: 'text-muted-foreground',
      success: 'text-muted-foreground',
      warning: 'text-warning',
      danger: 'text-danger'
    })[props.variant]
)
</script>

<template>
  <div class="flex min-w-0 flex-col gap-1.5 px-4 py-3.5">
    <template v-if="loading">
      <div class="h-3.5 w-24 animate-pulse rounded bg-muted" />
      <div class="h-6 w-16 animate-pulse rounded bg-muted" />
      <div class="h-3 w-28 animate-pulse rounded bg-muted" />
    </template>

    <template v-else>
      <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
        <component :is="icon" v-if="icon" class="h-3.5 w-3.5 shrink-0" />
        <span class="truncate">{{ title }}</span>
      </div>

      <div class="flex items-baseline gap-2">
        <!-- The dot always occupies space so a row of figures shares one left edge -->
        <span
          class="h-1.5 w-1.5 shrink-0 self-center rounded-full"
          :class="variant === 'default' ? 'bg-transparent' : dotClass"
        />
        <span
          class="truncate font-mono text-xl font-medium tabular-nums tracking-tight text-foreground"
          :title="String(value)"
        >
          {{ value }}
        </span>
      </div>

      <p v-if="description" class="truncate text-xs" :class="captionClass">
        {{ description }}
      </p>
    </template>
  </div>
</template>
