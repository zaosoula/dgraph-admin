<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useSchemaHistoryStore } from '@/stores/schema-history'
import { useDgraphClient } from '@/composables/useDgraphClient'

useHead({
  title: 'Dgraph Admin - Schema Editor',
  meta: [
    { name: 'description', content: 'Edit your Dgraph GraphQL schema' }
  ]
})

const connectionsStore = useConnectionsStore()
const schemaHistoryStore = useSchemaHistoryStore()
const dgraphClient = useDgraphClient()

// UI state
const activeTab = ref<'editor' | 'diff'>('editor')
const currentSchema = ref('')
const selectedVersionId = ref<string | null>(null)
const saveDescription = ref('')
const showSaveDialog = ref(false)
const showVersionSelector = ref(false)

// Get the selected version
const selectedVersion = computed(() => {
  if (!selectedVersionId.value) return null
  return schemaHistoryStore.getVersion(selectedVersionId.value)
})

// Original schema for diff
const originalSchema = computed(() => {
  return selectedVersion.value?.schema || ''
})

// Check if we have an active connection
const hasActiveConnection = computed(() => !!connectionsStore.activeConnection)

// Save current schema to history
const saveToHistory = () => {
  if (!connectionsStore.activeConnectionId) return
  
  const id = schemaHistoryStore.addVersion(
    connectionsStore.activeConnectionId,
    currentSchema.value,
    saveDescription.value || 'Manual save'
  )
  
  showSaveDialog.value = false
  saveDescription.value = ''
  
  // Select the new version
  selectedVersionId.value = id
}

// Handle schema update
const handleSchemaUpdate = (schema: string) => {
  currentSchema.value = schema
}

// Handle schema save
const handleSchemaSave = (schema: string) => {
  currentSchema.value = schema
  showSaveDialog.value = true
}

// Select a version
const selectVersion = (versionId: string) => {
  selectedVersionId.value = versionId
  
  // If in editor mode, load the selected version
  if (activeTab.value === 'editor') {
    const version = schemaHistoryStore.getVersion(versionId)
    if (version) {
      currentSchema.value = version.schema
    }
  }
}

// Delete a version
const deleteVersion = (versionId: string) => {
  schemaHistoryStore.deleteVersion(versionId)
  
  // If the deleted version was selected, clear selection
  if (selectedVersionId.value === versionId) {
    selectedVersionId.value = null
  }
}

// Apply the selected version
const applySelectedVersion = async () => {
  if (!selectedVersion.value) return
  
  currentSchema.value = selectedVersion.value.schema
  activeTab.value = 'editor'
  
  // If we're applying from diff view, also save to Dgraph
  if (connectionsStore.activeConnectionId) {
    await dgraphClient.updateSchema(currentSchema.value)
  }
}
</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold">Schema Editor</h1>
      
      <div class="flex space-x-2">
        <UiButton 
          variant="outline" 
          :class="activeTab === 'editor' ? 'bg-muted' : ''"
          @click="activeTab = 'editor'"
        >
          Editor
        </UiButton>
        
        <UiButton 
          variant="outline" 
          :class="activeTab === 'diff' ? 'bg-muted' : ''"
          @click="activeTab = 'diff'"
          :disabled="!selectedVersionId"
        >
          Diff View
        </UiButton>
        
        <UiButton 
          variant="outline" 
          @click="showVersionSelector = !showVersionSelector"
        >
          Versions
        </UiButton>
      </div>
    </div>
    
    <div v-if="!hasActiveConnection" class="text-center py-12">
      <p class="text-xl text-muted-foreground mb-4">No active connection selected</p>
      <NuxtLink to="/connections">
        <UiButton>Manage Connections</UiButton>
      </NuxtLink>
    </div>
    
    <div v-else class="grid grid-cols-1 md:grid-cols-4 gap-6">
      <!-- Main Editor/Diff Area -->
      <div class="md:col-span-3">
        <div v-if="activeTab === 'editor'" class="h-[600px]">
          <SchemaSchemaEditor 
            v-model:schema="currentSchema"
            @update:schema="handleSchemaUpdate"
            @save="handleSchemaSave"
          />
        </div>
        
        <div v-else-if="activeTab === 'diff' && selectedVersionId" class="h-[600px]">
          <SchemaSchemaEditor 
            v-model:schema="currentSchema"
            @update:schema="handleSchemaUpdate"
            @save="handleSchemaSave"
          />
        </div>
      </div>
      
      <!-- Version Selector (Sidebar) -->
      <div v-if="showVersionSelector" class="border rounded-md p-4">
        <SchemaVersionSelector 
          :selectedVersionId="selectedVersionId"
          @select="selectVersion"
          @delete="deleteVersion"
        />
        
        <div v-if="selectedVersionId" class="mt-4 pt-4 border-t">
          <UiButton 
            class="w-full"
            @click="applySelectedVersion"
          >
            Apply Selected Version
          </UiButton>
        </div>
      </div>
    </div>
    
    <!-- Save Dialog -->
    <div v-if="showSaveDialog" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <UiCard class="w-full max-w-md mx-4">
        <UiCardHeader>
          <UiCardTitle>Save Schema Version</UiCardTitle>
        </UiCardHeader>
        <UiCardContent>
          <div class="space-y-4">
            <div class="space-y-2">
              <label for="description" class="text-sm font-medium">Description</label>
              <UiInput 
                id="description" 
                v-model="saveDescription" 
                placeholder="e.g., Added new types, Updated fields"
              />
            </div>
          </div>
        </UiCardContent>
        <UiCardFooter class="flex justify-end space-x-2">
          <UiButton variant="outline" @click="showSaveDialog = false">
            Cancel
          </UiButton>
          <UiButton @click="saveToHistory">
            Save Version
          </UiButton>
        </UiCardFooter>
      </UiCard>
    </div>
  </div>
</template>

