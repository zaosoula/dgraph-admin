// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: true },
  compatibilityDate: '2025-08-20',
  modules: ['@nuxtjs/tailwindcss', '@pinia/nuxt', 'shadcn-nuxt'],
  typescript: {
    strict: true
  },
  css: ['~/assets/css/tailwind.css'],
  app: {
    head: {
      title: 'Dgraph Admin',
      meta: [
        { name: 'description', content: 'Admin interface for managing Dgraph instances' }
      ]
    }
  },
})
