<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
import { useActivityHistory } from '@/composables/useActivityHistory'
import { useSchemaSyncStatus } from '@/composables/useSchemaSyncStatus'
import { 
  Database, 
  Activity, 
  Zap, 
  TrendingUp,
  Plus,
  Settings,
  GitBranch,
  Clock,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  GitCompare,
  AlertTriangle,
  Info
} from 'lucide-vue-next'

const connectionsStore = useConnectionsStore()
const { getRecentActivities, formatRelativeTime, getActivityColor } = useActivityHistory()
const { syncSummary, checkAllSyncStatuses, isCheckingAll } = useSchemaSyncStatus()

useHead({
  title: 'Dgraph Admin - Dashboard',
  meta: [
    { name: 'description', content: 'Admin interface for managing Dgraph instances' }
  ]
})

// Loading state for demo
const isLoading = ref(false)

// Last refresh timestamp
const lastRefreshTime = ref<Date | null>(null)

// Connection stats
const connectionCount = computed(() => connectionsStore.connections.length)
const activeConnections = computed(() => {
  return connectionsStore.connections.filter(conn => {
    const state = connectionsStore.connectionStates[conn.id]
    return state?.isConnected
  }).length
})

const connectionHealth = computed(() => {
  if (connectionCount.value === 0) return 'No connections'
  const healthPercentage = Math.round((activeConnections.value / connectionCount.value) * 100)
  return `${healthPercentage}% healthy`
})

// Refresh all connections
const handleRefreshAll = async () => {
  try {
    const result = await connectionsStore.refreshAllConnections()
    lastRefreshTime.value = new Date()
    console.log('Refresh completed:', result)
  } catch (error) {
    console.error('Failed to refresh connections:', error)
  }
}

// Recent activities from activity history
const recentActivities = computed(() => getRecentActivities.value(6))
</script>

