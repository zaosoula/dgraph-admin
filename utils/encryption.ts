import CryptoJS from 'crypto-js'

/**
 * Credential obfuscation for the browser.
 *
 * A random key is generated once and kept in `localStorage` next to the
 * ciphertext. This is obfuscation, not encryption — any script running on this
 * origin can read the key and therefore the credentials. It only keeps
 * plaintext secrets out of a casual glance at storage.
 *
 * Anything stronger has to keep key material out of storage entirely, which
 * means asking the user for it on every page load. See the Security section of
 * the README for what this does and does not protect against.
 */

const KEY_STORAGE_KEY = 'dgraph_admin_encryption_key'

// Generate (or reuse) the random key kept beside the ciphertext.
const getEncryptionKey = (): string => {
  const storedKey = localStorage.getItem(KEY_STORAGE_KEY)

  if (storedKey) {
    return storedKey
  }

  const newKey = CryptoJS.lib.WordArray.random(16).toString()
  localStorage.setItem(KEY_STORAGE_KEY, newKey)

  return newKey
}

export const encrypt = (data: string): string => {
  return CryptoJS.AES.encrypt(data, getEncryptionKey()).toString()
}

export const decrypt = (encryptedData: string): string => {
  const bytes = CryptoJS.AES.decrypt(encryptedData, getEncryptionKey())
  return bytes.toString(CryptoJS.enc.Utf8)
}

export const encryptObject = <T>(obj: T): string => {
  return encrypt(JSON.stringify(obj))
}

export const decryptObject = <T>(encryptedData: string): T => {
  return JSON.parse(decrypt(encryptedData)) as T
}
