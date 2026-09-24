<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useActivityHistory } from '@/composables/useActivityHistory'
import { useSchemaSyncStatus } from '@/composables/useSchemaSyncStatus'
import { useToast } from '@/components/ui/toast'
import type { StatusTone } from '@/components/status'
import type { Connection } from '@/types/connection'
import type { ActivityStatus } from '@/stores/activity'
import {
  Database,
  Activity,
  Radio,
  HeartPulse,
  Plus,
  Settings,
  GitBranch,
  RefreshCw,
  ArrowRight,
  UploadCloud
} from 'lucide-vue-next'

const connectionsStore = useConnectionsStore()
const { getRecentActivities, formatRelativeTime } = useActivityHistory()
const { syncSummary, checkAllSyncStatuses, ensureFreshStatuses, isCheckingAll, getSyncStatus } = useSchemaSyncStatus()
const toast = useToast()

const isPromoteDialogOpen = ref(false)
const selectedConnectionForPromotion = ref<Connection | null>(null)

useHead({
  title: 'Dgraph Admin - Dashboard',
  meta: [
    { name: 'description', content: 'Admin interface for managing Dgraph instances' }
  ]
})

const lastRefreshTime = ref<Date | null>(null)

const connectionCount = computed(() => connectionsStore.connections.length)

const activeConnections = computed(
  () =>
    connectionsStore.connections.filter(
      conn => connectionsStore.connectionStates[conn.id]?.isConnected
    ).length
)

const connectionHealth = computed(() => {
  if (connectionCount.value === 0) return '—'
  return `${Math.round((activeConnections.value / connectionCount.value) * 100)}%`
})

const healthCaption = computed(() => {
  if (connectionCount.value === 0) return 'Nothing configured yet'
  if (activeConnections.value === connectionCount.value) return 'Every endpoint answered'
  return `${connectionCount.value - activeConnections.value} not answering`
})

// Refresh every connection and report the outcome where the user can see it
const handleRefreshAll = async () => {
  try {
    const result = await connectionsStore.refreshAllConnections()
    lastRefreshTime.value = new Date()

    const total = result.results.length

    if (result.failed === 0) {
      toast.success(
        `${result.success} of ${total} connections online`,
        'Every endpoint answered its health check.'
      )
    } else if (result.success === 0) {
      toast.danger(
        `No connections answered`,
        `All ${total} endpoints failed their health check.`
      )
    } else {
      toast.warning(
        `${result.success} of ${total} connections online`,
        `${result.failed} did not answer. Open Connections to see which.`
      )
    }
  } catch (error) {
    toast.danger(
      'Could not refresh connections',
      error instanceof Error ? error.message : String(error)
    )
  }
}

const handleCheckAll = async () => {
  const result = await checkAllSyncStatuses()
  const total = 'total' in result ? result.total : 0
  if (total === 0) return

  if (result.errors > 0) {
    toast.warning(
      'Schema check finished with errors',
      `${result.withDifferences} need promotion, ${result.errors} could not be compared.`
    )
  } else if (result.withDifferences > 0) {
    toast.warning(
      `${result.withDifferences} of ${total} databases have drifted`,
      'Promote them to bring production in line with development.'
    )
  } else {
    toast.success('Every linked database is in sync', 'No schema differences found.')
  }
}

const recentActivities = computed(() => getRecentActivities.value(8))

const activityTone: Record<ActivityStatus, StatusTone> = {
  success: 'success',
  error: 'danger',
  warning: 'warning',
  info: 'info'
}

// Development databases that have a production counterpart configured
const linkedPairs = computed(() =>
  connectionsStore.connections
    .filter(conn => conn.environment === 'Development' && conn.linkedProductionId)
    .map(conn => ({
      dev: conn,
      prod: connectionsStore.connections.find(c => c.id === conn.linkedProductionId) ?? null,
      sync: getSyncStatus.value(conn.id)
    }))
)

const syncTone = (pair: (typeof linkedPairs.value)[number]): StatusTone => {
  if (pair.sync?.isChecking) return 'info'
  if (pair.sync?.error) return 'danger'
  if (pair.sync?.hasDifferences === true) return 'warning'
  if (pair.sync?.hasDifferences === false) return 'success'
  return 'neutral'
}

const syncLabel = (pair: (typeof linkedPairs.value)[number]): string => {
  if (pair.sync?.isChecking) return 'Comparing…'
  if (pair.sync?.error) return 'Comparison failed'
  if (pair.sync?.hasDifferences === true) {
    const count = pair.sync.comparisonResult?.differences?.length ?? 0
    return count > 0 ? `${count} changes to promote` : 'Changes to promote'
  }
  if (pair.sync?.hasDifferences === false) return 'In sync'
  return 'Not compared yet'
}

// Bring stale or never-checked pairs up to date when the dashboard opens, so the
// rows do not sit on "Unknown" until someone presses Check All. Deliberately not
// awaited: the page renders immediately and each row fills in as its check lands.
onMounted(() => {
  ensureFreshStatuses().catch((error) => {
    console.error('Failed to refresh schema sync statuses:', error)
  })
})

