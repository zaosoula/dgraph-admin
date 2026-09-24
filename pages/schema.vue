<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useSchemaHistoryStore } from '@/stores/schema-history'
import { useDgraphClient } from '@/composables/useDgraphClient'
import { useToast } from '@/components/ui/toast'
import { AlertTriangle, History, X } from 'lucide-vue-next'

useHead({
  title: 'Dgraph Admin - Schema Editor',
  meta: [
    { name: 'description', content: 'Edit your Dgraph GraphQL schema' }
  ]
})

const connectionsStore = useConnectionsStore()
const schemaHistoryStore = useSchemaHistoryStore()
const dgraphClient = useDgraphClient()
const toast = useToast()

// UI state
const activeTab = ref<'editor' | 'diff' | 'diagram'>('editor')
const currentSchema = ref('')
const selectedVersionId = ref<string | null>(null)
const saveDescription = ref('')
const showSaveDialog = ref(false)
const showVersionSelector = ref(false)
const showApplyDialog = ref(false)
const isApplying = ref(false)
const applyError = ref<string | null>(null)

const tabs = [
  { id: 'editor', label: 'Editor' },
  { id: 'diagram', label: 'Diagram' },
  { id: 'diff', label: 'Diff' }
] as const

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

// Surfaced when localStorage refused to keep a schema version
const storageError = computed(() => schemaHistoryStore.storageError)

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
  showVersionSelector.value = true

  if (schemaHistoryStore.storageError) {
    toast.warning('Version saved, but storage is under pressure', schemaHistoryStore.storageError)
  } else {
    toast.success('Schema version saved')
  }
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

// Ask before writing a historical version to the live database
const requestApplySelectedVersion = () => {
  if (!selectedVersion.value) return
  applyError.value = null
  showApplyDialog.value = true
}

const cancelApplySelectedVersion = () => {
  showApplyDialog.value = false
}

