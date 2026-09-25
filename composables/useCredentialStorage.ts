import { ref } from 'vue'
import { encryptObject, decryptObject } from '@/utils/encryption'
import type { ConnectionCredentials } from '@/types/connection'

export const useCredentialStorage = () => {
  const storageKey = 'dgraph_admin_credentials'
  const sessionStorageKey = 'dgraph_admin_session_credentials'
  
  // Determine if we should use persistent storage or session storage
  const isPersistent = ref(localStorage.getItem('dgraph_admin_persist_credentials') === 'true')
  
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
      console.error('Failed to save credentials:', error)
      return false
    }
  }
  
  // Decrypt one storage blob. Returns null when nothing is stored, and throws
  // when a blob exists but cannot be read, so callers can tell "no credentials"
  // apart from "credentials present but unreadable".
  const readAll = (raw: string | null): Record<string, ConnectionCredentials> | null => {
    if (!raw) return null

    try {
      return decryptObject<Record<string, ConnectionCredentials>>(raw)
    } catch {
      throw new Error(
        'Stored credentials could not be read: the browser key that protects them is missing or has changed.'
      )
    }
  }

  /**
   * Credentials for a connection, or null when none are stored.
   *
   * Throws when a stored blob cannot be decrypted. Callers that send requests
   * must use this variant: falling back to an empty credential block would put
   * unauthenticated traffic on the wire.
   */
  const getCredentialsStrict = (connectionId: string): ConnectionCredentials | null => {
    const persistent = readAll(localStorage.getItem(storageKey))
    if (persistent?.[connectionId]) {
      return persistent[connectionId]
    }

    const session = readAll(sessionStorage.getItem(sessionStorageKey))
    if (session?.[connectionId]) {
      return session[connectionId]
    }

    return null
  }

  // Forgiving variant for UI paths that can carry on without credentials
  // (pre-filling the edit form, building an export copy).
  const getCredentials = (connectionId: string): ConnectionCredentials | null => {
    try {
      return getCredentialsStrict(connectionId)
    } catch (error) {
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
          const { [connectionId]: _removed, ...remaining } = allCredentials
          localStorage.setItem(storageKey, encryptObject(remaining))
        }
      }
      
      const sessionData = sessionStorage.getItem(sessionStorageKey)
      if (sessionData) {
        const allCredentials = decryptObject<Record<string, ConnectionCredentials>>(sessionData)
        if (allCredentials[connectionId]) {
          const { [connectionId]: _removed, ...remaining } = allCredentials
          sessionStorage.setItem(sessionStorageKey, encryptObject(remaining))
        }
      }
      
      return true
    } catch (error) {
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
  
  return {
    isPersistent,
    setPersistence,
    saveCredentials,
    getCredentials,
    getCredentialsStrict,
    deleteCredentials,
    clearAllCredentials
  }
}

