<script setup lang="ts">
import { SelectContent, SelectItem, SelectItemIndicator, SelectItemText, SelectPortal, SelectRoot, SelectSeparator, SelectTrigger, SelectValue, SelectViewport, useForwardPropsEmits, type SelectRootEmits, type SelectRootProps } from 'radix-vue'
import { ChevronDown, Check } from 'lucide-vue-next'
import { cn } from '@/utils/cn'

const props = defineProps<SelectRootProps>()
const emits = defineEmits<SelectRootEmits>()

const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <SelectRoot v-bind="forwarded">
    <slot />
  </SelectRoot>
</template>
