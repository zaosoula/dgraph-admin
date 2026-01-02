import { ref, computed } from 'vue'

export type ActivityType = 'connection_test' | 'schema_comparison' | 'schema_promotion' | 'connection_added' | 'connection_removed'

export type ActivityStatus = 'success' | 'error' | 'warning' | 'info'

export type Activity = {
  id: string
  type: ActivityType
  action: string
  connectionName: string
  connectionId: string
  timestamp: Date
  status: ActivityStatus
  details?: string
  error?: string
}

const MAX_ACTIVITIES = 50

export const useActivityHistory = () => {
  const activities = ref<Activity[]>([])

  // Add a new activity to the history
  const addActivity = (activity: Omit<Activity, 'id' | 'timestamp'>) => {
    const newActivity: Activity = {
      ...activity,
      id: crypto.randomUUID(),
      timestamp: new Date()
    }

    activities.value.unshift(newActivity)

    // Keep only the most recent activities
    if (activities.value.length > MAX_ACTIVITIES) {
      activities.value = activities.value.slice(0, MAX_ACTIVITIES)
    }
  }

  // Get recent activities (default: last 10)
  const getRecentActivities = computed(() => (limit: number = 10) => {
    return activities.value.slice(0, limit)
  })

  // Get activities by type
  const getActivitiesByType = computed(() => (type: ActivityType, limit: number = 10) => {
    return activities.value
      .filter(activity => activity.type === type)
      .slice(0, limit)
  })

  // Get activities by connection
  const getActivitiesByConnection = computed(() => (connectionId: string, limit: number = 10) => {
    return activities.value
      .filter(activity => activity.connectionId === connectionId)
      .slice(0, limit)
  })

  // Get activities by status
  const getActivitiesByStatus = computed(() => (status: ActivityStatus, limit: number = 10) => {
    return activities.value
      .filter(activity => activity.status === status)
      .slice(0, limit)
  })

  // Clear all activities
  const clearActivities = () => {
    activities.value = []
  }

  // Get activity counts by status
  const activityCounts = computed(() => {
    const counts = {
      success: 0,
      error: 0,
      warning: 0,
      info: 0,
      total: activities.value.length
    }

    activities.value.forEach(activity => {
      counts[activity.status]++
    })

    return counts
  })

  // Helper to format relative time
  const formatRelativeTime = (date: Date): string => {
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) {
      return 'just now'
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60)
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600)
      return `${hours} hour${hours > 1 ? 's' : ''} ago`
    } else {
      const days = Math.floor(diffInSeconds / 86400)
      return `${days} day${days > 1 ? 's' : ''} ago`
    }
  }

  // Helper to get activity icon based on type and status
  const getActivityIcon = (activity: Activity): string => {
    if (activity.status === 'error') return 'AlertCircle'
    if (activity.status === 'warning') return 'AlertTriangle'
    if (activity.status === 'success') return 'CheckCircle'

    switch (activity.type) {
      case 'connection_test':
        return 'Activity'
      case 'schema_comparison':
        return 'GitCompare'
      case 'schema_promotion':
        return 'GitBranch'
      case 'connection_added':
        return 'Plus'
      case 'connection_removed':
        return 'Minus'
      default:
        return 'Info'
    }
  }

  // Helper to get activity color based on status
  const getActivityColor = (status: ActivityStatus): string => {
    switch (status) {
      case 'success':
        return 'text-green-500'
      case 'error':
        return 'text-red-500'
      case 'warning':
        return 'text-yellow-500'
      case 'info':
      default:
        return 'text-blue-500'
    }
  }

  return {
    activities,
    addActivity,
    getRecentActivities,
    getActivitiesByType,
    getActivitiesByConnection,
    getActivitiesByStatus,
    clearActivities,
    activityCounts,
    formatRelativeTime,
    getActivityIcon,
    getActivityColor
  }
}

