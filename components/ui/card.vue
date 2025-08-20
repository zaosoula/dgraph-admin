<script setup lang="ts">
import { cn } from '@/utils/cn'

defineProps<{
  class?: string
}>()
</script>

<template>
  <div
    :class="cn(
      'rounded-xl border bg-card text-card-foreground shadow',
      class,
    )"
  >
    <slot />
  </div>
</template>

