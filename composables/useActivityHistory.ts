import { computed } from 'vue'
import {
  useActivityStore,
  formatRelativeTime,
  getActivityIcon,
  getActivityColor
} from '@/stores/activity'
import type { Activity, ActivityStatus, ActivityType } from '@/stores/activity'

export type { Activity, ActivityStatus, ActivityType }

/**
 * Thin wrapper over the activity Pinia store.
 *
 * The state used to live inside this factory, which meant every caller got its
 * own empty list and the dashboard feed could never show anything. All state now
 * lives in `stores/activity.ts`; this wrapper only keeps the call sites stable.
 */
export const useActivityHistory = () => {
  const store = useActivityStore()

  return {
    activities: computed(() => store.activities),
    addActivity: store.addActivity,
    getRecentActivities: computed(() => store.getRecentActivities),
    getActivitiesByType: computed(() => store.getActivitiesByType),
    getActivitiesByConnection: computed(() => store.getActivitiesByConnection),
    getActivitiesByStatus: computed(() => store.getActivitiesByStatus),
    clearActivities: store.clearActivities,
    activityCounts: computed(() => store.activityCounts),
    formatRelativeTime,
    getActivityIcon,
    getActivityColor
  }
}
