import { useTheme } from '@/composables/useTheme'

/**
 * Applies the stored colour scheme to <html> on startup, so `dark:` classes
 * are live before the first render rather than only after something happens to
 * call `useTheme()`.
 */
export default defineNuxtPlugin(() => {
  useTheme()
})
