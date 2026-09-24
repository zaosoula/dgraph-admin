import CryptoJS from 'crypto-js'

/**
 * Credential obfuscation for the browser.
 *
 * Two modes:
 *
 * 1. Default (no passphrase): a random key is generated once and kept in
 *    `localStorage` next to the ciphertext. This is obfuscation, not
 *    encryption — any script running on this origin can read the key and
 *    therefore the credentials. It only keeps plaintext secrets out of a
 *    casual glance at storage.
 *
 * 2. Passphrase mode: the key is derived from a user-supplied passphrase with
 *    PBKDF2 and held in memory for the lifetime of the page only. Nothing that
 *    can rebuild the key is written to disk, so storage alone is no longer
 *    enough to recover the credentials. Script running on the origin *while
 *    the session is unlocked* can still reach the derived key.
 */

const LEGACY_KEY_STORAGE_KEY = 'dgraph_admin_encryption_key'
const SALT_STORAGE_KEY = 'dgraph_admin_key_salt'
const VERIFIER_STORAGE_KEY = 'dgraph_admin_key_verifier'

const PBKDF2_ITERATIONS = 100_000
const PBKDF2_KEY_SIZE = 256 / 32
const VERIFIER_PLAINTEXT = 'dgraph-admin-passphrase-verifier'

// Derived passphrase key. Memory only — never persisted.
let sessionKey: string | null = null

/**
 * Thrown when a passphrase is configured but no key is held for this session.
 *
 * The derived key is memory-only by design, so this is the normal state after
 * every page load. It must be a refusal rather than a fallback: quietly
 * encrypting under the legacy key would write data the passphrase can never
 * recover, and quietly decrypting under it yields a failure that callers
 * cannot tell apart from "no credentials stored".
 */
export class VaultLockedError extends Error {
  constructor() {
    super('Credentials are locked. Unlock with your passphrase to continue.')
    this.name = 'VaultLockedError'
  }
}

export const isVaultLockedError = (error: unknown): error is VaultLockedError =>
  error instanceof VaultLockedError

// Generate (or reuse) the random key kept beside the ciphertext.
const getFallbackKey = (): string => {
  const storedKey = localStorage.getItem(LEGACY_KEY_STORAGE_KEY)

  if (storedKey) {
    return storedKey
  }

  // Generate a new random key
  const newKey = CryptoJS.lib.WordArray.random(16).toString()
  localStorage.setItem(LEGACY_KEY_STORAGE_KEY, newKey)

  return newKey
}

const getSalt = (): CryptoJS.lib.WordArray => {
  const storedSalt = localStorage.getItem(SALT_STORAGE_KEY)

  if (storedSalt) {
    return CryptoJS.enc.Hex.parse(storedSalt)
  }

  const salt = CryptoJS.lib.WordArray.random(16)
  localStorage.setItem(SALT_STORAGE_KEY, salt.toString(CryptoJS.enc.Hex))

  return salt
}

const deriveKey = (passphrase: string): string => {
  return CryptoJS.PBKDF2(passphrase, getSalt(), {
    keySize: PBKDF2_KEY_SIZE,
    iterations: PBKDF2_ITERATIONS,
    hasher: CryptoJS.algo.SHA256
  }).toString(CryptoJS.enc.Hex)
}

/**
 * The key currently in use for encrypt/decrypt.
 *
 * Refuses rather than falling back when a passphrase is configured but not
 * supplied for this session.
 */
const getEncryptionKey = (): string => {
  if (sessionKey) return sessionKey

  if (isPassphraseConfigured()) {
    throw new VaultLockedError()
  }

  return getFallbackKey()
}

/**
 * True when a passphrase was configured at some point, meaning the stored
 * credentials can only be read once the passphrase is supplied again.
 */
export const isPassphraseConfigured = (): boolean => {
  return localStorage.getItem(VERIFIER_STORAGE_KEY) !== null
}

/**
 * True when a passphrase key is currently held in memory for this session.
 */
export const isPassphraseUnlocked = (): boolean => sessionKey !== null

/**
 * Derive and hold a passphrase key for this session.
 *
 * When a passphrase was configured previously the supplied passphrase is
 * checked against the stored verifier and rejected if it does not match.
 * Returns `false` on mismatch, `true` when the key is now active.
 */
export const unlockWithPassphrase = (passphrase: string): boolean => {
  if (!passphrase) return false

  const candidate = deriveKey(passphrase)
  const verifier = localStorage.getItem(VERIFIER_STORAGE_KEY)

  if (verifier) {
    let decoded = ''
    try {
      decoded = CryptoJS.AES.decrypt(verifier, candidate).toString(CryptoJS.enc.Utf8)
    } catch {
      return false
    }

    if (decoded !== VERIFIER_PLAINTEXT) {
      return false
    }
  }

  sessionKey = candidate
  return true
}

/**
 * Turn on passphrase mode. Callers are responsible for re-encrypting anything
 * already written under the previous key (see `useCredentialStorage`).
 */
export const setPassphrase = (passphrase: string): boolean => {
  if (!passphrase) return false

  const key = deriveKey(passphrase)

  localStorage.setItem(
    VERIFIER_STORAGE_KEY,
    CryptoJS.AES.encrypt(VERIFIER_PLAINTEXT, key).toString()
  )
  sessionKey = key

  return true
}

/**
 * Drop passphrase mode entirely and fall back to the stored random key.
 * Callers are responsible for re-encrypting existing data first.
 */
export const removePassphrase = (): void => {
  sessionKey = null
  localStorage.removeItem(VERIFIER_STORAGE_KEY)
  localStorage.removeItem(SALT_STORAGE_KEY)
}

/**
 * Run `write` with passphrase mode still active, and only drop the salt and
 * verifier once it has succeeded.
 *
 * Destroying them first would be unrecoverable: the salt is the only way to
 * re-derive the key, so a write that fails part-way (a storage quota error,
 * say) would leave passphrase-encrypted ciphertext that the correct
 * passphrase can no longer open.
 */
export const removePassphraseAfter = (write: () => void): void => {
  // `write` is expected to encrypt under the fallback key explicitly
  // (see `encryptObjectWithFallbackKey`), so no global key state is disturbed
  // and a throw leaves passphrase mode exactly as it was.
  write()
  removePassphrase()
}

/**
 * Forget the derived key without disabling passphrase mode. The passphrase is
 * required again before stored credentials can be read.
 */
export const lockPassphrase = (): void => {
  sessionKey = null
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

/**
 * Encrypt under the stored random key, whatever the session key is.
 *
 * Used when leaving passphrase mode: the data has to land under the key that
 * will still be available afterwards, and it must do so *before* the salt is
 * discarded.
 */
export const encryptObjectWithFallbackKey = <T>(obj: T): string => {
  return CryptoJS.AES.encrypt(JSON.stringify(obj), getFallbackKey()).toString()
}
