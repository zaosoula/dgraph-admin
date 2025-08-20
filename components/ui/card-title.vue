<script setup lang="ts">
import { cn } from '@/utils/cn'

defineProps<{
  class?: string
}>()
</script>

<template>
  <h3 :class="cn('font-semibold leading-none tracking-tight', class)">
    <slot />
  </h3>
</template>

