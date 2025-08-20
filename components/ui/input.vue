<script setup lang="ts">
import { cn } from '@/utils/cn'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    type?: string
    class?: string
  }>(),
  {
    type: 'text',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const value = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})
</script>

<template>
  <input
    :type="type"
    :value="modelValue"
    @input="$event => value = ($event.target as HTMLInputElement).value"
    :class="cn(
      'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      props.class,
    )"
  />
</template>

