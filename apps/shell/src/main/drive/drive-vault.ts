import { readFile, unlink } from 'node:fs/promises'
import type { TokenVault } from '@genoffice/google-drive'
import { linuxKeyringSeals, type SafeStorageLike } from '../ai-secrets'
import { atomicWriteFile } from '../atomic-write'

/**
 * The operating system's encryption for one secret (Electron safeStorage:
 * DPAPI on Windows, the keychain on macOS). Injected so tests run without
 * Electron.
 */
export interface SecretCipher {
  available(): boolean
  encrypt(text: string): Buffer
  decrypt(bytes: Buffer): string
}

/**
 * Whether safeStorage really protects the Drive token here. Windows (DPAPI)
 * and macOS (the keychain) do. On Linux without a keyring Chromium reports
 * encryption as available but uses `basic_text`, a key built into the
 * program, so the token would only look sealed: that counts as no encryption.
 */
export function driveTokenSeals(storage: SafeStorageLike, platform: NodeJS.Platform): boolean {
  if (!storage.isEncryptionAvailable()) return false
  if (platform === 'linux') return linuxKeyringSeals(storage)
  return true
}

interface VaultFile {
  version: 1
  /** base64 of the encrypted refresh token */
  token: string
}

/**
 * The Drive refresh token in `google-drive.json` in the data folder, always
 * encrypted. Where encryption is not available nothing is written and the
 * connection lasts only until the app closes (decision 0033): the token can
 * change every Drive file, so it is never kept as plain text.
 */
export function createDriveVault(filePath: string, cipher: SecretCipher): TokenVault {
  return {
    async load() {
      try {
        const raw = JSON.parse(await readFile(filePath, 'utf8')) as Partial<VaultFile>
        if (raw.version !== 1 || typeof raw.token !== 'string' || !cipher.available()) return null
        const token = cipher.decrypt(Buffer.from(raw.token, 'base64'))
        return token || null
      } catch {
        // missing, unreadable, or encrypted by another user or PC
        return null
      }
    },
    async save(refreshToken) {
      if (!cipher.available()) return false
      const file: VaultFile = {
        version: 1,
        token: cipher.encrypt(refreshToken).toString('base64'),
      }
      try {
        await atomicWriteFile(filePath, Buffer.from(JSON.stringify(file), 'utf8'))
        return true
      } catch {
        return false
      }
    },
    async clear() {
      await unlink(filePath).catch(() => {})
    },
  }
}
