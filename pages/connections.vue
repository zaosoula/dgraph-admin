<script setup lang="ts">
import { computed, ref } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useCredentialStorage } from '@/composables/useCredentialStorage'
import { useConnectionExportImport } from '@/composables/useConnectionExportImport'
import { useToast } from '@/components/ui/toast'
import type { ConnectionImportResult, ConnectionExportResult } from '@/composables/useConnectionExportImport'
import { Plus, Download, Upload } from 'lucide-vue-next'

useHead({
  title: 'Dgraph Admin - Connections',
  meta: [
    { name: 'description', content: 'Manage your Dgraph connections' }
  ]
})

const connectionsStore = useConnectionsStore()
const credentialStorage = useCredentialStorage()
const { exportConnection, exportAllConnections } = useConnectionExportImport()
const toast = useToast()

// UI state
const isAddingConnection = ref(false)
const isEditingConnection = ref(false)
const isImportingConnections = ref(false)
const editingConnectionId = ref<string | null>(null)
const showDeleteConfirm = ref(false)
const deletingConnectionId = ref<string | null>(null)
const showExportMenu = ref(false)
const exportIncludeCredentials = ref(false)
const importResult = ref<ConnectionImportResult | null>(null)

// Get connection for editing
const editingConnection = computed(() => {
  if (!editingConnectionId.value) return null
  return connectionsStore.connections.find(conn => conn.id === editingConnectionId.value) || null
})

const deletingConnection = computed(() => {
  if (!deletingConnectionId.value) return null
  return connectionsStore.connections.find(conn => conn.id === deletingConnectionId.value) || null
})

const isShowingForm = computed(
  () => isAddingConnection.value || isEditingConnection.value || isImportingConnections.value
)

// Add new connection
const addConnection = () => {
  isAddingConnection.value = true
  isEditingConnection.value = false
  isImportingConnections.value = false
  editingConnectionId.value = null
  importResult.value = null
}

// Import connections
const importConnections = () => {
  isImportingConnections.value = true
  isAddingConnection.value = false
  isEditingConnection.value = false
  editingConnectionId.value = null
  importResult.value = null
}

// Edit connection
const editConnection = (id: string) => {
  editingConnectionId.value = id
  isEditingConnection.value = true
  isAddingConnection.value = false
  isImportingConnections.value = false
  importResult.value = null
}

// Delete connection
const confirmDelete = (id: string) => {
  deletingConnectionId.value = id
  showDeleteConfirm.value = true
}

const deleteConnection = () => {
  if (!deletingConnectionId.value) return

  const name = deletingConnection.value?.name

  // Delete credentials first
  credentialStorage.deleteCredentials(deletingConnectionId.value)

  // Then delete the connection
  connectionsStore.removeConnection(deletingConnectionId.value)

  // Reset UI state
  showDeleteConfirm.value = false
  deletingConnectionId.value = null

  toast.info(
    'Connection deleted',
    name ? `${name} and its stored credentials were removed.` : undefined
  )
}

// Export connections
const openExportMenu = () => {
  showExportMenu.value = true
  // Credentials are excluded unless the user opts in each time
  exportIncludeCredentials.value = false
}

const closeExportMenu = () => {
  showExportMenu.value = false
  exportIncludeCredentials.value = false
}

const handleExportOpenChange = (open: boolean) => {
  if (open) {
    openExportMenu()
  } else {
    closeExportMenu()
  }
}

/**
 * Report what the export actually produced. The warning is driven by whether
 * credentials reached the file, not by what the checkbox asked for.
 */
const reportExport = (result: ConnectionExportResult, label: string) => {
  if (!result.ok) {
    if (result.reason === 'locked') {
      toast.danger('Export failed', 'Credentials are locked. Unlock them below before exporting.')
    } else if (result.reason === 'empty') {
      toast.info('Nothing to export', 'Add a connection first.')
    } else {
      toast.danger('Export failed', 'That connection no longer exists.')
    }
    return
  }

  toast.info(
    `Exported ${label}`,
    result.includedCredentials
      ? 'The file contains credentials in plaintext. Delete it once imported.'
      : 'Credentials were left out of the file.'
  )
}

const handleExportConnection = (id: string) => {
  const name = connectionsStore.connections.find(conn => conn.id === id)?.name
  const result = exportConnection(id, { includeCredentials: exportIncludeCredentials.value })
  closeExportMenu()
  reportExport(result, name ?? 'connection')
}

const handleExportAllConnections = () => {
  const result = exportAllConnections({ includeCredentials: exportIncludeCredentials.value })
  closeExportMenu()
  reportExport(result, `${result.ok ? result.count : 0} connections`)
}

// Handle form actions
const handleConnectionSaved = (_connectionId: string) => {
  const wasEditing = isEditingConnection.value
  isAddingConnection.value = false
  isEditingConnection.value = false
  isImportingConnections.value = false
  editingConnectionId.value = null
  toast.success(wasEditing ? 'Connection updated' : 'Connection added')
}

const handleFormCancelled = () => {
  isAddingConnection.value = false
  isEditingConnection.value = false
  isImportingConnections.value = false
  editingConnectionId.value = null
}

// Handle import result
const handleImportResult = (result: ConnectionImportResult) => {
  importResult.value = result
  isImportingConnections.value = false
}
</script>

