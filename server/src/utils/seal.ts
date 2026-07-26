import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { env } from '../config.js'

const CURRENT_VERSION = 'v2'

function keyMaterial(secret: string): Buffer {
  return createHash('sha256').update(secret).digest()
}

function decryptPayload(payload: string, secret: string): string {
  const buf = Buffer.from(payload, 'base64url')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const data = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', keyMaterial(secret), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

/** Seal a Mandate/LiteLLM virtual key at rest (AES-256-GCM). */
export function sealSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyMaterial(env.ENCRYPTION_KEY), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${CURRENT_VERSION}.${Buffer.concat([iv, tag, enc]).toString('base64url')}`
}

export function unsealSecret(sealed: string): string {
  const [version, payload] = sealed.split('.', 2)
  if (version === CURRENT_VERSION && payload) {
    return decryptPayload(payload, env.ENCRYPTION_KEY)
  }
  if (!env.LEGACY_ENCRYPTION_KEY) {
    throw new Error('Legacy sealed secret requires LEGACY_ENCRYPTION_KEY')
  }
  return decryptPayload(sealed, env.LEGACY_ENCRYPTION_KEY)
}

export function isLegacySealedSecret(sealed: string): boolean {
  return !sealed.startsWith(`${CURRENT_VERSION}.`)
}