<template>
  <div class="space-y-8">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p class="text-muted-foreground mt-2">
          Monitor and manage your Dgraph instances
        </p>
      </div>
      
      <div class="flex items-center space-x-3">
        <UiButton 
          variant="outline" 
          size="sm" 
          class="hover-lift"
          @click="handleRefreshAll"
          :disabled="connectionsStore.isRefreshingAll || connectionCount === 0"
        >
          <RefreshCw 
            class="h-4 w-4 mr-2" 
            :class="{ 'animate-spin': connectionsStore.isRefreshingAll }" 
          />
          {{ connectionsStore.isRefreshingAll ? 'Refreshing...' : 'Refresh All' }}
        </UiButton>
        
        <UiButton variant="outline" size="sm" class="hover-lift">
          <Clock class="h-4 w-4 mr-2" />
          {{ lastRefreshTime ? `Updated ${formatRelativeTime(lastRefreshTime)}` : 'Never updated' }}
        </UiButton>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <DashboardStatCard
        title="Total Connections"
        :value="connectionCount"
        description="Configured connections"
        :icon="Database"
        variant="primary"
        :loading="isLoading"
        :trend="{ value: 12, label: 'vs last week', isPositive: true }"
      />
      
      <DashboardStatCard
        title="Active Connections"
        :value="activeConnections"
        description="Currently connected"
        :icon="Activity"
        :variant="activeConnections > 0 ? 'success' : 'warning'"
        :loading="isLoading"
      />
      
      <DashboardStatCard
        title="Health Status"
        :value="connectionHealth"
        description="Overall system health"
        :icon="TrendingUp"
        :variant="activeConnections === connectionCount ? 'success' : 'warning'"
        :loading="isLoading"
      />
      
      <DashboardStatCard
        title="Current Connection"
        :value="connectionsStore.activeConnection?.name || 'None'"
        description="Selected for operations"
        :icon="Zap"
        variant="default"
        :loading="isLoading"
      />
    </div>

    <!-- Promotable Databases Section -->
    <div v-if="syncSummary.hasPromotableConnections" class="space-y-4">
      <UiCard class="hover-lift">
        <UiCardHeader>
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <GitCompare class="h-5 w-5 text-primary" />
              <UiCardTitle>Promotable Databases</UiCardTitle>
            </div>
            <UiButton 
              variant="outline" 
              size="sm"
              @click="checkAllSyncStatuses"
              :disabled="isCheckingAll || syncSummary.total === 0"
            >
              <RefreshCw 
                class="h-4 w-4 mr-2" 
                :class="{ 'animate-spin': isCheckingAll }" 
              />
              {{ isCheckingAll ? 'Checking...' : 'Check All' }}
            </UiButton>
          </div>
          <UiCardDescription>
            Development databases linked to production environments
          </UiCardDescription>
        </UiCardHeader>
        <UiCardContent>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <!-- Summary Stats -->
            <div class="text-center p-4 rounded-lg bg-muted/50">
              <div class="text-2xl font-bold text-foreground">{{ syncSummary.total }}</div>
              <div class="text-sm text-muted-foreground">Total Linked</div>
            </div>
            
            <div class="text-center p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
              <div class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {{ syncSummary.withDifferences }}
              </div>
              <div class="text-sm text-muted-foreground">Need Promotion</div>
            </div>
            
            <div class="text-center p-4 rounded-lg bg-green-50 dark:bg-green-900/20">
              <div class="text-2xl font-bold text-green-600 dark:text-green-400">
                {{ syncSummary.synced }}
              </div>
              <div class="text-sm text-muted-foreground">In Sync</div>
            </div>
          </div>

          <!-- Connections List -->
          <div class="space-y-3">
            <div 
              v-for="connection in syncSummary.total > 0 ? connectionsStore.connections.filter(c => c.environment === 'Development' && c.linkedProductionId) : []"
              :key="connection.id"
              class="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
            >
              <div class="flex items-center space-x-3">
                <div class="flex-shrink-0">
                  <Database class="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p class="font-medium text-foreground">{{ connection.name }}</p>
                  <p class="text-sm text-muted-foreground">
                    Linked to: {{ connectionsStore.connections.find(c => c.id === connection.linkedProductionId)?.name || 'Unknown' }}
                  </p>
                </div>
              </div>
              
              <div class="flex items-center space-x-2">
                <!-- Sync Status -->
                <div class="flex items-center space-x-1">
                  <CheckCircle 
                    v-if="syncSummary.synced > 0" 
                    class="h-4 w-4 text-green-500" 
                  />
                  <AlertTriangle 
                    v-else-if="syncSummary.withDifferences > 0" 
                    class="h-4 w-4 text-yellow-500" 
                  />
                  <Info 
                    v-else 
                    class="h-4 w-4 text-muted-foreground" 
                  />
                  <span class="text-sm text-muted-foreground">
                    {{ syncSummary.synced > 0 ? 'Synced' : syncSummary.withDifferences > 0 ? 'Needs promotion' : 'Unknown' }}
                  </span>
                </div>
                
                <!-- Action Button -->
                <NuxtLink :to="`/connections/${connection.id}/promote`">
                  <UiButton variant="outline" size="sm">
                    <GitBranch class="h-4 w-4 mr-1" />
                    Promote
                  </UiButton>
                </NuxtLink>
              </div>
            </div>
            
            <div v-if="syncSummary.total === 0" class="text-center py-8">
              <GitCompare class="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p class="text-muted-foreground">No linked development databases found</p>
              <p class="text-sm text-muted-foreground mt-1">
                Link development databases to production to enable schema promotion
              </p>
            </div>
          </div>
        </UiCardContent>
      </UiCard>
    </div>

    <!-- Main Content Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Quick Actions -->
      <div class="lg:col-span-1">
        <UiCard class="hover-lift">
          <UiCardHeader>
            <UiCardTitle class="flex items-center space-x-2">
              <Plus class="h-5 w-5 text-primary" />
              <span>Quick Actions</span>
            </UiCardTitle>
            <UiCardDescription>
              Common tasks and operations
            </UiCardDescription>
          </UiCardHeader>
          <UiCardContent class="space-y-3">
            <NuxtLink to="/connections" class="block">
              <UiButton class="w-full justify-start hover-lift" variant="outline">
                <Database class="h-4 w-4 mr-2" />
                Manage Connections
              </UiButton>
            </NuxtLink>
            
            <NuxtLink to="/schema" class="block">
              <UiButton 
                class="w-full justify-start hover-lift" 
                variant="outline"
                :disabled="!connectionsStore.activeConnection"
              >
                <GitBranch class="h-4 w-4 mr-2" />
                Edit Schema
              </UiButton>
            </NuxtLink>
            
            <NuxtLink to="/settings" class="block">
              <UiButton class="w-full justify-start hover-lift" variant="outline">
                <Settings class="h-4 w-4 mr-2" />
                Settings
              </UiButton>
            </NuxtLink>
          </UiCardContent>
        </UiCard>
      </div>

      <!-- Recent Activity -->
      <div class="lg:col-span-2">
        <UiCard class="hover-lift">
          <UiCardHeader>
            <UiCardTitle class="flex items-center space-x-2">
              <Activity class="h-5 w-5 text-primary" />
              <span>Recent Activity</span>
            </UiCardTitle>
            <UiCardDescription>
              Latest operations and events
            </UiCardDescription>
          </UiCardHeader>
          <UiCardContent>
            <div class="space-y-4">
              <div 
                v-for="activity in recentActivities" 
                :key="activity.id"
                class="flex items-center space-x-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <div class="flex-shrink-0">
                  <CheckCircle 
                    v-if="activity.status === 'success'" 
                    class="h-5 w-5 text-green-500" 
                  />
                  <AlertCircle 
                    v-else-if="activity.status === 'error'" 
                    class="h-5 w-5 text-red-500" 
                  />
                  <AlertTriangle 
                    v-else-if="activity.status === 'warning'" 
                    class="h-5 w-5 text-yellow-500" 
                  />
                  <Info 
                    v-else 
                    class="h-5 w-5 text-blue-500" 
                  />
                </div>
                
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-foreground">
                    {{ activity.action }}
                  </p>
                  <p class="text-xs text-muted-foreground">
                    {{ activity.connectionName }} • {{ formatRelativeTime(activity.timestamp) }}
                  </p>
                  <p v-if="activity.details" class="text-xs text-muted-foreground mt-1">
                    {{ activity.details }}
                  </p>
                </div>
              </div>
              
              <div v-if="recentActivities.length === 0" class="text-center py-8">
                <Activity class="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p class="text-muted-foreground">No recent activity</p>
                <p class="text-sm text-muted-foreground mt-1">
                  Activity will appear here when you test connections or perform operations
                </p>
              </div>
            </div>
          </UiCardContent>
        </UiCard>
      </div>
    </div>

    <!-- Getting Started (only show if no connections) -->
    <div v-if="connectionCount === 0" class="mt-8">
      <UiCard class="border-dashed border-2 hover-lift">
        <UiCardContent class="p-8 text-center">
          <div class="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Database class="h-8 w-8 text-primary" />
          </div>
          
          <h3 class="text-xl font-semibold mb-2">Welcome to Dgraph Admin!</h3>
          <p class="text-muted-foreground mb-6 max-w-md mx-auto">
            Get started by adding your first Dgraph connection. Once connected, you can manage schemas, 
            run queries, and monitor your database instances.
          </p>
          
          <div class="flex flex-col sm:flex-row gap-3 justify-center">
            <NuxtLink to="/connections">
              <UiButton class="hover-lift">
                <Plus class="h-4 w-4 mr-2" />
                Add Your First Connection
              </UiButton>
            </NuxtLink>
            
            <UiButton variant="outline" class="hover-lift">
              <Settings class="h-4 w-4 mr-2" />
              View Documentation
            </UiButton>
          </div>
        </UiCardContent>
      </UiCard>
    </div>
  </div>
</template>
