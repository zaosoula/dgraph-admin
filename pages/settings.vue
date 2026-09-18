<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCredentialStorage } from '@/composables/useCredentialStorage'
import { useToast } from '@/components/ui/toast'
import { ShieldCheck, ShieldAlert, Lock } from 'lucide-vue-next'

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

// Passphrase state
const passphrase = ref('')
const passphraseConfirm = ref('')
const passphraseError = ref('')
const passphraseNotice = ref('')
const isDerivingKey = ref(false)
const showRemovePassphraseConfirm = ref(false)

const hasPassphrase = computed(() => credentialStorage.hasPassphrase.value)
const isUnlocked = computed(() => credentialStorage.isUnlocked.value)
const isPersistent = computed(() => credentialStorage.isPersistent.value)

// How protected the stored credentials actually are, said plainly
const protectionLevel = computed(() => {
  if (hasPassphrase.value) {
    return {
      tone: isUnlocked.value ? ('success' as const) : ('warning' as const),
      icon: isUnlocked.value ? ShieldCheck : Lock,
      title: isUnlocked.value
        ? 'Encrypted with your passphrase, unlocked for this session'
        : 'Encrypted with your passphrase, locked',
      body: isUnlocked.value
        ? 'The key lives in memory only. Nothing on disk can rebuild it.'
        : 'Enter your passphrase to use the stored credentials again.'
    }
  }

  return {
    tone: 'warning' as const,
    icon: ShieldAlert,
    title: 'Obfuscated, not encrypted',
    body: 'The key sits in this browser’s storage next to the data, so any script on this origin can recover the credentials. Set a passphrase, or keep storage session-only.'
  }
})

// Toggle persistence
const togglePersistence = () => {
  credentialStorage.setPersistence(!credentialStorage.isPersistent.value)
}

const resetPassphraseForm = () => {
  passphrase.value = ''
  passphraseConfirm.value = ''
  passphraseError.value = ''
}

// Key derivation is deliberately slow; let the DOM paint the pending state first
const runAfterPaint = (work: () => void) => {
  isDerivingKey.value = true
  setTimeout(() => {
    try {
      work()
    } finally {
      isDerivingKey.value = false
    }
  }, 0)
}

// Set a new passphrase
const setPassphrase = () => {
  passphraseError.value = ''
  passphraseNotice.value = ''

  if (passphrase.value.length < 8) {
    passphraseError.value = 'Passphrase must be at least 8 characters'
    return
  }

  if (passphrase.value !== passphraseConfirm.value) {
    passphraseError.value = 'Passphrases do not match'
    return
  }

  runAfterPaint(() => {
    const success = credentialStorage.enablePassphrase(passphrase.value)

    if (success) {
      resetPassphraseForm()
      passphraseNotice.value = 'Passphrase set. You will be asked for it once per browser session.'
      toast.success('Passphrase set', 'Stored credentials are now encrypted with a key held in memory only.')
    } else {
      passphraseError.value = 'Failed to set the passphrase. Your credentials were left unchanged.'
    }
  })
}

// Unlock an existing passphrase for this session
const unlockPassphrase = () => {
  passphraseError.value = ''
  passphraseNotice.value = ''

  if (!passphrase.value) {
    passphraseError.value = 'Enter your passphrase'
    return
  }

  runAfterPaint(() => {
    const success = credentialStorage.unlockPassphrase(passphrase.value)

    if (success) {
      resetPassphraseForm()
      passphraseNotice.value = 'Credentials unlocked for this session.'
      toast.success('Credentials unlocked')
    } else {
      passphraseError.value = 'That passphrase does not match the one used to store these credentials.'
    }
  })
}

// Lock without removing the passphrase
const lockCredentials = () => {
  credentialStorage.lockCredentials()
  passphraseNotice.value = 'Credentials locked. Enter your passphrase to use them again.'
  toast.info('Credentials locked')
}

// Remove the passphrase and fall back to the default obfuscation
const removePassphrase = () => {
  passphraseError.value = ''
  passphraseNotice.value = ''
  showRemovePassphraseConfirm.value = false

  const success = credentialStorage.disablePassphrase()

  if (success) {
    passphraseNotice.value = 'Passphrase removed. Credentials are stored with the default obfuscation again.'
    toast.warning('Passphrase removed', 'Credentials are obfuscated with a key kept in this browser again.')
  } else {
    passphraseError.value = 'Unlock your credentials first, otherwise removing the passphrase would make them unreadable.'
  }
}

