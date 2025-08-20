// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: [
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt'
  ],
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
  }
})

