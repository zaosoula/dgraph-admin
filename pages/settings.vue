<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCredentialStorage } from '@/composables/useCredentialStorage'
import { useToast } from '@/components/ui/toast'
import { ShieldAlert } from 'lucide-vue-next'

useHead({
  title: 'Dgraph Admin - Settings',
  meta: [
    { name: 'description', content: 'Configure your Dgraph Admin settings' }
  ]
})

const credentialStorage = useCredentialStorage()
const toast = useToast()

// UI state
const showClearConfirm = ref(false)

const isPersistent = computed(() => credentialStorage.isPersistent.value)

// How protected the stored credentials actually are, said plainly
const protectionLevel = computed(() => ({
  icon: ShieldAlert,
  title: 'Obfuscated, not encrypted',
  body: isPersistent.value
    ? 'The key sits in this browser\u2019s storage next to the data, so any script on this origin can recover the credentials. Keep storage session-only for production instances.'
    : 'Credentials are kept for this browser session only and the key sits beside them, so any script on this origin can recover them while the tab is open.'
}))

// Toggle persistence
const togglePersistence = () => {
  credentialStorage.setPersistence(!credentialStorage.isPersistent.value)
}

// Clear all credentials
const confirmClearCredentials = () => {
  showClearConfirm.value = true
}

const clearAllCredentials = () => {
  const success = credentialStorage.clearAllCredentials()
  showClearConfirm.value = false

  if (success) {
    toast.success('Credentials cleared', 'Every stored credential was removed from this browser.')
  } else {
    toast.danger('Could not clear credentials', 'Check your browser storage settings and try again.')
  }
}
</script>

<template>
  <div class="space-y-5">
    <header>
      <h1 class="text-xl font-semibold tracking-tight">Settings</h1>
      <p class="mt-0.5 text-xs text-muted-foreground">
        How this browser keeps the credentials for your connections.
      </p>
    </header>

    <div class="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div class="space-y-5">
        <!-- Current protection -->
        <section
          class="flex items-start gap-3 rounded-lg border border-warning-border bg-warning-subtle px-4 py-3.5"
        >
          <component
            :is="protectionLevel.icon"
            class="mt-0.5 h-4 w-4 shrink-0 text-warning"
          />
          <div class="min-w-0">
            <p class="text-[13px] font-medium text-warning">
              {{ protectionLevel.title }}
            </p>
            <p class="mt-0.5 max-w-prose text-xs leading-5 text-foreground/80">
              {{ protectionLevel.body }}
            </p>
          </div>
        </section>

        <!-- Storage -->
        <section class="rounded-lg border border-border bg-card">
          <div class="border-b border-border px-4 py-3">
            <h2 class="text-[13px] font-semibold tracking-tight">Credential storage</h2>
            <p class="mt-0.5 text-xs text-muted-foreground">
              Credentials stay in this browser and are only ever sent to the Dgraph
              endpoints you configure.
            </p>
          </div>

          <div class="flex items-start justify-between gap-4 px-4 py-3.5">
            <div class="min-w-0">
              <h3 class="text-[13px] font-medium">Keep credentials after I close the tab</h3>
              <p class="mt-0.5 max-w-prose text-xs leading-5 text-muted-foreground">
                On, they are written to this browser’s storage until you clear them. Off,
                they live in memory for this tab only — the safer choice for production
                credentials.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              :aria-checked="isPersistent"
              aria-label="Keep credentials after I close the tab"
              class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors"
              :class="isPersistent ? 'border-primary bg-primary' : 'border-border bg-muted'"
              @click="togglePersistence"
            >
              <span
                class="inline-block h-3.5 w-3.5 rounded-full bg-card shadow-sm transition-transform"
                :class="isPersistent ? 'translate-x-[1.125rem]' : 'translate-x-0.5'"
              />
            </button>
          </div>

          <!-- Clear -->
          <div class="border-t border-border px-4 py-3.5">
            <h3 class="text-[13px] font-medium">Clear stored credentials</h3>
            <p class="mt-0.5 max-w-prose text-xs leading-5 text-muted-foreground">
              Removes every password, token and API key from this browser. The connections
              themselves are kept.
            </p>
            <UiButton
              variant="outline"
              size="sm"
              class="mt-3 text-danger hover:bg-danger-subtle hover:text-danger"
              @click="confirmClearCredentials"
            >
              Clear all credentials
            </UiButton>
          </div>
        </section>
      </div>

      <!-- About -->
      <section class="h-fit rounded-lg border border-border bg-card">
        <div class="border-b border-border px-4 py-3">
          <h2 class="text-[13px] font-semibold tracking-tight">About Dgraph Admin</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            A browser-only admin interface for Dgraph instances.
          </p>
        </div>

        <div class="border-b border-border px-4 py-3.5">
          <h3 class="text-[13px] font-medium">What it does</h3>
          <ul class="mt-1.5 space-y-1 text-xs leading-5 text-muted-foreground">
            <li>Manages several Dgraph connections side by side</li>
            <li>Reads and writes the GraphQL schema with syntax highlighting</li>
            <li>Keeps a version history per connection and diffs against it</li>
            <li>Promotes a development schema to its linked production database</li>
          </ul>
        </div>

        <div class="px-4 py-3.5">
          <h3 class="text-[13px] font-medium">What it does not do</h3>
          <div class="mt-1.5 space-y-2 text-xs leading-5 text-muted-foreground">
            <p>
              Nothing leaves this browser except requests to the Dgraph endpoints you
              configure. There is no server and no account.
            </p>
            <p>
              Stored credentials are obfuscated, not securely encrypted: the key lives in
              this browser’s storage beside the data, so any script running on this origin
              can recover them. Prefer session-only storage for production instances.
            </p>
            <p>
              Exporting connections writes a plaintext JSON file. Credentials are left out
              unless you opt in at export time.
            </p>
          </div>
        </div>
      </section>
    </div>

    <!-- Clear credentials confirmation -->
    <UiDialog v-model:open="showClearConfirm">
      <UiDialogContent class="max-w-md">
        <UiDialogHeader>
          <UiDialogTitle>Clear every stored credential?</UiDialogTitle>
          <UiDialogDescription>
            Passwords, tokens and API keys for all connections are removed from this
            browser. The connections themselves are kept, but you will have to enter their
            secrets again. This cannot be undone.
          </UiDialogDescription>
        </UiDialogHeader>

        <UiDialogFooter>
          <UiButton variant="outline" size="sm" @click="showClearConfirm = false">
            Cancel
          </UiButton>
          <UiButton variant="destructive" size="sm" @click="clearAllCredentials">
            Clear all credentials
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>

  </div>
</template>
