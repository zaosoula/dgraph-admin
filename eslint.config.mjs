// Minimal flat config. Uses @nuxt/eslint-config standalone (no Nuxt module),
// so it stays independent of nuxt.config.ts.
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

export default createConfigForNuxt({
  features: {
    // Formatting is not enforced; this config only catches real problems.
    stylistic: false,
  },
})
  .prepend({
    ignores: [
      '.nuxt/**',
      '.output/**',
      '.yarn/**',
      'dist/**',
      'node_modules/**',
      // shadcn-vue generated primitives
      'components/ui/**',
    ],
  })
  .override('nuxt/vue/rules', {
    rules: {
      // The schema diff renders pre-escaped, Prism-highlighted markup.
      'vue/no-v-html': 'off',
      'vue/multi-word-component-names': 'off',
    },
  })