<template>
  <div class="space-y-5">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Connections</h1>
        <p class="mt-0.5 text-xs text-muted-foreground">
          Every Dgraph endpoint this browser knows about, and which production database
          each one promotes to.
        </p>
      </div>

      <div v-if="!isShowingForm" class="flex items-center gap-2">
        <UiButton
          variant="outline"
          size="sm"
          :disabled="connectionsStore.connections.length === 0"
          @click="openExportMenu"
        >
          <Download class="h-3.5 w-3.5" />
          Export
        </UiButton>

        <UiButton variant="outline" size="sm" @click="importConnections">
          <Upload class="h-3.5 w-3.5" />
          Import
        </UiButton>

        <UiButton size="sm" @click="addConnection">
          <Plus class="h-3.5 w-3.5" />
          Add connection
        </UiButton>
      </div>
    </header>

    <section v-if="isAddingConnection" class="rounded-lg border border-border bg-card">
      <div class="border-b border-border px-4 py-3">
        <h2 class="text-[13px] font-semibold tracking-tight">New connection</h2>
        <p class="mt-0.5 text-xs text-muted-foreground">
          Credentials are stored in this browser only, separately from the connection.
        </p>
      </div>
      <div class="px-4 py-4">
        <ConnectionForm @saved="handleConnectionSaved" @cancelled="handleFormCancelled" />
      </div>
    </section>

    <section
      v-else-if="isEditingConnection && editingConnection"
      class="rounded-lg border border-border bg-card"
    >
      <div class="border-b border-border px-4 py-3">
        <h2 class="text-[13px] font-semibold tracking-tight">
          Edit {{ editingConnection.name }}
        </h2>
      </div>
      <div class="px-4 py-4">
        <ConnectionForm
          :connection="editingConnection"
          @saved="handleConnectionSaved"
          @cancelled="handleFormCancelled"
        />
      </div>
    </section>

    <section v-else-if="isImportingConnections" class="rounded-lg border border-border bg-card">
      <div class="border-b border-border px-4 py-3">
        <h2 class="text-[13px] font-semibold tracking-tight">Import connections</h2>
      </div>
      <div class="px-4 py-4">
        <ConnectionImport @imported="handleImportResult" @cancelled="handleFormCancelled" />
      </div>
    </section>

    <section v-else-if="importResult" class="rounded-lg border border-border bg-card">
      <div class="border-b border-border px-4 py-3">
        <h2 class="text-[13px] font-semibold tracking-tight">Import result</h2>
      </div>

      <div class="space-y-4 px-4 py-4">
        <div
          class="rounded-md border px-3 py-2.5 text-[13px]"
          :class="
            importResult.success
              ? 'border-success-border bg-success-subtle text-success'
              : 'border-danger-border bg-danger-subtle text-danger'
          "
        >
          {{ importResult.message }}
        </div>

        <div v-if="importResult.errors.length > 0" class="space-y-1.5">
          <h3 class="text-[13px] font-medium">What could not be imported</h3>
          <ul class="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li v-for="(error, index) in importResult.errors" :key="index">
              {{ error }}
            </li>
          </ul>
        </div>
      </div>

      <div class="border-t border-border px-4 py-3">
        <UiButton size="sm" @click="importResult = null">Back to connections</UiButton>
      </div>
    </section>

    <ConnectionList v-else @edit="editConnection" @delete="confirmDelete" />

    <!-- Export dialog -->
    <UiDialog :open="showExportMenu" @update:open="handleExportOpenChange">
      <UiDialogContent>
        <UiDialogHeader>
          <UiDialogTitle>Export connections</UiDialogTitle>
          <UiDialogDescription>
            Connections are written to an unencrypted JSON file in your downloads folder.
          </UiDialogDescription>
        </UiDialogHeader>

        <label class="flex cursor-pointer items-start gap-2 text-[13px]">
          <input
            v-model="exportIncludeCredentials"
            type="checkbox"
            class="mt-0.5 h-3.5 w-3.5 rounded border-input accent-primary"
          />
          <span>
            <span class="font-medium">Include credentials</span>
            <span class="block text-xs text-muted-foreground">
              Passwords, tokens and API keys. Off by default.
            </span>
          </span>
        </label>

        <div
          v-if="exportIncludeCredentials"
          class="rounded-md border border-danger-border bg-danger-subtle p-3 text-xs leading-5 text-danger"
        >
          The downloaded file will contain these secrets in plaintext. Anyone who can
          read the file can use them. Delete it once you have imported it.
        </div>

        <div class="-mx-1 max-h-64 overflow-y-auto">
          <button
            type="button"
            class="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13px] transition-colors hover:bg-accent"
            @click="handleExportAllConnections"
          >
            <span class="font-medium">All connections</span>
            <span class="font-mono text-[11px] text-muted-foreground">
              {{ connectionsStore.connections.length }}
            </span>
          </button>

          <div class="my-1 border-t border-border" />

          <button
            v-for="connection in connectionsStore.connections"
            :key="connection.id"
            type="button"
            class="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-[13px] transition-colors hover:bg-accent"
            @click="handleExportConnection(connection.id)"
          >
            <span class="truncate font-mono">{{ connection.name }}</span>
            <StatusBadge
              v-if="connection.environment === 'Production'"
              tone="warning"
              variant="outline"
            >
              Production
            </StatusBadge>
          </button>
        </div>

        <UiDialogFooter>
          <UiButton variant="outline" size="sm" @click="closeExportMenu">Cancel</UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>

    <!-- Delete confirmation -->
    <UiDialog v-model:open="showDeleteConfirm">
      <UiDialogContent class="max-w-md">
        <UiDialogHeader>
          <UiDialogTitle>
            Delete {{ deletingConnection?.name || 'this connection' }}?
          </UiDialogTitle>
          <UiDialogDescription>
            The connection and any credentials stored for it are removed from this
            browser. Saved schema versions for it are removed too. This cannot be undone.
          </UiDialogDescription>
        </UiDialogHeader>

        <UiDialogFooter>
          <UiButton variant="outline" size="sm" @click="showDeleteConfirm = false">
            Cancel
          </UiButton>
          <UiButton variant="destructive" size="sm" @click="deleteConnection">
            Delete connection
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>
  </div>
</template>