// Apply the selected version (confirmed)
const applySelectedVersion = async () => {
  if (!selectedVersion.value) return

  const targetName = connectionsStore.activeConnection?.name

  showApplyDialog.value = false
  currentSchema.value = selectedVersion.value.schema
  activeTab.value = 'editor'

  // If we're applying from diff view, also save to Dgraph
  if (connectionsStore.activeConnectionId) {
    isApplying.value = true
    applyError.value = null

    try {
      const result = await dgraphClient.updateSchema(currentSchema.value)

      if (result.error) {
        applyError.value = result.error.message
        toast.danger('Could not apply the version', result.error.message)
      } else {
        toast.success(
          'Version applied',
          targetName ? `${targetName} is now running this schema.` : undefined
        )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      applyError.value = message
      toast.danger('Could not apply the version', message)
    } finally {
      isApplying.value = false
    }
  }
}
</script>

<template>
  <div class="space-y-4">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-xl font-semibold tracking-tight">Schema</h1>
        <div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <template v-if="connectionsStore.activeConnection">
            <span>Reading and writing</span>
            <span class="font-mono text-foreground">
              {{ connectionsStore.activeConnection.name }}
            </span>
            <StatusBadge
              v-if="connectionsStore.activeConnection.environment === 'Production'"
              tone="warning"
              variant="outline"
            >
              Production
            </StatusBadge>
          </template>
          <span v-else>No connection selected</span>
        </div>
      </div>

      <div v-if="hasActiveConnection" class="flex flex-wrap items-center gap-2">
        <div
          class="inline-flex items-center rounded-md border border-border bg-card p-0.5"
          role="tablist"
          aria-label="Schema view"
        >
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.id"
            :disabled="tab.id === 'diff' && !selectedVersionId"
            :title="tab.id === 'diff' && !selectedVersionId ? 'Select a saved version to compare against' : undefined"
            class="rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            :class="
              activeTab === tab.id
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>

        <UiButton
          :variant="showVersionSelector ? 'secondary' : 'outline'"
          size="sm"
          :aria-pressed="showVersionSelector"
          @click="showVersionSelector = !showVersionSelector"
        >
          <History class="h-3.5 w-3.5" />
          Versions
        </UiButton>
      </div>
    </header>

    <!-- A schema version was lost or trimmed by the browser's storage limit -->
    <div
      v-if="storageError"
      class="flex items-start gap-2.5 rounded-lg border border-warning-border bg-warning-subtle px-3 py-2.5"
    >
      <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div class="min-w-0 flex-1">
        <p class="text-[13px] font-medium text-warning">Browser storage is full</p>
        <p class="mt-0.5 text-xs leading-5 text-foreground/80">{{ storageError }}</p>
        <p class="mt-1 text-xs leading-5 text-foreground/80">
          Delete schema versions you no longer need to free space.
        </p>
      </div>
      <button
        type="button"
        class="rounded p-1 text-warning transition-colors hover:bg-warning/10"
        aria-label="Dismiss storage warning"
        @click="schemaHistoryStore.clearStorageError()"
      >
        <X class="h-3.5 w-3.5" />
      </button>
    </div>

    <div v-if="!hasActiveConnection" class="rounded-lg border border-border bg-card px-4 py-8">
      <p class="text-[13px] font-medium">Select a connection first</p>
      <p class="mt-1 max-w-prose text-xs leading-5 text-muted-foreground">
        The schema editor reads from and writes to one Dgraph endpoint at a time. Choose
        the connection you want to work on.
      </p>
      <NuxtLink to="/connections" class="mt-3 inline-block">
        <UiButton size="sm">Open connections</UiButton>
      </NuxtLink>
    </div>

    <div
      v-else
      class="grid gap-4"
      :class="showVersionSelector ? 'lg:grid-cols-[minmax(0,1fr)_18rem]' : 'grid-cols-1'"
    >
      <!-- Editor / diagram / diff -->
      <div class="min-w-0 rounded-lg border border-border bg-card p-3">
        <div v-if="activeTab === 'editor'" class="h-[620px]">
          <SchemaEditor
            v-model:schema="currentSchema"
            @update:schema="handleSchemaUpdate"
            @save="handleSchemaSave"
          />
        </div>

        <div v-else-if="activeTab === 'diagram'" class="h-[620px]">
          <SchemaDiagram :schema="currentSchema" />
        </div>

        <div v-else-if="activeTab === 'diff' && selectedVersionId" class="h-[620px]">
          <SchemaDiff :original-schema="originalSchema" :new-schema="currentSchema" />
        </div>
      </div>

      <!-- Version history -->
      <aside v-if="showVersionSelector" class="rounded-lg border border-border bg-card">
        <SchemaVersionSelector
          :selected-version-id="selectedVersionId"
          @select="selectVersion"
          @delete="deleteVersion"
        />

        <div v-if="selectedVersionId" class="space-y-2 border-t border-border px-3 py-3">
          <UiButton
            class="w-full"
            size="sm"
            :disabled="isApplying"
            @click="requestApplySelectedVersion"
          >
            {{ isApplying ? 'Applying…' : 'Apply this version' }}
          </UiButton>

          <p class="text-xs leading-5 text-muted-foreground">
            Writes the selected version over the live schema on
            <span class="font-mono text-foreground">
              {{ connectionsStore.activeConnection?.name }}</span>.
          </p>

          <p v-if="applyError" class="text-xs leading-5 text-danger">{{ applyError }}</p>
        </div>
      </aside>
    </div>

    <!-- Apply version confirmation -->
    <UiDialog v-model:open="showApplyDialog">
      <UiDialogContent class="max-w-md">
        <UiDialogHeader>
          <UiDialogTitle>
            Overwrite the schema on {{ connectionsStore.activeConnection?.name }}?
          </UiDialogTitle>
          <UiDialogDescription>
            The live schema is replaced with the saved version
            “{{ selectedVersion?.description }}”. This cannot be undone.
          </UiDialogDescription>
        </UiDialogHeader>

        <div
          v-if="connectionsStore.activeConnection?.environment === 'Production'"
          class="flex items-start gap-2 rounded-md border border-danger-border bg-danger-subtle px-3 py-2 text-xs leading-5 text-danger"
        >
          <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This connection is marked as production.
        </div>

        <UiDialogFooter>
          <UiButton variant="outline" size="sm" @click="cancelApplySelectedVersion">
            Cancel
          </UiButton>
          <UiButton
            variant="destructive"
            size="sm"
            :disabled="isApplying"
            @click="applySelectedVersion"
          >
            Apply to {{ connectionsStore.activeConnection?.name }}
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>

    <!-- Save version -->
    <UiDialog v-model:open="showSaveDialog">
      <UiDialogContent class="max-w-md">
        <UiDialogHeader>
          <UiDialogTitle>Save this schema as a version</UiDialogTitle>
          <UiDialogDescription>
            Versions are kept in this browser so you can compare against them or restore
            one later.
          </UiDialogDescription>
        </UiDialogHeader>

        <div class="space-y-1.5">
          <label for="description" class="text-[13px] font-medium">Description</label>
          <UiInput
            id="description"
            v-model="saveDescription"
            placeholder="Added Order type, removed legacy fields"
          />
          <p class="text-xs text-muted-foreground">
            Left blank, it is saved as “Manual save”.
          </p>
        </div>

        <UiDialogFooter>
          <UiButton variant="outline" size="sm" @click="showSaveDialog = false">
            Cancel
          </UiButton>
          <UiButton size="sm" @click="saveToHistory">Save version</UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>
  </div>
</template>
