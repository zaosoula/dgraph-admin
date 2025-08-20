import CryptoJS from 'crypto-js'

// Generate a random encryption key if not already stored
const getEncryptionKey = (): string => {
  const storedKey = localStorage.getItem('dgraph_admin_encryption_key')
  
  if (storedKey) {
    return storedKey
  }
  
  // Generate a new random key
  const newKey = CryptoJS.lib.WordArray.random(16).toString()
  localStorage.setItem('dgraph_admin_encryption_key', newKey)
  
  return newKey
}

// Encrypt data
export const encrypt = (data: string): string => {
  const key = getEncryptionKey()
  return CryptoJS.AES.encrypt(data, key).toString()
}

// Decrypt data
export const decrypt = (encryptedData: string): string => {
  const key = getEncryptionKey()
  const bytes = CryptoJS.AES.decrypt(encryptedData, key)
  return bytes.toString(CryptoJS.enc.Utf8)
}

// Encrypt an object
export const encryptObject = <T>(obj: T): string => {
  return encrypt(JSON.stringify(obj))
}

// Decrypt an object
export const decryptObject = <T>(encryptedData: string): T => {
  const decrypted = decrypt(encryptedData)
  return JSON.parse(decrypted) as T
}

