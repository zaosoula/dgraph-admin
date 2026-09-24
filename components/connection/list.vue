<script setup lang="ts">
import { computed, ref } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useDgraphClient } from '@/composables/useDgraphClient'
import { useConnectionExportImport } from '@/composables/useConnectionExportImport'
import { connectionTone, connectionStatusLabel } from '@/components/status'
import { Link2, Check } from 'lucide-vue-next'

const emit = defineEmits<{
  'edit': [id: string]
  'delete': [id: string]
}>()

const connectionsStore = useConnectionsStore()
const dgraphClient = useDgraphClient()
const { exportConnection } = useConnectionExportImport()

const connections = computed(() => connectionsStore.connections)
const activeConnectionId = computed(() => connectionsStore.activeConnectionId)

// Set active connection
const setActiveConnection = (id: string) => {
  connectionsStore.setActiveConnection(id)
  dgraphClient.initializeClient()
}

// Test connection
const testConnection = async (id: string) => {
  await dgraphClient.testConnection(connections.value.find(c => c.id === id))
}

// Export connection
const exportTargetId = ref<string | null>(null)
const exportError = ref<string | null>(null)
const exportIncludeCredentials = ref(false)

const exportTarget = computed(() => {
  if (!exportTargetId.value) return null
  return connections.value.find(conn => conn.id === exportTargetId.value) || null
})

const openExportDialog = (id: string, event: Event) => {
  event.stopPropagation()
  exportTargetId.value = id
  // Credentials are left out unless the user opts in on this dialog
  exportIncludeCredentials.value = false
}

const cancelExport = () => {
  exportTargetId.value = null
}

const confirmExport = () => {
  if (!exportTargetId.value) return

  const result = exportConnection(exportTargetId.value, {
    includeCredentials: exportIncludeCredentials.value
  })

  // Surface a refusal rather than closing the dialog as though it worked.
  if (!result.ok) {
    exportError.value = 'Export failed.'
    return
  }

  exportError.value = null
  exportTargetId.value = null
}

const handleExportOpenChange = (open: boolean) => {
  if (!open) {
    exportError.value = null
    cancelExport()
  }
}

// Format date
const formatDate = (date: Date) => {
  return new Date(date).toLocaleString()
}

const linkedName = (id: string) =>
  connectionsStore.getLinkedProduction(id)?.name || 'an unknown connection'

const endpointChecks = (id: string) => {
  const results = connectionsStore.connectionStates[id]?.testResults
  if (!results) return null
  return [
    { label: 'Admin health', result: results.adminHealth },
    { label: 'Schema read', result: results.adminSchemaRead },
    { label: 'Client query', result: results.clientIntrospection }
  ]
}
</script>

