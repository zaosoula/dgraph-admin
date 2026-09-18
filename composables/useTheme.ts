import { useDark, useToggle } from '@vueuse/core'

/**
 * Colour scheme state, shared by every caller.
 *
 * `assets/css/tailwind.css` declares `@custom-variant dark (&:is(.dark *))`, so
 * every `dark:` class in the app depends on `.dark` being present on <html>.
 * `useDark` adds and removes it, and persists the choice in localStorage.
 *
 * Declared at module scope on purpose: a second caller must observe the same
 * state, not a fresh copy.
 */
const isDark = useDark({
  storageKey: 'dgraph_admin_color_scheme'
})

const toggleDark = useToggle(isDark)

export function useTheme() {
  return {
    isDark,
    toggleDark
  }
}