// Clear all credentials
const confirmClearCredentials = () => {
  showClearConfirm.value = true
}

const clearAllCredentials = () => {
  const success = credentialStorage.clearAllCredentials()
  showClearConfirm.value = false

  if (success) {
    toast.success('All credentials cleared', 'Connections are kept; you will need to re-enter their secrets.')
  } else {
    toast.danger('Could not clear credentials', 'Nothing was removed.')
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
          class="flex items-start gap-3 rounded-lg border px-4 py-3.5"
          :class="
            protectionLevel.tone === 'success'
              ? 'border-success-border bg-success-subtle'
              : 'border-warning-border bg-warning-subtle'
          "
        >
          <component
            :is="protectionLevel.icon"
            class="mt-0.5 h-4 w-4 shrink-0"
            :class="protectionLevel.tone === 'success' ? 'text-success' : 'text-warning'"
          />
          <div class="min-w-0">
            <p
              class="text-[13px] font-medium"
              :class="protectionLevel.tone === 'success' ? 'text-success' : 'text-warning'"
            >
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

          <!-- Passphrase -->
          <div class="space-y-3 border-t border-border px-4 py-3.5">
            <div>
              <h3 class="text-[13px] font-medium">Encryption passphrase</h3>
              <p class="mt-0.5 max-w-prose text-xs leading-5 text-muted-foreground">
                Optional. Derives the encryption key from a passphrase you type and keeps
                it in memory for the session only, so nothing written to disk can rebuild
                it. You are asked for it once per browser session.
              </p>
            </div>

            <div v-if="hasPassphrase && isUnlocked" class="flex flex-wrap gap-2">
              <UiButton variant="outline" size="sm" @click="lockCredentials">
                Lock now
              </UiButton>
              <UiButton
                variant="outline"
                size="sm"
                @click="showRemovePassphraseConfirm = true"
              >
                Remove passphrase
              </UiButton>
            </div>

            <div v-else class="max-w-sm space-y-2">
              <UiInput
                v-model="passphrase"
                type="password"
                autocomplete="off"
                :aria-invalid="!!passphraseError"
                :placeholder="hasPassphrase ? 'Passphrase' : 'New passphrase (at least 8 characters)'"
              />

              <UiInput
                v-if="!hasPassphrase"
                v-model="passphraseConfirm"
                type="password"
                autocomplete="off"
                placeholder="Confirm passphrase"
              />

              <UiButton
                size="sm"
                :disabled="isDerivingKey"
                @click="hasPassphrase ? unlockPassphrase() : setPassphrase()"
              >
                {{ isDerivingKey ? 'Working…' : hasPassphrase ? 'Unlock' : 'Set passphrase' }}
              </UiButton>

              <p v-if="!hasPassphrase" class="text-xs leading-5 text-muted-foreground">
                There is no recovery if you forget it — you would have to clear the stored
                credentials and enter them again.
              </p>
            </div>

            <p v-if="passphraseError" class="text-xs leading-5 text-danger">
              {{ passphraseError }}
            </p>
            <p v-else-if="passphraseNotice" class="text-xs leading-5 text-muted-foreground">
              {{ passphraseNotice }}
            </p>
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
              Stored credentials are obfuscated, not securely encrypted, unless you set an
              encryption passphrase: without one the key lives in this browser’s storage
              beside the data.
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

    <!-- Remove passphrase confirmation -->
    <UiDialog v-model:open="showRemovePassphraseConfirm">
      <UiDialogContent class="max-w-md">
        <UiDialogHeader>
          <UiDialogTitle>Remove the encryption passphrase?</UiDialogTitle>
          <UiDialogDescription>
            Stored credentials are re-encrypted with a key kept in this browser’s storage,
            so anything that can read the storage can read them again.
          </UiDialogDescription>
        </UiDialogHeader>

        <UiDialogFooter>
          <UiButton variant="outline" size="sm" @click="showRemovePassphraseConfirm = false">
            Cancel
          </UiButton>
          <UiButton variant="destructive" size="sm" @click="removePassphrase">
            Remove passphrase
          </UiButton>
        </UiDialogFooter>
      </UiDialogContent>
    </UiDialog>
  </div>
</template>
