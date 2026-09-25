import { defineStore } from 'pinia'
import { ref } from 'vue'

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

const STORAGE_KEY_ACTIVITY = 'dgraph_admin_activity'

const MAX_ACTIVITIES = 25 // Reduced to prevent memory issues

type StoredActivity = Omit<Activity, 'timestamp'> & { timestamp: string }

// Helper to format relative time
export const formatRelativeTime = (date: Date): string => {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - new Date(date).getTime()) / 1000)

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

export const useActivityStore = defineStore('activity', () => {
  // Shared across every consumer — writers and readers see the same list
  const activities = ref<Activity[]>([])

  // The feed survives a reload, like the connections and the schema history it
  // describes; without this the dashboard looked empty after every refresh.
  const save = () => {
    try {
      const serialized: StoredActivity[] = activities.value.map(activity => ({
        ...activity,
        timestamp: activity.timestamp.toISOString()
      }))
      localStorage.setItem(STORAGE_KEY_ACTIVITY, JSON.stringify(serialized))
    } catch (error) {
      // A full quota must not break the action that was being logged
      console.warn('Failed to persist activity history:', error)
    }
  }

  const load = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_ACTIVITY)
      if (!stored) return

      const parsed = JSON.parse(stored) as StoredActivity[]
      activities.value = parsed
        .slice(0, MAX_ACTIVITIES)
        .map(activity => ({ ...activity, timestamp: new Date(activity.timestamp) }))
    } catch (error) {
      console.error('Failed to load activity history:', error)
    }
  }

  if (import.meta.client) {
    load()
  }

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

    save()
  }

  // Get recent activities (default: last 10)
  const getRecentActivities = (limit: number = 10) => activities.value.slice(0, limit)

  // Clear all activities
  const clearActivities = () => {
    activities.value = []
    save()
  }

  return {
    activities,
    addActivity,
    getRecentActivities,
    clearActivities
  }
})
