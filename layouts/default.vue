<script setup lang="ts">
import { ref } from 'vue'
import { useConnectionsStore } from '@/stores/connections'

const connectionsStore = useConnectionsStore()

// Theme toggle
const isDarkMode = ref(false)

const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value
  document.documentElement.classList.toggle('dark', isDarkMode.value)
}

// Check for dark mode preference
onMounted(() => {
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    isDarkMode.value = true
    document.documentElement.classList.add('dark')
  }
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <header class="border-b">
      <div class="container mx-auto px-4 py-4 flex justify-between items-center">
        <div class="flex items-center space-x-4">
          <NuxtLink to="/" class="text-xl font-bold">Dgraph Admin</NuxtLink>
          
          <nav class="hidden md:flex space-x-4">
            <NuxtLink to="/" class="text-sm font-medium hover:text-primary">Dashboard</NuxtLink>
            <NuxtLink to="/connections" class="text-sm font-medium hover:text-primary">Connections</NuxtLink>
            <NuxtLink to="/schema" class="text-sm font-medium hover:text-primary">Schema</NuxtLink>
            <NuxtLink to="/query" class="text-sm font-medium hover:text-primary">Query</NuxtLink>
            <NuxtLink to="/settings" class="text-sm font-medium hover:text-primary">Settings</NuxtLink>
          </nav>
        </div>
        
        <div class="flex items-center space-x-4">
          <button 
            @click="toggleDarkMode"
            class="p-2 rounded-md hover:bg-muted"
          >
            <span v-if="isDarkMode">🌞</span>
            <span v-else>🌙</span>
          </button>
          
          <ConnectionSwitcher class="w-64" />
        </div>
      </div>
    </header>
    
    <main class="container mx-auto px-4 py-6">
      <slot />
    </main>
    
    <footer class="border-t mt-auto">
      <div class="container mx-auto px-4 py-4 text-center text-sm text-muted-foreground">
        Dgraph Admin - Manage your Dgraph instances with ease
      </div>
    </footer>
  </div>
</template>