<template>
  <div>
    <div
      v-if="connections.length === 0"
      class="rounded-lg border border-border bg-card px-4 py-8"
    >
      <p class="text-[13px] font-medium">No connections yet</p>
      <p class="mt-1 max-w-prose text-xs leading-5 text-muted-foreground">
        Add a Dgraph endpoint to read its schema, keep a version history, and promote
        changes from development to production.
      </p>
    </div>

    <ul v-else class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      <li
        v-for="connection in connections"
        :key="connection.id"
        class="cursor-pointer px-4 py-3.5 transition-colors"
        :class="activeConnectionId === connection.id ? 'bg-accent/50' : 'hover:bg-accent/30'"
        @click="setActiveConnection(connection.id)"
      >
        <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <StatusDot
                :tone="connectionTone(connectionsStore.connectionStates[connection.id])"
                size="md"
              />
              <span class="truncate font-mono text-[13px] font-medium">
                {{ connection.name }}
              </span>

              <StatusBadge
                v-if="connection.environment === 'Production'"
                tone="warning"
                variant="outline"
              >
                Production
              </StatusBadge>
              <StatusBadge v-else-if="connection.environment" tone="neutral" variant="outline">
                {{ connection.environment }}
              </StatusBadge>

              <StatusBadge
                v-if="connection.linkedProductionId"
                tone="neutral"
                variant="outline"
              >
                <Link2 class="h-3 w-3" />
                Promotes to {{ linkedName(connection.id) }}
              </StatusBadge>

              <StatusBadge v-if="activeConnectionId === connection.id" tone="info">
                <Check class="h-3 w-3" />
                Active
              </StatusBadge>
            </div>

            <p class="mt-1 truncate font-mono text-xs text-muted-foreground">
              {{ connection.url }}
            </p>

            <div class="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{{ connectionStatusLabel(connectionsStore.connectionStates[connection.id]) }}</span>
              <span>{{ connection.type.toUpperCase() }}</span>
              <span>{{ connection.isSecure ? 'Authenticated' : 'No authentication' }}</span>
              <span>Updated {{ formatDate(connection.updatedAt) }}</span>
            </div>

            <!-- Per-endpoint results from the last test -->
            <div
              v-if="endpointChecks(connection.id)"
              class="mt-2 flex flex-wrap gap-x-4 gap-y-1"
            >
              <span
                v-for="check in endpointChecks(connection.id)"
                :key="check.label"
                class="flex items-center gap-1.5 text-xs"
                :class="check.result.success ? 'text-muted-foreground' : 'text-danger'"
                :title="check.result.error || `${check.result.responseTime}ms`"
              >
                <StatusDot :tone="check.result.success ? 'success' : 'danger'" />
                {{ check.label }}
                <span class="font-mono text-[11px] text-muted-foreground">
                  {{ check.result.responseTime }}ms
                </span>
              </span>
            </div>
          </div>

          <div class="flex shrink-0 flex-wrap items-center gap-1.5">
            <UiButton
              variant="outline"
              size="sm"
              :disabled="connectionsStore.connectionStates[connection.id]?.isLoading"
              @click.stop="testConnection(connection.id)"
            >
              {{ connectionsStore.connectionStates[connection.id]?.isLoading ? 'Testing…' : 'Test' }}
            </UiButton>

            <UiButton
              variant="ghost"
              size="sm"
              title="Export connection"
              @click.stop="openExportDialog(connection.id, $event)"
            >
              Export
            </UiButton>

            <UiButton variant="ghost" size="sm" @click.stop="emit('edit', connection.id)">
              Edit
            </UiButton>

            <UiButton
              variant="ghost"
              size="sm"
              class="text-danger hover:bg-danger-subtle hover:text-danger"
              @click.stop="emit('delete', connection.id)"
            >
              Delete
            </UiButton>
          </div>
        </div>
      </li>
    </ul>

    <!-- Export dialog -->
    <UiDialog :open="!!exportTarget" @update:open="handleExportOpenChange">
      <UiDialogContent v-if="exportTarget" @click.stop>
        <UiDialogHeader>
          <UiDialogTitle>Export {{ exportTarget.name }}</UiDialogTitle>
          <UiDialogDescription>
            The connection is written to an unencrypted JSON file in your downloads
            folder.
          </UiDialogDescription>
        </UiDialogHeader>

        <label class="flex cursor-pointer items-start gap-2 text-[13px]">
          <input
            v-model="exportIncludeCredentials"
            type="checkbox"
            class="mt-0.5 h-3.5 w-3.5 rounded border-input accent-primary"
          >
          <span>
            <span class="font-medium">Include credentials</span>
            <span class="block text-xs text-muted-foreground">
              Passwords, tokens and API keys for this connection.
            </span>
          </span>
        </label>

        <div
          v-if="exportIncludeCredentials"
          class="rounded-md border border-danger-border bg-danger-subtle p-3 text-xs leading-5 text-danger"
        >
          <p class="font-medium">The exported file will contain secrets in plaintext.</p>
          <p class="mt-1">
            Anyone who can read the file can use these credentials. Store it somewhere
            you would keep a password, and delete it once you have imported it.
          </p>
        </div>

        <p
          v-if="exportError"
          class="rounded-md border border-danger-border bg-danger-subtle p-3 text-xs leading-5 text-danger"
        >
          {{ exportError }}
        </p>

        <UiDialogFooter>
          <UiButton variant="outline" size="sm" @click="cancelExport">Cancel</UiButton>
          <UiButton
            size="sm"
            :variant="exportIncludeCredentials ? 'destructive' : 'default'"
            @click="confirmExport"
          >
            Export
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>
  </div>
</template>