const handleOpenPromoteModal = (connection: Connection) => {
  selectedConnectionForPromotion.value = connection
  isPromoteDialogOpen.value = true
}

const handlePromotionSuccess = () => {
  checkAllSyncStatuses()
}

const shortcuts = [
  {
    to: '/connections',
    icon: Database,
    label: 'Manage connections',
    description: 'Add an endpoint, test it, link dev to prod'
  },
  {
    to: '/schema',
    icon: GitBranch,
    label: 'Edit schema',
    description: 'Read and write the GraphQL schema'
  },
  {
    to: '/settings',
    icon: Settings,
    label: 'Settings',
    description: 'Credential storage and app preferences'
  }
]
</script>

<template>
  <div class="space-y-5">
    <!-- Page header -->
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p class="mt-0.5 text-xs text-muted-foreground">
          Connection health, schema sync and recent activity across your Dgraph instances.
        </p>
      </div>

      <div class="flex items-center gap-3">
        <span class="hidden text-xs text-muted-foreground sm:inline">
          {{
            lastRefreshTime
              ? `Checked ${formatRelativeTime(lastRefreshTime)}`
              : 'Not checked this session'
          }}
        </span>

        <UiButton
          variant="outline"
          size="sm"
          :disabled="connectionsStore.isRefreshingAll || connectionCount === 0"
          @click="handleRefreshAll"
        >
          <RefreshCw
            class="h-3.5 w-3.5"
            :class="{ 'animate-spin': connectionsStore.isRefreshingAll }"
          />
          {{ connectionsStore.isRefreshingAll ? 'Checking…' : 'Check all connections' }}
        </UiButton>
      </div>
    </header>

    <!-- Fleet figures: one block, four cells, one baseline -->
    <section
      class="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-4 lg:divide-y-0"
      aria-label="Connection summary"
    >
      <DashboardStatCard
        title="Connections"
        :value="connectionCount"
        :description="connectionCount === 1 ? '1 endpoint configured' : `${connectionCount} endpoints configured`"
        :icon="Database"
        variant="default"
      />

      <DashboardStatCard
        title="Online"
        :value="activeConnections"
        :description="activeConnections > 0 ? 'Answering health checks' : 'None answering'"
        :icon="Radio"
        :variant="connectionCount === 0 ? 'default' : activeConnections > 0 ? 'success' : 'danger'"
      />

      <DashboardStatCard
        title="Reachable"
        :value="connectionHealth"
        :description="healthCaption"
        :icon="HeartPulse"
        :variant="
          connectionCount === 0
            ? 'default'
            : activeConnections === connectionCount
              ? 'success'
              : activeConnections === 0
                ? 'danger'
                : 'warning'
        "
      />

      <DashboardStatCard
        title="Active connection"
        :value="connectionsStore.activeConnection?.name || 'None selected'"
        :description="connectionsStore.activeConnection?.url || 'Pick one to edit its schema'"
        :icon="Activity"
        variant="default"
      />
    </section>

    <!-- Empty state replaces the working surfaces entirely -->
    <section
      v-if="connectionCount === 0"
      class="rounded-lg border border-border bg-card p-6"
    >
      <h2 class="text-[15px] font-semibold tracking-tight">Add your first connection</h2>
      <p class="mt-1.5 max-w-prose text-xs leading-5 text-muted-foreground">
        Dgraph Admin talks to your instances straight from this browser. Point it at a
        Dgraph endpoint and it can read and write the GraphQL schema, keep a version
        history, and promote a schema from a development database to the production one
        it is linked to.
      </p>
      <div class="mt-4">
        <NuxtLink to="/connections">
          <UiButton size="sm">
            <Plus class="h-3.5 w-3.5" />
            Add a connection
          </UiButton>
        </NuxtLink>
      </div>
    </section>

    <div v-else class="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <!-- Schema sync: the dev → prod pairing is the spine of this app -->
      <section class="rounded-lg border border-border bg-card">
        <div
          class="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3"
        >
          <div>
            <h2 class="text-[13px] font-semibold tracking-tight">Schema sync</h2>
            <p class="mt-0.5 text-xs text-muted-foreground">
              Development databases and the production databases they promote to.
            </p>
          </div>

          <UiButton
            variant="outline"
            size="sm"
            :disabled="isCheckingAll || syncSummary.total === 0"
            @click="handleCheckAll"
          >
            <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': isCheckingAll }" />
            {{ isCheckingAll ? 'Comparing…' : 'Compare all' }}
          </UiButton>
        </div>

        <dl
          v-if="syncSummary.total > 0"
          class="grid grid-cols-3 divide-x divide-border border-b border-border"
        >
          <div class="px-4 py-2.5">
            <dd class="font-mono text-base font-medium tabular-nums">{{ syncSummary.total }}</dd>
            <dt class="text-xs text-muted-foreground">Linked</dt>
          </div>
          <div class="px-4 py-2.5">
            <dd
              class="font-mono text-base font-medium tabular-nums"
              :class="syncSummary.withDifferences > 0 ? 'text-warning' : ''"
            >
              {{ syncSummary.withDifferences }}
            </dd>
            <dt class="text-xs text-muted-foreground">Need promotion</dt>
          </div>
          <div class="px-4 py-2.5">
            <dd class="font-mono text-base font-medium tabular-nums">{{ syncSummary.synced }}</dd>
            <dt class="text-xs text-muted-foreground">In sync</dt>
          </div>
        </dl>

        <ul v-if="linkedPairs.length > 0" class="divide-y divide-border">
          <li
            v-for="pair in linkedPairs"
            :key="pair.dev.id"
            class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
          >
            <div class="flex min-w-0 flex-1 items-center gap-2">
              <StatusDot :tone="syncTone(pair)" :busy="pair.sync?.isChecking" size="md" />

              <div class="min-w-0">
                <div class="flex min-w-0 items-center gap-1.5 font-mono text-[13px]">
                  <span class="truncate">{{ pair.dev.name }}</span>
                  <ArrowRight class="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span class="truncate text-muted-foreground">
                    {{ pair.prod?.name || 'unknown target' }}
                  </span>
                </div>
                <p class="mt-0.5 text-xs" :class="pair.sync?.hasDifferences ? 'text-warning' : 'text-muted-foreground'">
                  {{ syncLabel(pair) }}
                  <span v-if="pair.sync?.lastChecked" class="text-muted-foreground">
                    · compared {{ formatRelativeTime(pair.sync.lastChecked) }}
                  </span>
                </p>
              </div>
            </div>

            <UiButton
              variant="outline"
              size="sm"
              :disabled="pair.sync?.isChecking || !pair.prod"
              @click="handleOpenPromoteModal(pair.dev)"
            >
              <UploadCloud class="h-3.5 w-3.5" />
              Promote
            </UiButton>
          </li>
        </ul>

        <div v-else class="px-4 py-8">
          <p class="text-[13px] font-medium">No databases are linked yet</p>
          <p class="mt-1 max-w-prose text-xs leading-5 text-muted-foreground">
            Edit a development connection and choose the production connection it should
            promote to. Once linked, its schema can be compared and promoted from here.
          </p>
          <NuxtLink to="/connections" class="mt-3 inline-block">
            <UiButton variant="outline" size="sm">Open connections</UiButton>
          </NuxtLink>
        </div>
      </section>

      <!-- Activity -->
      <section class="rounded-lg border border-border bg-card">
        <div class="border-b border-border px-4 py-3">
          <h2 class="text-[13px] font-semibold tracking-tight">Activity</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            What this session has done, newest first.
          </p>
        </div>

        <ul v-if="recentActivities.length > 0" class="divide-y divide-border">
          <li
            v-for="activity in recentActivities"
            :key="activity.id"
            class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 px-4 py-2.5"
          >
            <StatusDot :tone="activityTone[activity.status]" class="mt-1.5" />

            <div class="min-w-0">
              <div class="flex items-baseline justify-between gap-2">
                <p class="truncate text-[13px] font-medium">{{ activity.action }}</p>
                <span class="shrink-0 text-[11px] text-muted-foreground">
                  {{ formatRelativeTime(activity.timestamp) }}
                </span>
              </div>
              <p class="truncate font-mono text-[11px] text-muted-foreground">
                {{ activity.connectionName }}
              </p>
              <p v-if="activity.details" class="mt-0.5 text-xs leading-5 text-muted-foreground">
                {{ activity.details }}
              </p>
            </div>
          </li>
        </ul>

        <div v-else class="px-4 py-8">
          <p class="text-[13px] font-medium">Nothing has happened yet</p>
          <p class="mt-1 text-xs leading-5 text-muted-foreground">
            Connection tests, schema comparisons and promotions are recorded here as you
            run them.
          </p>
        </div>
      </section>
    </div>

    <!-- Where to go next -->
    <nav
      class="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0"
      aria-label="Shortcuts"
    >
      <NuxtLink
        v-for="shortcut in shortcuts"
        :key="shortcut.to"
        :to="shortcut.to"
        class="group flex items-start gap-2.5 px-4 py-3 transition-colors hover:bg-accent"
      >
        <component :is="shortcut.icon" class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span class="min-w-0">
          <span class="block text-[13px] font-medium">{{ shortcut.label }}</span>
          <span class="block text-xs text-muted-foreground">{{ shortcut.description }}</span>
        </span>
      </NuxtLink>
    </nav>

    <ConnectionSchemaPromotionDialog
      v-if="selectedConnectionForPromotion"
      :open="isPromoteDialogOpen"
      :dev-connection="selectedConnectionForPromotion"
      @update:open="isPromoteDialogOpen = $event"
      @promotion-success="handlePromotionSuccess"
    />
  </div>
</template>
