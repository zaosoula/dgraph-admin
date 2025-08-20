<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useSchemaHistoryStore } from '@/stores/schema-history'
import type { SchemaVersion } from '@/stores/schema-history'

const props = defineProps<{
  selectedVersionId?: string
}>()

const emit = defineEmits<{
  'select': [versionId: string]
}>()

const connectionsStore = useConnectionsStore()
const schemaHistoryStore = useSchemaHistoryStore()

const activeConnectionId = computed(() => connectionsStore.activeConnectionId)

// Get versions for the active connection
const versions = computed(() => {
  if (!activeConnectionId.value) return []
  return schemaHistoryStore.getVersionsForConnection(activeConnectionId.value)
})

// Selected version
const selectedVersion = computed(() => {
  if (!props.selectedVersionId) return null
  return schemaHistoryStore.getVersion(props.selectedVersionId)
})

// Format date
const formatDate = (date: Date) => {
  return new Date(date).toLocaleString()
}

// Select a version
const selectVersion = (versionId: string) => {
  emit('select', versionId)
}
</script>

<template>
  <div>
    <h3 class="text-sm font-medium mb-2">Schema Versions</h3>
    
    <div v-if="versions.length === 0" class="text-center py-4">
      <p class="text-muted-foreground">No saved versions</p>
    </div>
    
    <div v-else class="space-y-2">
      <div 
        v-for="version in versions" 
        :key="version.id"
        class="border rounded-md p-3 cursor-pointer transition-colors"
        :class="selectedVersionId === version.id ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground'"
        @click="selectVersion(version.id)"
      >
        <div class="flex justify-between items-start">
          <div>
            <div class="font-medium">{{ version.description }}</div>
            <div class="text-xs text-muted-foreground">{{ formatDate(version.timestamp) }}</div>
          </div>
          
          <UiButton 
            variant="ghost" 
            size="sm"
            @click.stop="$emit('delete', version.id)"
          >
            Delete
          </UiButton>
        </div>
      </div>
    </div>
  </div>
</template>

