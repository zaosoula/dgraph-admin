import { ref } from 'vue'
import { encrypt, decrypt, encryptObject, decryptObject } from '@/utils/encryption'
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
    deleteCredentials,
    clearAllCredentials
  }
}

