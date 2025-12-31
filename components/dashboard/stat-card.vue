<script setup lang="ts">
import { computed } from 'vue'
import type { LucideIcon } from 'lucide-vue-next'

interface Props {
  title: string
  value: string | number
  description?: string
  icon?: LucideIcon
  trend?: {
    value: number
    label: string
    isPositive?: boolean
  }
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  loading: false
})

const cardClasses = computed(() => {
  const base = 'relative overflow-hidden transition-all duration-300 hover-lift'
  
  const variants = {
    default: 'bg-card border-border',
    primary: 'bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20',
    success: 'bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20',
    warning: 'bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border-yellow-500/20',
    danger: 'bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20'
  }
  
  return `${base} ${variants[props.variant]}`
})

const iconClasses = computed(() => {
  const variants = {
    default: 'text-muted-foreground',
    primary: 'text-primary',
    success: 'text-green-500',
    warning: 'text-yellow-500',
    danger: 'text-red-500'
  }
  
  return variants[props.variant]
})

const trendClasses = computed(() => {
  if (!props.trend) return ''
  
  return props.trend.isPositive 
    ? 'text-green-600 dark:text-green-400' 
    : 'text-red-600 dark:text-red-400'
})
</script>

<template>
  <UiCard :class="cardClasses">
    <!-- Loading skeleton -->
    <div v-if="loading" class="p-6">
      <div class="flex items-center justify-between mb-4">
        <div class="h-4 bg-muted rounded shimmer w-24"></div>
        <div class="h-8 w-8 bg-muted rounded shimmer"></div>
      </div>
      <div class="h-8 bg-muted rounded shimmer w-16 mb-2"></div>
      <div class="h-3 bg-muted rounded shimmer w-32"></div>
    </div>

    <!-- Content -->
    <UiCardContent v-else class="p-6">
      <div class="flex items-center justify-between mb-4">
        <UiCardTitle class="text-sm font-medium text-muted-foreground">
          {{ title }}
        </UiCardTitle>
        <component 
          v-if="icon" 
          :is="icon" 
          :class="['h-5 w-5', iconClasses]"
        />
      </div>
      
      <div class="space-y-2">
        <div class="text-3xl font-bold text-foreground">
          {{ value }}
        </div>
        
        <div class="flex items-center justify-between">
          <p v-if="description" class="text-sm text-muted-foreground">
            {{ description }}
          </p>
          
          <div v-if="trend" class="flex items-center space-x-1">
            <span :class="['text-xs font-medium', trendClasses]">
              {{ trend.isPositive ? '+' : '' }}{{ trend.value }}%
            </span>
            <span class="text-xs text-muted-foreground">
              {{ trend.label }}
            </span>
          </div>
        </div>
      </div>
    </UiCardContent>

    <!-- Decorative gradient overlay -->
    <div 
      v-if="variant !== 'default'" 
      class="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 transform translate-x-full group-hover:translate-x-[-200%] transition-transform duration-1000"
    />
  </UiCard>
</template>
