<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConnectionsStore } from '@/stores/connections'
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
  Search
} from 'lucide-vue-next'

const connectionsStore = useConnectionsStore()

useHead({
  title: 'Dgraph Admin - Dashboard',
  meta: [
    { name: 'description', content: 'Admin interface for managing Dgraph instances' }
  ]
})

// Loading state for demo
const isLoading = ref(false)

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

// Recent activity (mock data for now)
const recentActivities = ref([
  {
    id: 1,
    action: 'Schema updated',
    connection: 'Production DB',
    timestamp: '2 minutes ago',
    status: 'success'
  },
  {
    id: 2,
    action: 'Connection tested',
    connection: 'Development DB',
    timestamp: '5 minutes ago',
    status: 'success'
  },
  {
    id: 3,
    action: 'Connection failed',
    connection: 'Staging DB',
    timestamp: '10 minutes ago',
    status: 'error'
  }
])
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
        <UiButton variant="outline" size="sm" class="hover-lift">
          <Clock class="h-4 w-4 mr-2" />
          Last updated: just now
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
            
            <NuxtLink to="/explorer" class="block">
              <UiButton 
                class="w-full justify-start hover-lift" 
                variant="outline"
                :disabled="!connectionsStore.activeConnection"
              >
                <Search class="h-4 w-4 mr-2" />
                Explore Data
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
                    v-else 
                    class="h-5 w-5 text-red-500" 
                  />
                </div>
                
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-foreground">
                    {{ activity.action }}
                  </p>
                  <p class="text-xs text-muted-foreground">
                    {{ activity.connection }} • {{ activity.timestamp }}
                  </p>
                </div>
              </div>
              
              <div v-if="recentActivities.length === 0" class="text-center py-8">
                <Activity class="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p class="text-muted-foreground">No recent activity</p>
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
