<script setup lang="ts">
import { ref } from 'vue'
import { useCredentialStorage } from '@/composables/useCredentialStorage'

useHead({
  title: 'Dgraph Admin - Settings',
  meta: [
    { name: 'description', content: 'Configure your Dgraph Admin settings' }
  ]
})

const credentialStorage = useCredentialStorage()

// UI state
const showClearConfirm = ref(false)
const clearSuccess = ref(false)

// Toggle persistence
const togglePersistence = () => {
  credentialStorage.setPersistence(!credentialStorage.isPersistent.value)
}

// Clear all credentials
const confirmClearCredentials = () => {
  showClearConfirm.value = true
}

const clearAllCredentials = () => {
  const success = credentialStorage.clearAllCredentials()
  showClearConfirm.value = false
  
  if (success) {
    clearSuccess.value = true
    setTimeout(() => {
      clearSuccess.value = false
    }, 3000)
  }
}
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold mb-6">Settings</h1>
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <UiCard>
        <UiCardHeader>
          <UiCardTitle>Credential Storage</UiCardTitle>
          <UiCardDescription>Configure how credentials are stored in your browser</UiCardDescription>
        </UiCardHeader>
        <UiCardContent>
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-medium">Persistent Storage</h3>
                <p class="text-sm text-muted-foreground">
                  Store credentials across browser sessions
                </p>
              </div>
              
              <div class="flex items-center">
                <button 
                  @click="togglePersistence"
                  class="relative inline-flex h-6 w-11 items-center rounded-full"
                  :class="credentialStorage.isPersistent.value ? 'bg-primary' : 'bg-muted'"
                >
                  <span 
                    class="inline-block h-4 w-4 transform rounded-full bg-background transition"
                    :class="credentialStorage.isPersistent.value ? 'translate-x-6' : 'translate-x-1'"
                  ></span>
                </button>
              </div>
            </div>
            
            <div class="pt-4 border-t">
              <h3 class="font-medium mb-2">Clear Credentials</h3>
              <p class="text-sm text-muted-foreground mb-4">
                Remove all stored credentials from your browser
              </p>
              
              <UiButton 
                variant="destructive" 
                @click="confirmClearCredentials"
              >
                Clear All Credentials
              </UiButton>
              
              <div v-if="clearSuccess" class="mt-2 text-sm text-green-600">
                All credentials have been cleared successfully.
              </div>
            </div>
          </div>
        </UiCardContent>
      </UiCard>
      
      <UiCard>
        <UiCardHeader>
          <UiCardTitle>About</UiCardTitle>
        </UiCardHeader>
        <UiCardContent>
          <div class="space-y-4">
            <div>
              <h3 class="font-medium">Dgraph Admin</h3>
              <p class="text-sm text-muted-foreground">
                A web-based admin interface for managing Dgraph instances
              </p>
            </div>
            
            <div class="pt-4 border-t">
              <h3 class="font-medium">Features</h3>
              <ul class="list-disc list-inside text-sm space-y-1 mt-2">
                <li>Manage multiple Dgraph connections</li>
                <li>Securely store credentials in your browser</li>
                <li>Edit GraphQL schema with syntax highlighting</li>
                <li>Compare schema versions with diff view</li>
                <li>Track schema history</li>
              </ul>
            </div>
            
            <div class="pt-4 border-t">
              <h3 class="font-medium">Security</h3>
              <p class="text-sm text-muted-foreground mt-2">
                All credentials are encrypted before being stored in your browser.
                No data is sent to any external servers.
              </p>
            </div>
          </div>
        </UiCardContent>
      </UiCard>
    </div>
    
    <!-- Clear Confirmation Dialog -->
    <div v-if="showClearConfirm" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <UiCard class="w-full max-w-md mx-4">
        <UiCardHeader>
          <UiCardTitle>Confirm Clear Credentials</UiCardTitle>
        </UiCardHeader>
        <UiCardContent>
          <p>Are you sure you want to clear all stored credentials? This action cannot be undone.</p>
        </UiCardContent>
        <UiCardFooter class="flex justify-end space-x-2">
          <UiButton variant="outline" @click="showClearConfirm = false">
            Cancel
          </UiButton>
          <UiButton variant="destructive" @click="clearAllCredentials">
            Clear All
          </UiButton>
        </UiCardFooter>
      </UiCard>
    </div>
  </div>
</template>

