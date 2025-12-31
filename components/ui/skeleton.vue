<script setup lang="ts">
interface Props {
  class?: string
  width?: string
  height?: string
  rounded?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  class: '',
  rounded: true
})

const skeletonClasses = computed(() => {
  const base = 'bg-muted shimmer'
  const roundedClass = props.rounded ? 'rounded' : ''
  
  return `${base} ${roundedClass} ${props.class}`
})

const skeletonStyles = computed(() => {
  const styles: Record<string, string> = {}
  
  if (props.width) {
    styles.width = props.width
  }
  
  if (props.height) {
    styles.height = props.height
  }
  
  return styles
})
</script>

<template>
  <div 
    :class="skeletonClasses"
    :style="skeletonStyles"
  />
</template>
