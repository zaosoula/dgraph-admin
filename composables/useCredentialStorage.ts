import { ref } from 'vue'
import {
  removePassphraseAfter,
  encryptObjectWithFallbackKey,
  isVaultLockedError,
  encryptObject,
  decryptObject,
  isPassphraseConfigured,
  isPassphraseUnlocked,
  lockPassphrase,
  removePassphrase,
  setPassphrase,
  unlockWithPassphrase
} from '@/utils/encryption'
import type { ConnectionCredentials } from '@/types/connection'

const storageKey = 'dgraph_admin_credentials'
const sessionStorageKey = 'dgraph_admin_session_credentials'

// Passphrase state is process-wide (the derived key lives in the encryption
// module), so these refs must be shared by every composable instance.
const hasPassphrase = ref(false)
const isUnlocked = ref(false)

export const useCredentialStorage = () => {
  
  // Determine if we should use persistent storage or session storage
  const isPersistent = ref(localStorage.getItem('dgraph_admin_persist_credentials') === 'true')

  // Keep the shared passphrase flags in sync with the encryption module
  hasPassphrase.value = isPassphraseConfigured()
  isUnlocked.value = isPassphraseUnlocked()
  
  // Set persistence preference
  const setPersistence = (persist: boolean) => {
    isPersistent.value = persist
    localStorage.setItem('dgraph_admin_persist_credentials', persist.toString())
    
    // If switching from session to persistent, move credentials
    if (persist) {
      const sessionCreds = sessionStorage.getItem(sessionStorageKey)
      if (sessionCreds) {
        localStorage.setItem(storageKey, sessionCreds)
        sessionStorage.removeItem(sessionStorageKey)
      }
    } 
    // If switching from persistent to session, move credentials
    else {
      const persistentCreds = localStorage.getItem(storageKey)
      if (persistentCreds) {
        sessionStorage.setItem(sessionStorageKey, persistentCreds)
        localStorage.removeItem(storageKey)
      }
    }
  }
  
  // Save credentials for a connection
  const saveCredentials = (connectionId: string, credentials: ConnectionCredentials) => {
    try {
      // Get existing credentials
      const storage = isPersistent.value ? localStorage : sessionStorage
      const key = isPersistent.value ? storageKey : sessionStorageKey
      
      const existingData = storage.getItem(key)
      let allCredentials: Record<string, ConnectionCredentials> = {}
      
      if (existingData) {
        allCredentials = decryptObject<Record<string, ConnectionCredentials>>(existingData)
      }
      
      // Update credentials for this connection
      allCredentials[connectionId] = credentials
      
      // Save back to storage
      storage.setItem(key, encryptObject(allCredentials))
      
      return true
    } catch (error) {
      if (isVaultLockedError(error)) throw error

      console.error('Failed to save credentials:', error)
      return false
    }
  }
  
  // Get credentials for a connection
  const getCredentials = (connectionId: string): ConnectionCredentials | null => {
    try {
      // Try persistent storage first
      const persistentData = localStorage.getItem(storageKey)
      if (persistentData) {
        const allCredentials = decryptObject<Record<string, ConnectionCredentials>>(persistentData)
        if (allCredentials[connectionId]) {
          return allCredentials[connectionId]
        }
      }
      
      // Try session storage next
      const sessionData = sessionStorage.getItem(sessionStorageKey)
      if (sessionData) {
        const allCredentials = decryptObject<Record<string, ConnectionCredentials>>(sessionData)
        if (allCredentials[connectionId]) {
          return allCredentials[connectionId]
        }
      }
      
      return null
    } catch (error) {
      // A locked vault is not the same as "this connection has no credentials".
      // Callers must be able to tell them apart, or they will happily build an
      // unauthenticated client and blame the server for the 401.
      if (isVaultLockedError(error)) throw error

      console.error('Failed to get credentials:', error)
      return null
    }
  }

  // Delete credentials for a connection
  const deleteCredentials = (connectionId: string) => {
    try {
      // Check both storages
      const persistentData = localStorage.getItem(storageKey)
      if (persistentData) {
        const allCredentials = decryptObject<Record<string, ConnectionCredentials>>(persistentData)
        if (allCredentials[connectionId]) {
          delete allCredentials[connectionId]
          localStorage.setItem(storageKey, encryptObject(allCredentials))
        }
      }
      
      const sessionData = sessionStorage.getItem(sessionStorageKey)
      if (sessionData) {
        const allCredentials = decryptObject<Record<string, ConnectionCredentials>>(sessionData)
        if (allCredentials[connectionId]) {
          delete allCredentials[connectionId]
          sessionStorage.setItem(sessionStorageKey, encryptObject(allCredentials))
        }
      }
      
      return true
    } catch (error) {
      if (isVaultLockedError(error)) throw error

      console.error('Failed to delete credentials:', error)
      return false
    }
  }
  
  // Clear all credentials
  const clearAllCredentials = () => {
    try {
      localStorage.removeItem(storageKey)
      sessionStorage.removeItem(sessionStorageKey)
      return true
    } catch (error) {
      console.error('Failed to clear credentials:', error)
      return false
    }
  }
  
  // Read every stored credential bundle, from both storages, under the key
  // currently in use. Used to re-encrypt when the key itself changes.
  const readAllBundles = (): { persistent: Record<string, ConnectionCredentials> | null, session: Record<string, ConnectionCredentials> | null } => {
    const read = (raw: string | null): Record<string, ConnectionCredentials> | null => {
      if (!raw) return null
      try {
        return decryptObject<Record<string, ConnectionCredentials>>(raw)
      } catch (error) {
        // Re-thrown: treating an unreadable bundle as "nothing to migrate"
        // would switch the key while leaving ciphertext under the old one.
        console.error('Failed to read credentials for re-encryption:', error)
        throw error
      }
    }

    return {
      persistent: read(localStorage.getItem(storageKey)),
      session: read(sessionStorage.getItem(sessionStorageKey))
    }
  }

  const writeAllBundles = (
    bundles: { persistent: Record<string, ConnectionCredentials> | null, session: Record<string, ConnectionCredentials> | null },
    { useFallbackKey = false }: { useFallbackKey?: boolean } = {}
  ) => {
    const seal = useFallbackKey ? encryptObjectWithFallbackKey : encryptObject

    if (bundles.persistent) {
      localStorage.setItem(storageKey, seal(bundles.persistent))
    }
    if (bundles.session) {
      sessionStorage.setItem(sessionStorageKey, seal(bundles.session))
    }
  }

  /**
   * Turn on passphrase-derived encryption. Existing credentials are read under
   * the old key and written back under the new one, so nothing is lost.
   */
  const enablePassphrase = (passphrase: string): boolean => {
    if (!passphrase) return false

    try {
      const bundles = readAllBundles()

      if (!setPassphrase(passphrase)) return false

      writeAllBundles(bundles)
      hasPassphrase.value = true
      isUnlocked.value = true
      return true
    } catch (error) {
      console.error('Failed to enable passphrase:', error)
      return false
    }
  }

  /**
   * Supply the passphrase for an already-configured session. Returns false if
   * the passphrase does not match the stored verifier.
   */
  const unlockPassphrase = (passphrase: string): boolean => {
    const unlocked = unlockWithPassphrase(passphrase)
    isUnlocked.value = unlocked
    return unlocked
  }

  /**
   * Go back to the default (key-beside-the-ciphertext) mode. Requires the
   * session to be unlocked, otherwise the existing credentials cannot be read
   * back and would be orphaned.
   */
  const disablePassphrase = (): boolean => {
    if (hasPassphrase.value && !isPassphraseUnlocked()) return false

    try {
      const bundles = readAllBundles()

      // Write under the fallback key first; the salt and verifier are dropped
      // only once that has succeeded.
      removePassphraseAfter(() => writeAllBundles(bundles, { useFallbackKey: true }))

      hasPassphrase.value = false
      isUnlocked.value = false
      return true
    } catch (error) {
      console.error('Failed to disable passphrase:', error)
      return false
    }
  }

  /**
   * Forget the derived key for this session without disabling passphrase mode.
   */
  const lockCredentials = () => {
    lockPassphrase()
    isUnlocked.value = false
  }

  return {
    isPersistent,
    hasPassphrase,
    isUnlocked,
    setPersistence,
    saveCredentials,
    getCredentials,
    deleteCredentials,
    clearAllCredentials,
    enablePassphrase,
    unlockPassphrase,
    disablePassphrase,
    lockCredentials
  }
}

