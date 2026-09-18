<script setup lang="ts">
import { computed } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useSchemaHistoryStore } from '@/stores/schema-history'
import { Trash2 } from 'lucide-vue-next'

defineProps<{
  selectedVersionId?: string | null
}>()

const emit = defineEmits<{
  'select': [versionId: string]
  'delete': [versionId: string]
}>()

const connectionsStore = useConnectionsStore()
const schemaHistoryStore = useSchemaHistoryStore()

const activeConnectionId = computed(() => connectionsStore.activeConnectionId)

// Get versions for the active connection
const versions = computed(() => {
  if (!activeConnectionId.value) return []
  return schemaHistoryStore.getVersionsForConnection(activeConnectionId.value)
})

// Format date
const formatDate = (date: Date) => {
  return new Date(date).toLocaleString()
}

// Select a version
const selectVersion = (versionId: string) => {
  emit('select', versionId)
}

// Delete a version
const deleteVersion = (versionId: string) => {
  emit('delete', versionId)
}
</script>

<template>
  <div>
    <div class="flex items-baseline justify-between border-b border-border px-3 py-2.5">
      <h3 class="text-[13px] font-semibold tracking-tight">Saved versions</h3>
      <span class="font-mono text-[11px] text-muted-foreground">{{ versions.length }}</span>
    </div>

    <div v-if="versions.length === 0" class="px-3 py-6">
      <p class="text-[13px] font-medium">No versions saved</p>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">
        Saving the schema from the editor keeps a copy here you can compare against or
        restore.
      </p>
    </div>

    <ul v-else class="max-h-[30rem] divide-y divide-border overflow-y-auto">
      <li v-for="version in versions" :key="version.id">
        <div
          class="group flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors"
          :class="selectedVersionId === version.id ? 'bg-accent/60' : 'hover:bg-accent/30'"
        >
          <button
            type="button"
            class="min-w-0 flex-1 text-left"
            :aria-pressed="selectedVersionId === version.id"
            @click="selectVersion(version.id)"
          >
            <span class="block truncate text-[13px] font-medium">
              {{ version.description }}
            </span>
            <span class="mt-0.5 block font-mono text-[11px] text-muted-foreground">
              {{ formatDate(version.timestamp) }}
            </span>
          </button>

          <button
            type="button"
            class="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-danger-subtle hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
            :aria-label="`Delete version: ${version.description}`"
            @click.stop="deleteVersion(version.id)"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
