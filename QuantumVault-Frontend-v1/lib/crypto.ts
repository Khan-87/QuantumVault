"use client"

import { MlKem768 } from "mlkem"

// ─── ML-KEM-768 Key Derivation ───────────────────────────────────────────────

/**
 * Deterministically derive an ML-KEM-768 key pair from a 64-byte PBKDF2 seed.
 * The same password + salt will always produce the same key pair.
 */
export async function deriveKyberKeyPair(seed: Uint8Array): Promise<{
  publicKey: Uint8Array
  privateKey: Uint8Array
}> {
  if (seed.length !== 64) {
    throw new Error(`Kyber seed must be 64 bytes, got ${seed.length}`)
  }

  const kem = new MlKem768()
  const [publicKey, privateKey] = await kem.deriveKeyPair(seed)
  return { publicKey, privateKey }
}

// ─── AES-256-GCM File Encryption ─────────────────────────────────────────────

/**
 * Encrypt a file using AES-256-GCM with a random key,
 * then encapsulate the AES key using the Kyber public key.
 *
 * Returns: { ciphertext, wrappedKey, iv }
 */
export async function encryptFile(
  plaintext: ArrayBuffer,
  kyberPublicKey: Uint8Array
): Promise<{
  ciphertext: Uint8Array
  wrappedKey: Uint8Array
  iv: Uint8Array
}> {
  // 1. Generate random AES-256 key
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable so we can wrap it
    ["encrypt"]
  )

  // 2. Generate random 12-byte IV for AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12))

  // 3. Encrypt file content with AES-256-GCM
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    plaintext
  )
  const ciphertext = new Uint8Array(encryptedBuffer)

  // 4. Export raw AES key bytes
  const rawAesKey = new Uint8Array(await crypto.subtle.exportKey("raw", aesKey))

  // 5. Encapsulate AES key using ML-KEM-768 public key
  // ML-KEM encapsulate produces a ciphertext (wrappedKey) and a shared secret
  const kem = new MlKem768()
  const [kyberCiphertext, sharedSecret] = await kem.encap(kyberPublicKey)

  // 6. XOR the AES key with the Kyber shared secret to produce the wrapped key payload
  // The wrappedKey = kyberCiphertext || XOR(aesKey, sharedSecret[0:32])
  const xorMask = new Uint8Array(sharedSecret.slice(0, 32))
  const maskedAesKey = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    maskedAesKey[i] = rawAesKey[i] ^ xorMask[i]
  }

  // Combine: kyberCiphertext + maskedAesKey
  const wrappedKey = new Uint8Array(kyberCiphertext.length + maskedAesKey.length)
  wrappedKey.set(kyberCiphertext, 0)
  wrappedKey.set(maskedAesKey, kyberCiphertext.length)

  return { ciphertext, wrappedKey, iv }
}

// ─── AES-256-GCM File Decryption ─────────────────────────────────────────────

/**
 * Decrypt a file by decapsulating the wrapped AES key using
 * the Kyber private key, then decrypting the ciphertext.
 */
export async function decryptFile(
  ciphertext: Uint8Array,
  wrappedKey: Uint8Array,
  iv: Uint8Array,
  kyberPrivateKey: Uint8Array
): Promise<Uint8Array> {
  // 1. Split wrappedKey into kyberCiphertext + maskedAesKey
  // ML-KEM-768 ciphertext is 1088 bytes
  const KYBER_CT_LEN = 1088
  const kyberCiphertext = wrappedKey.slice(0, KYBER_CT_LEN)
  const maskedAesKey = wrappedKey.slice(KYBER_CT_LEN, KYBER_CT_LEN + 32)

  // 2. Decapsulate to recover shared secret
  const kem = new MlKem768()
  const sharedSecret = await kem.decap(kyberCiphertext, kyberPrivateKey)

  // 3. XOR to recover the raw AES key
  const xorMask = new Uint8Array(sharedSecret.slice(0, 32))
  const rawAesKey = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    rawAesKey[i] = maskedAesKey[i] ^ xorMask[i]
  }

  // 4. Import the recovered AES key
  const aesKey = await crypto.subtle.importKey(
    "raw",
    rawAesKey as unknown as BufferSource,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  )

  // 5. Decrypt the ciphertext with AES-256-GCM
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    aesKey,
    ciphertext as unknown as BufferSource
  )

  return new Uint8Array(decryptedBuffer)
}

// ─── PBKDF2 Derivation Helpers ───────────────────────────────────────────────

/**
 * Derive a 64-byte seed for ML-KEM key pair generation using PBKDF2.
 * Uses info="kyber-seed" context to separate from auth hash derivation.
 */
export async function deriveKyberSeed(password: string, salt: string): Promise<Uint8Array> {
  const enc = new TextEncoder()
  // Add context prefix to salt to domain-separate from auth hash
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode("kyber-seed:" + salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKey,
    512 // 64 bytes for ML-KEM seed
  )

  return new Uint8Array(derivedBits)
}

/**
 * Derive a 32-byte "auth hash" from password+salt using PBKDF2.
 * This hash is sent to the server instead of the raw password.
 * Uses info="auth-hash" context to domain-separate from Kyber seed.
 */
export async function deriveAuthHash(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder()
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode("auth-hash:" + salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKey,
    256 // 32 bytes
  )

  // Encode as hex string for transport
  return Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

// ─── Utility: Uint8Array ↔ Base64 ───────────────────────────────────────────

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
