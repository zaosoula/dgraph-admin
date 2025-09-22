<script setup lang="ts">
import { SelectValue, type SelectValueProps } from 'radix-vue'
import { cn } from '@/utils/cn'

interface Props extends SelectValueProps {
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  class: ''
})
</script>

<template>
  <SelectValue
    :class="cn('text-sm', props.class)"
    v-bind="$attrs"
  >
    <slot />
  </SelectValue>
</template>
